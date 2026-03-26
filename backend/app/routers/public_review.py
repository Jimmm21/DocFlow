import base64

from fastapi import APIRouter, HTTPException, Request

from app.db import get_conn
from app.google_email import get_sender_email
from app.notifications import create_notification, send_request_status_email, send_review_email
from app.review_links import ensure_review_token_table, get_or_create_token
from app.schemas import ApprovalActionIn, AttachmentOut, RequestDetailOut, RequestStepStatusOut

router = APIRouter()


def _get_token(cur, token: str):
    ensure_review_token_table(cur)
    cur.execute(
        """
        SELECT request_id, step_id, approver_id, expires_at, used_at
        FROM request_review_tokens
        WHERE token = %s
        """,
        (token,),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Invalid review token.")
    return row


def _validate_request_state(cur, request_id: int, step_id: int):
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
    status, current_step = row
    if status != "Pending":
        raise HTTPException(status_code=400, detail="Request is not pending.")
    if current_step != step_id:
        raise HTTPException(status_code=403, detail="This review link is not active.")


def _build_request_detail(cur, request_id: int) -> RequestDetailOut:
    cur.execute(
        """
        SELECT
          r.request_id,
          r.title,
          r.description,
          r.request_type,
          r.status,
          r.workflow_id,
          w.workflow_name,
          r.created_by,
          u.name AS created_by_name,
          r.created_at,
          ws_current.step_name AS current_step_name,
          r.current_step
        FROM requests r
        LEFT JOIN workflows w ON r.workflow_id = w.workflow_id
        LEFT JOIN users u ON r.created_by = u.user_id
        LEFT JOIN workflow_steps ws_current ON r.current_step = ws_current.step_id
        WHERE r.request_id = %s
        """,
        (request_id,),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found.")

    current_step_id = row[11]
    request_status = row[4]

    cur.execute(
        """
        SELECT
          ws.step_id,
          ws.step_name,
          ws.step_order,
          ws.action_type,
          rs.status,
          COALESCE(rs.comments, latest_comment.comments) AS step_comment,
          au.name AS approver_name
        FROM request_steps rs
        LEFT JOIN workflow_steps ws ON rs.step_id = ws.step_id
        LEFT JOIN users au ON rs.approver_id = au.user_id
        LEFT JOIN LATERAL (
          SELECT comments
          FROM approvals a
          WHERE a.request_step_id = rs.request_step_id
          ORDER BY a.created_at DESC
          LIMIT 1
        ) AS latest_comment ON TRUE
        WHERE rs.request_id = %s
        ORDER BY ws.step_order ASC
        """,
        (request_id,),
    )
    step_rows = cur.fetchall()
    steps = []
    for step_row in step_rows:
        step_id = step_row[0]
        if step_id is None:
            continue
        raw_step_status = step_row[4] or "Pending"
        if raw_step_status == "Approved":
            display_status = "Completed"
        elif raw_step_status == "Rejected":
            display_status = "Rejected"
        elif request_status == "Pending" and current_step_id == step_id:
            display_status = "Current"
        else:
            display_status = "Pending"

        steps.append(
            RequestStepStatusOut(
                step_id=step_id,
                step_name=step_row[1],
                step_order=step_row[2],
                action_type=step_row[3],
                status=display_status,
                approver_name=step_row[6],
                comment=step_row[5],
            )
        )

    cur.execute(
        """
        SELECT file_name, content_type, file_data
        FROM request_attachments
        WHERE request_id = %s
        ORDER BY attachment_id ASC
        """,
        (request_id,),
    )
    attachment_rows = cur.fetchall()

    attachments = []
    for attachment_row in attachment_rows:
        file_name, content_type, file_data = attachment_row
        file_bytes = bytes(file_data) if file_data is not None else b""
        encoded = base64.b64encode(file_bytes).decode("utf-8")
        data_url = f"data:{content_type or 'application/octet-stream'};base64,{encoded}"
        attachments.append(
            AttachmentOut(
                name=file_name,
                content_type=content_type,
                data=data_url,
            )
        )

    return RequestDetailOut(
        request_id=row[0],
        title=row[1],
        description=row[2],
        request_type=row[3],
        status=row[4],
        workflow_id=row[5],
        workflow_name=row[6],
        created_by=row[7],
        created_by_name=row[8],
        created_at=row[9],
        current_step_name=row[10],
        current_step_id=row[11],
        steps=steps,
        attachments=attachments,
    )


@router.get("/public/review/{token}", response_model=RequestDetailOut)
def public_review(token: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            request_id, step_id, _approver_id, expires_at, _used_at = _get_token(cur, token)
            cur.execute("SELECT now() > %s", (expires_at,))
            if cur.fetchone()[0]:
                raise HTTPException(status_code=400, detail="Review link expired.")

            _validate_request_state(cur, request_id, step_id)
            return _build_request_detail(cur, request_id)


@router.post("/public/review/{token}/approve")
def public_approve(token: str, payload: ApprovalActionIn | None = None):
    comment = payload.comment.strip() if payload and payload.comment else None
    with get_conn() as conn:
        with conn.cursor() as cur:
            request_id, step_id, approver_id, expires_at, used_at = _get_token(cur, token)
            cur.execute("SELECT now() > %s", (expires_at,))
            if cur.fetchone()[0]:
                raise HTTPException(status_code=400, detail="Review link expired.")
            if used_at is not None:
                raise HTTPException(status_code=400, detail="Review link already used.")

            _validate_request_state(cur, request_id, step_id)

            cur.execute(
                """
                SELECT request_step_id, status
                FROM request_steps
                WHERE request_id = %s AND step_id = %s
                FOR UPDATE
                """,
                (request_id, step_id),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=400, detail="Request step not found.")
            request_step_id, status = row
            if status != "Pending":
                raise HTTPException(status_code=400, detail="Step already actioned.")

            cur.execute(
                """
                UPDATE request_steps
                SET status = 'Approved', approver_id = %s, completed_at = now(), comments = %s
                WHERE request_step_id = %s
                """,
                (approver_id, comment, request_step_id),
            )
            cur.execute(
                """
                INSERT INTO approvals (request_step_id, approver_id, action, comments)
                VALUES (%s, %s, 'Approved', %s)
                """,
                (request_step_id, approver_id, comment),
            )
            cur.execute(
                "UPDATE request_review_tokens SET used_at = now() WHERE token = %s",
                (token,),
            )

            cur.execute(
                """
                SELECT ws.workflow_id, ws.step_order
                FROM workflow_steps ws
                WHERE ws.step_id = %s
                """,
                (step_id,),
            )
            wf_row = cur.fetchone()
            workflow_id = wf_row[0] if wf_row else None
            step_order = wf_row[1] if wf_row else None

            next_step_id = None
            if workflow_id is not None and step_order is not None:
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
                next_row = cur.fetchone()
                if next_row:
                    next_step_id = next_row[0]

            if next_step_id:
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

                if not sender_id or not get_sender_email(cur, sender_id):
                    return {"status": "Pending", "next_step_id": next_step_id}

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
                    next_approver_id, approver_name, approver_email = approver_row
                    next_token = get_or_create_token(cur, request_id, next_step_id, next_approver_id)
                    create_notification(
                        cur,
                        next_approver_id,
                        f'Approval needed for "{request_title}".',
                        request_id,
                    )
                    if sender_id and get_sender_email(cur, sender_id):
                        send_review_email(
                            cur,
                            sender_id,
                            approver_email,
                            approver_name,
                            request_title,
                            workflow_name,
                            next_token,
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
                (approver_id, request_id),
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
                if not get_sender_email(cur, approver_id):
                    return {"status": "Approved"}
                send_request_status_email(
                    cur,
                    approver_id,
                    requester_email,
                    requester_name,
                    approver_name,
                    request_title or "Request",
                    workflow_name,
                    "Approved",
                    comment,
                )
            return {"status": "Approved"}


@router.post("/public/review/{token}/reject")
def public_reject(token: str, payload: ApprovalActionIn | None = None):
    comment = payload.comment.strip() if payload and payload.comment else ""
    if not comment:
        raise HTTPException(status_code=400, detail="Rejection comment is required.")
    with get_conn() as conn:
        with conn.cursor() as cur:
            request_id, step_id, approver_id, expires_at, used_at = _get_token(cur, token)
            cur.execute("SELECT now() > %s", (expires_at,))
            if cur.fetchone()[0]:
                raise HTTPException(status_code=400, detail="Review link expired.")
            if used_at is not None:
                raise HTTPException(status_code=400, detail="Review link already used.")

            _validate_request_state(cur, request_id, step_id)

            cur.execute(
                """
                SELECT request_step_id, status
                FROM request_steps
                WHERE request_id = %s AND step_id = %s
                FOR UPDATE
                """,
                (request_id, step_id),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=400, detail="Request step not found.")
            request_step_id, status = row
            if status != "Pending":
                raise HTTPException(status_code=400, detail="Step already actioned.")

            cur.execute(
                """
                UPDATE request_steps
                SET status = 'Rejected', approver_id = %s, completed_at = now(), comments = %s
                WHERE request_step_id = %s
                """,
                (approver_id, comment, request_step_id),
            )
            cur.execute(
                """
                INSERT INTO approvals (request_step_id, approver_id, action, comments)
                VALUES (%s, %s, 'Rejected', %s)
                """,
                (request_step_id, approver_id, comment),
            )
            cur.execute(
                "UPDATE requests SET status = 'Rejected' WHERE request_id = %s",
                (request_id,),
            )
            cur.execute(
                "UPDATE request_review_tokens SET used_at = now() WHERE token = %s",
                (token,),
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
                (approver_id, request_id),
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
                if not get_sender_email(cur, approver_id):
                    return {"status": "Rejected"}
                send_request_status_email(
                    cur,
                    approver_id,
                    requester_email,
                    requester_name,
                    approver_name,
                    request_title or "Request",
                    workflow_name,
                    "Rejected",
                    comment,
                )

    return {"status": "Rejected"}
