from typing import List

from fastapi import APIRouter, HTTPException, Request

from app.db import get_conn
from app.deps import require_user_id
from app.google_email import get_sender_email
from app.notifications import create_notification, send_request_status_email, send_review_email
from app.review_links import ensure_review_token_table, get_or_create_token
from app.schemas import ApprovalActionIn, PendingApprovalOut

router = APIRouter()


@router.get("/approvals/pending", response_model=List[PendingApprovalOut])
def list_pending_approvals(request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  result.request_id,
                  result.request_title,
                  result.request_creator_name,
                  result.current_step_name,
                  result.workflow_name,
                  result.submitted_at
                FROM (
                  SELECT
                    r.request_id,
                    r.title AS request_title,
                    u.name AS request_creator_name,
                    ws.step_name AS current_step_name,
                    w.workflow_name,
                    r.created_at AS submitted_at
                  FROM request_approvers ra
                  JOIN requests r ON ra.request_id = r.request_id
                  LEFT JOIN users u ON r.created_by = u.user_id
                  LEFT JOIN workflow_steps ws ON r.current_step = ws.step_id
                  LEFT JOIN workflows w ON r.workflow_id = w.workflow_id
                  WHERE ra.approver_id = %s
                    AND r.current_step = ra.step_id
                    AND r.status = 'Pending'

                  UNION

                  SELECT
                    r.request_id,
                    r.title AS request_title,
                    u.name AS request_creator_name,
                    ws.step_name AS current_step_name,
                    w.workflow_name,
                    r.created_at AS submitted_at
                  FROM request_steps rs
                  JOIN requests r ON rs.request_id = r.request_id
                  LEFT JOIN users u ON r.created_by = u.user_id
                  LEFT JOIN workflow_steps ws ON r.current_step = ws.step_id
                  LEFT JOIN workflows w ON r.workflow_id = w.workflow_id
                  WHERE rs.approver_id = %s
                    AND r.current_step = rs.step_id
                    AND r.status = 'Pending'
                ) AS result
                ORDER BY result.submitted_at DESC, result.request_id DESC
                """,
                (user_id, user_id),
            )
            rows = cur.fetchall()

    return [
        PendingApprovalOut(
            request_id=row[0],
            request_title=row[1],
            request_creator_name=row[2],
            current_step_name=row[3],
            workflow_name=row[4],
            submitted_at=row[5],
        )
        for row in rows
    ]


def _get_request_state(cur, request_id: int):
    cur.execute(
        """
        SELECT status, current_step
        FROM requests
        WHERE request_id = %s
        FOR UPDATE
        """,
        (request_id,),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found.")

    status, current_step_id = row
    if status != "Pending":
        raise HTTPException(status_code=400, detail="Request is not pending.")
    if current_step_id is None:
        raise HTTPException(status_code=400, detail="Request has no active step.")

    cur.execute(
        """
        SELECT workflow_id, step_order
        FROM workflow_steps
        WHERE step_id = %s
        """,
        (current_step_id,),
    )
    step_row = cur.fetchone()
    if step_row is None:
        raise HTTPException(status_code=400, detail="Current step not found.")

    workflow_id, step_order = step_row
    return current_step_id, workflow_id, step_order


def _ensure_assigned(cur, request_id: int, step_id: int, user_id: int):
    cur.execute(
        """
        SELECT approver_id
        FROM request_approvers
        WHERE request_id = %s AND step_id = %s
        """,
        (request_id, step_id),
    )
    row = cur.fetchone()
    if row is None:
        cur.execute(
            """
            SELECT approver_id
            FROM request_steps
            WHERE request_id = %s AND step_id = %s
            """,
            (request_id, step_id),
        )
        step_row = cur.fetchone()
        if step_row is None or step_row[0] is None:
            raise HTTPException(status_code=400, detail="Approver not configured for this step.")
        if step_row[0] != user_id:
            raise HTTPException(status_code=403, detail="You are not assigned to this step.")
        return
    if row[0] != user_id:
        raise HTTPException(status_code=403, detail="You are not assigned to this step.")


def _get_request_step(cur, request_id: int, step_id: int, user_id: int):
    cur.execute(
        """
        SELECT request_step_id, status, approver_id
        FROM request_steps
        WHERE request_id = %s AND step_id = %s
        FOR UPDATE
        """,
        (request_id, step_id),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=400, detail="Request step not found.")

    request_step_id, status, approver_id = row
    if status != "Pending":
        raise HTTPException(status_code=400, detail="Step already actioned.")
    if approver_id is not None and approver_id != user_id:
        raise HTTPException(status_code=403, detail="You are not assigned to this step.")

    return request_step_id


def _record_approval(
    cur, request_step_id: int, user_id: int, action: str, comment: str | None
):
    cur.execute(
        """
        UPDATE request_steps
        SET status = %s, approver_id = %s, completed_at = now(), comments = %s
        WHERE request_step_id = %s
        """,
        (action, user_id, comment, request_step_id),
    )
    cur.execute(
        """
        INSERT INTO approvals (request_step_id, approver_id, action, comments)
        VALUES (%s, %s, %s, %s)
        """,
        (request_step_id, user_id, action, comment),
    )


@router.post("/approvals/{request_id}/approve")
def approve_request(
    request_id: int,
    request: Request,
    payload: ApprovalActionIn | None = None,
):
    user_id = require_user_id(request)
    comment = payload.comment.strip() if payload and payload.comment else None
    with get_conn() as conn:
        with conn.cursor() as cur:
            current_step_id, workflow_id, step_order = _get_request_state(cur, request_id)
            _ensure_assigned(cur, request_id, current_step_id, user_id)
            request_step_id = _get_request_step(cur, request_id, current_step_id, user_id)

            _record_approval(cur, request_step_id, user_id, "Approved", comment)
            ensure_review_token_table(cur)
            cur.execute(
                """
                UPDATE request_review_tokens
                SET used_at = now()
                WHERE request_id = %s AND step_id = %s AND approver_id = %s
                """,
                (request_id, current_step_id, user_id),
            )

            cur.execute(
                """
                SELECT step_id
                FROM workflow_steps
                WHERE workflow_id = %s AND step_order > %s
                ORDER BY step_order ASC
                LIMIT 1
                """,
                (workflow_id, step_order),
            )
            next_step = cur.fetchone()
            if next_step:
                next_step_id = next_step[0]
                cur.execute(
                    "UPDATE requests SET current_step = %s WHERE request_id = %s",
                    (next_step_id, request_id),
                )

                cur.execute(
                    """
                    SELECT r.title, r.created_by, w.workflow_name
                    FROM requests r
                    LEFT JOIN workflows w ON r.workflow_id = w.workflow_id
                    WHERE r.request_id = %s
                    """,
                    (request_id,),
                )
                request_row = cur.fetchone()
                request_title = request_row[0] if request_row else "Request"
                sender_id = request_row[1] if request_row else None
                workflow_name = request_row[2] if request_row else None

                cur.execute(
                    """
                    SELECT ra.approver_id, u.name, u.email
                    FROM request_approvers ra
                    LEFT JOIN users u ON ra.approver_id = u.user_id
                    WHERE ra.request_id = %s AND ra.step_id = %s
                    """,
                    (request_id, next_step_id),
                )
                approver_row = cur.fetchone()
                if approver_row:
                    approver_id, approver_name, approver_email = approver_row
                    token = get_or_create_token(cur, request_id, next_step_id, approver_id)
                    create_notification(
                        cur,
                        approver_id,
                        f'Approval needed for "{request_title}".',
                        request_id,
                    )
                    if not sender_id or not get_sender_email(cur, sender_id):
                        return {"status": "Pending", "next_step_id": next_step_id}
                    send_review_email(
                        cur,
                        sender_id,
                        approver_email,
                        approver_name,
                        request_title,
                        workflow_name,
                        token,
                    )

                return {"status": "Pending", "next_step_id": next_step_id}

            cur.execute(
                "UPDATE requests SET status = 'Approved' WHERE request_id = %s",
                (request_id,),
            )
            cur.execute(
                """
                SELECT r.title,
                       r.created_by,
                       creator.name,
                       creator.email,
                       w.workflow_name,
                       approver.name
                FROM requests r
                LEFT JOIN users creator ON r.created_by = creator.user_id
                LEFT JOIN workflows w ON r.workflow_id = w.workflow_id
                LEFT JOIN users approver ON approver.user_id = %s
                WHERE r.request_id = %s
                """,
                (user_id, request_id),
            )
            notify_row = cur.fetchone()
            if notify_row:
                (
                    request_title,
                    _requester_id,
                    requester_name,
                    requester_email,
                    workflow_name,
                    approver_name,
                ) = notify_row
                if _requester_id:
                    create_notification(
                        cur,
                        _requester_id,
                        f'Your request "{request_title or "Request"}" was approved by {approver_name or "an approver"}.',
                        request_id,
                    )
                if not get_sender_email(cur, user_id):
                    return {"status": "Approved"}
                send_request_status_email(
                    cur,
                    user_id,
                    requester_email,
                    requester_name,
                    approver_name,
                    request_title or "Request",
                    workflow_name,
                    "Approved",
                    comment,
                )
            return {"status": "Approved"}


@router.post("/approvals/{request_id}/reject")
def reject_request(
    request_id: int,
    request: Request,
    payload: ApprovalActionIn | None = None,
):
    user_id = require_user_id(request)
    comment = payload.comment.strip() if payload and payload.comment else ""
    if not comment:
        raise HTTPException(status_code=400, detail="Rejection comment is required.")
    with get_conn() as conn:
        with conn.cursor() as cur:
            current_step_id, _workflow_id, _step_order = _get_request_state(cur, request_id)
            _ensure_assigned(cur, request_id, current_step_id, user_id)
            request_step_id = _get_request_step(cur, request_id, current_step_id, user_id)

            _record_approval(cur, request_step_id, user_id, "Rejected", comment)
            ensure_review_token_table(cur)
            cur.execute(
                """
                UPDATE request_review_tokens
                SET used_at = now()
                WHERE request_id = %s AND step_id = %s AND approver_id = %s
                """,
                (request_id, current_step_id, user_id),
            )
            cur.execute(
                "UPDATE requests SET status = 'Rejected' WHERE request_id = %s",
                (request_id,),
            )
            cur.execute(
                """
                SELECT r.title,
                       r.created_by,
                       creator.name,
                       creator.email,
                       w.workflow_name,
                       approver.name
                FROM requests r
                LEFT JOIN users creator ON r.created_by = creator.user_id
                LEFT JOIN workflows w ON r.workflow_id = w.workflow_id
                LEFT JOIN users approver ON approver.user_id = %s
                WHERE r.request_id = %s
                """,
                (user_id, request_id),
            )
            notify_row = cur.fetchone()
            if notify_row:
                (
                    request_title,
                    _requester_id,
                    requester_name,
                    requester_email,
                    workflow_name,
                    approver_name,
                ) = notify_row
                if _requester_id:
                    create_notification(
                        cur,
                        _requester_id,
                        f'Your request "{request_title or "Request"}" was rejected by {approver_name or "an approver"}.',
                        request_id,
                    )
                if not get_sender_email(cur, user_id):
                    return {"status": "Rejected"}
                send_request_status_email(
                    cur,
                    user_id,
                    requester_email,
                    requester_name,
                    approver_name,
                    request_title or "Request",
                    workflow_name,
                    "Rejected",
                    comment,
                )

    return {"status": "Rejected"}
