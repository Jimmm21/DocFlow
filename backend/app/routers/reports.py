from fastapi import APIRouter, Request

from app.db import get_conn
from app.deps import require_user_id

router = APIRouter()


@router.get("/reports/summary")
def reports_summary(request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH months AS (
                  SELECT date_trunc('month', d)::date AS month
                  FROM generate_series(
                    date_trunc('month', now()) - interval '5 months',
                    date_trunc('month', now()),
                    interval '1 month'
                  ) AS d
                ),
                avg_times AS (
                  SELECT
                    date_trunc('month', updated_at)::date AS month,
                    AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400.0) AS avg_days
                  FROM requests
                  WHERE status IN ('Approved', 'Rejected')
                    AND created_by = %s
                  GROUP BY 1
                )
                SELECT
                  TRIM(to_char(m.month, 'Mon')) AS month_label,
                  COALESCE(ROUND(a.avg_days::numeric, 1), 0) AS avg_days
                FROM months m
                LEFT JOIN avg_times a ON a.month = m.month
                ORDER BY m.month
                """,
                (user_id,),
            )
            time_rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                  COALESCE(ws.step_name, 'Unknown Step') AS step_name,
                  ROUND(
                    AVG(EXTRACT(EPOCH FROM (rs.completed_at - r.created_at)) / 3600.0)::numeric,
                    1
                  ) AS avg_hours
                FROM request_steps rs
                JOIN requests r ON rs.request_id = r.request_id
                LEFT JOIN workflow_steps ws ON rs.step_id = ws.step_id
                WHERE rs.completed_at IS NOT NULL
                  AND r.created_by = %s
                GROUP BY ws.step_name
                ORDER BY avg_hours DESC
                LIMIT 5
                """,
                (user_id,),
            )
            bottleneck_rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                  COALESCE(NULLIF(TRIM(request_type), ''), 'Workflow') AS name,
                  COUNT(*) AS value
                FROM requests
                WHERE created_by = %s
                GROUP BY name
                ORDER BY value DESC, name ASC
                LIMIT 5
                """,
                (user_id,),
            )
            type_rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                  COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE status IN ('Approved', 'Rejected')) AS closed,
                  COUNT(*) FILTER (WHERE status = 'Approved') AS approved
                FROM requests
                WHERE created_by = %s
                """,
                (user_id,),
            )
            totals_row = cur.fetchone() or (0, 0, 0)

    time_data = [{"name": row[0], "time": float(row[1])} for row in time_rows]
    bottlenecks = [{"name": row[0], "delay": float(row[1])} for row in bottleneck_rows]
    requests_by_type = [{"name": row[0], "value": int(row[1])} for row in type_rows]

    total_requests = int(totals_row[0] or 0)
    closed_requests = int(totals_row[1] or 0)
    approved_requests = int(totals_row[2] or 0)
    efficiency_score = (
        round((approved_requests / closed_requests) * 100)
        if closed_requests
        else 0
    )

    if closed_requests == 0:
        efficiency_note = "No completed requests yet."
    elif bottlenecks:
        efficiency_note = f"Top bottleneck: {bottlenecks[0]['name']}."
    else:
        efficiency_note = "Keep up the momentum."

    return {
        "avg_approval_time_by_month": time_data,
        "bottlenecks": bottlenecks,
        "requests_by_type": requests_by_type,
        "efficiency_score": efficiency_score,
        "efficiency_note": efficiency_note,
        "total_requests": total_requests,
        "closed_requests": closed_requests,
    }
