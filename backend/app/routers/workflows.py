from typing import Dict, List

from fastapi import APIRouter, HTTPException, Request

from app.db import get_conn
from app.deps import require_user_id
from app.schemas import ApproverUser, WorkflowIn, WorkflowStepOut, WorkflowSummary

router = APIRouter()


@router.get("/workflows", response_model=List[WorkflowSummary])
def list_workflows(request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  w.workflow_id,
                  w.workflow_name,
                  w.description,
                  w.created_by,
                  w.created_at,
                  u.name AS created_by_name,
                  COUNT(s.step_id) AS steps_count
                FROM workflows w
                LEFT JOIN users u ON w.created_by = u.user_id
                LEFT JOIN workflow_steps s ON w.workflow_id = s.workflow_id
                WHERE w.created_by = %s
                GROUP BY w.workflow_id, w.workflow_name, w.description, w.created_by, w.created_at, u.name
                ORDER BY w.created_at DESC, w.workflow_id DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    return [
        WorkflowSummary(
            workflow_id=row[0],
            workflow_name=row[1],
            description=row[2],
            created_by=row[3],
            created_at=row[4],
            created_by_name=row[5],
            steps_count=row[6] or 0,
        )
        for row in rows
    ]


@router.get("/workflows/{workflow_id}/steps", response_model=List[WorkflowStepOut])
def list_workflow_steps(workflow_id: int, request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT workflow_id
                FROM workflows
                WHERE workflow_id = %s AND created_by = %s
                """,
                (workflow_id, user_id),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Workflow not found.")

            cur.execute(
                """
                SELECT
                  s.step_id,
                  s.step_name,
                  s.role_id,
                  s.step_order,
                  s.action_type,
                  r.role_name
                FROM workflow_steps s
                LEFT JOIN roles r ON s.role_id = r.role_id
                WHERE s.workflow_id = %s
                ORDER BY s.step_order ASC
                """,
                (workflow_id,),
            )
            step_rows = cur.fetchall()

            if not step_rows:
                return []

            role_ids = sorted({row[2] for row in step_rows if row[2] is not None})

            users_by_role: Dict[int, List[ApproverUser]] = {}
            if role_ids:
                cur.execute(
                    """
                    SELECT u.user_id, u.name, u.role_id, r.role_name
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.role_id
                    WHERE u.role_id = ANY(%s)
                    ORDER BY u.name ASC
                    """,
                    (role_ids,),
                )
                for user_row in cur.fetchall():
                    role_id = user_row[2]
                    if role_id is None:
                        continue
                    users_by_role.setdefault(role_id, []).append(
                        ApproverUser(
                            user_id=user_row[0],
                            name=user_row[1],
                            role_id=user_row[2],
                            role_name=user_row[3],
                        )
                    )

    return [
        WorkflowStepOut(
            step_id=row[0],
            step_name=row[1],
            role_id=row[2],
            step_order=row[3],
            action_type=row[4],
            role_name=row[5],
            approvers=users_by_role.get(row[2], []) if row[2] is not None else [],
        )
        for row in step_rows
    ]


@router.post("/workflows")
def create_workflow(payload: WorkflowIn, request: Request):
    user_id = require_user_id(request)
    if not payload.steps:
        raise HTTPException(status_code=400, detail="At least one step is required.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO workflows (workflow_name, description, created_by)
                VALUES (%s, %s, %s)
                RETURNING workflow_id
                """,
                (payload.workflow_name, payload.description, user_id),
            )
            workflow_id = cur.fetchone()[0]

            for idx, step in enumerate(payload.steps, start=1):
                action_type = step.action_type.strip().lower()
                if action_type not in ("approve", "review"):
                    raise HTTPException(status_code=400, detail="Invalid action_type.")

                role_id = None
                if step.role_name:
                    cur.execute(
                        """
                        INSERT INTO roles (role_name)
                        VALUES (%s)
                        ON CONFLICT (role_name) DO NOTHING
                        """,
                        (step.role_name,),
                    )
                    cur.execute(
                        "SELECT role_id FROM roles WHERE role_name = %s",
                        (step.role_name,),
                    )
                    role_row = cur.fetchone()
                    role_id = role_row[0] if role_row else None

                step_order = step.step_order if step.step_order else idx
                cur.execute(
                    """
                    INSERT INTO workflow_steps
                      (workflow_id, step_name, role_id, step_order, action_type)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (workflow_id, step.step_name, role_id, step_order, action_type),
                )

    return {"workflow_id": workflow_id}
