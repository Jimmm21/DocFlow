import base64
from typing import List

import psycopg2
from fastapi import APIRouter, HTTPException, Request

from app.db import get_conn
from app.deps import require_user_id
from app.google_email import get_sender_email
from app.notifications import create_notification, send_review_email
from app.review_links import get_or_create_token
from app.schemas import (
    AttachmentOut,
    RequestDetailOut,
    RequestIn,
    RequestStepStatusOut,
    RequestUpdateIn,
)

router = APIRouter()


@router.get("/requests", response_model=List[RequestDetailOut])
def list_requests(request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
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
                  r.current_step,
                  ws.step_id,
                  ws.step_name,
                  ws.step_order,
                  ws.action_type,
                  rs.status AS step_status,
                  rs.comments AS step_comment,
                  au.name AS approver_name
                FROM requests r
                LEFT JOIN workflows w ON r.workflow_id = w.workflow_id
                LEFT JOIN users u ON r.created_by = u.user_id
                LEFT JOIN workflow_steps ws_current ON r.current_step = ws_current.step_id
                LEFT JOIN request_steps rs ON r.request_id = rs.request_id
                LEFT JOIN workflow_steps ws ON rs.step_id = ws.step_id
                LEFT JOIN users au ON rs.approver_id = au.user_id
                WHERE r.created_by = %s
                ORDER BY r.created_at DESC, r.request_id DESC, ws.step_order ASC
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    requests_map = {}
    for row in rows:
        request_id = row[0]
        if request_id not in requests_map:
            requests_map[request_id] = {
                "request_id": row[0],
                "title": row[1],
                "description": row[2],
                "request_type": row[3],
                "status": row[4],
                "workflow_id": row[5],
                "workflow_name": row[6],
                "created_by": row[7],
                "created_by_name": row[8],
                "created_at": row[9],
                "current_step_name": row[10],
                "current_step_id": row[11],
                "steps": [],
            }

        step_id = row[12]
        if step_id is None:
            continue

        current_step_id = requests_map[request_id]["current_step_id"]
        request_status = requests_map[request_id]["status"]
        raw_step_status = row[16] or "Pending"
        step_comment = row[17]

        if raw_step_status == "Approved":
            display_status = "Completed"
        elif raw_step_status == "Rejected":
            display_status = "Rejected"
        elif request_status == "Pending" and current_step_id == step_id:
            display_status = "Current"
        else:
            display_status = "Pending"

        requests_map[request_id]["steps"].append(
            RequestStepStatusOut(
                step_id=step_id,
                step_name=row[13],
                step_order=row[14],
                action_type=row[15],
                status=display_status,
                approver_name=row[18],
                comment=step_comment,
            )
        )

    return [
        RequestDetailOut(
            request_id=data["request_id"],
            title=data["title"],
            description=data["description"],
            request_type=data["request_type"],
            status=data["status"],
            workflow_id=data["workflow_id"],
            workflow_name=data["workflow_name"],
            created_by=data["created_by"],
            created_by_name=data["created_by_name"],
            created_at=data["created_at"],
            current_step_name=data["current_step_name"],
            current_step_id=data["current_step_id"],
            steps=data["steps"],
        )
        for data in requests_map.values()
    ]


@router.get("/requests/{request_id}", response_model=RequestDetailOut)
def get_request(request_id: int, request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
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

            created_by = row[7]
            if created_by != user_id:
                cur.execute(
                    """
                    SELECT 1
                    FROM request_approvers
                    WHERE request_id = %s AND approver_id = %s
                    LIMIT 1
                    """,
                    (request_id, user_id),
                )
                if cur.fetchone() is None:
                    cur.execute(
                        """
                        SELECT 1
                        FROM request_steps
                        WHERE request_id = %s AND approver_id = %s
                        LIMIT 1
                        """,
                        (request_id, user_id),
                    )
                    if cur.fetchone() is None:
                        raise HTTPException(status_code=403, detail="Not authorized.")

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
                step_comment = step_row[5]
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
                        comment=step_comment,
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


@router.post("/requests")
def create_request(payload: RequestIn, request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT workflow_id FROM workflows WHERE workflow_id = %s AND created_by = %s",
                (payload.workflow_id, user_id),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=400, detail="Unknown workflow_id.")

            cur.execute(
                """
                SELECT step_id, role_id, step_order
                FROM workflow_steps
                WHERE workflow_id = %s
                ORDER BY step_order ASC
                """,
                (payload.workflow_id,),
            )
            step_rows = cur.fetchall()
            if not step_rows:
                raise HTTPException(status_code=400, detail="Workflow has no steps.")

            approver_map = {
                item.step_id: item.approver_id
                for item in (payload.approvers or [])
            }

            step_ids = {row[0] for row in step_rows}
            if any(step_id not in step_ids for step_id in approver_map.keys()):
                raise HTTPException(status_code=400, detail="Unknown workflow step.")

            missing_steps = [
                row[0]
                for row in step_rows
                if row[1] is not None and row[0] not in approver_map
            ]
            if missing_steps:
                raise HTTPException(
                    status_code=400,
                    detail="Approver required for all steps.",
                )

            if approver_map:
                approver_ids = sorted(set(approver_map.values()))
                cur.execute(
                    """
                    SELECT user_id, role_id
                    FROM users
                    WHERE user_id = ANY(%s)
                    """,
                    (approver_ids,),
                )
                user_rows = cur.fetchall()
                user_roles = {row[0]: row[1] for row in user_rows}
                if len(user_roles) != len(approver_ids):
                    raise HTTPException(status_code=400, detail="Unknown approver.")

                for step_id, approver_id in approver_map.items():
                    step_role_id = next((row[1] for row in step_rows if row[0] == step_id), None)
                    if step_role_id is None:
                        continue
                    if user_roles.get(approver_id) != step_role_id:
                        raise HTTPException(
                            status_code=400,
                            detail="Approver does not match required role.",
                        )

            description = payload.description.strip() if payload.description else None
            notes = payload.notes.strip() if payload.notes else None
            if notes:
                description = (
                    f"{description}\n\nNotes:\n{notes}" if description else f"Notes:\n{notes}"
                )

            request_type = payload.request_type.strip() if payload.request_type else "Workflow"

            cur.execute(
                """
                INSERT INTO requests (title, description, request_type, workflow_id, created_by)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING request_id
                """,
                (
                    payload.title.strip(),
                    description,
                    request_type,
                    payload.workflow_id,
                    user_id,
                ),
            )
            request_id = cur.fetchone()[0]

            if step_rows:
                first_step_id = step_rows[0][0]
                cur.execute(
                    "UPDATE requests SET current_step = %s WHERE request_id = %s",
                    (first_step_id, request_id),
                )
                for step_id, _role_id, _order in step_rows:
                    cur.execute(
                        """
                        INSERT INTO request_steps (request_id, step_id, approver_id, status)
                        VALUES (%s, %s, %s, 'Pending')
                        """,
                        (request_id, step_id, approver_map.get(step_id)),
                    )

            attachments = payload.attachments or []
            if attachments:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS request_attachments (
                      attachment_id serial PRIMARY KEY,
                      request_id integer NOT NULL,
                      file_name text NOT NULL,
                      content_type text,
                      file_data bytea NOT NULL,
                      created_at timestamp NOT NULL DEFAULT now(),
                      CONSTRAINT fk_request_attachments_request
                        FOREIGN KEY (request_id)
                        REFERENCES requests(request_id)
                        ON UPDATE CASCADE
                        ON DELETE CASCADE
                    )
                    """
                )
                for attachment in attachments:
                    raw_data = attachment.data
                    if raw_data.startswith("data:") and "," in raw_data:
                        raw_data = raw_data.split(",", 1)[1]
                    file_bytes = base64.b64decode(raw_data)
                    cur.execute(
                        """
                        INSERT INTO request_attachments (request_id, file_name, content_type, file_data)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (
                            request_id,
                            attachment.name,
                            attachment.content_type,
                            psycopg2.Binary(file_bytes),
                        ),
                    )

            if approver_map:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS request_approvers (
                      id serial PRIMARY KEY,
                      request_id integer NOT NULL,
                      step_id integer NOT NULL,
                      approver_id integer NOT NULL,
                      created_at timestamp NOT NULL DEFAULT now(),
                      CONSTRAINT fk_request_approvers_request
                        FOREIGN KEY (request_id)
                        REFERENCES requests(request_id)
                        ON UPDATE CASCADE
                        ON DELETE CASCADE,
                      CONSTRAINT fk_request_approvers_step
                        FOREIGN KEY (step_id)
                        REFERENCES workflow_steps(step_id)
                        ON UPDATE CASCADE
                        ON DELETE CASCADE,
                      CONSTRAINT fk_request_approvers_user
                        FOREIGN KEY (approver_id)
                        REFERENCES users(user_id)
                        ON UPDATE CASCADE
                        ON DELETE CASCADE
                    )
                    """
                )
                for step_id, approver_id in approver_map.items():
                    cur.execute(
                        """
                        INSERT INTO request_approvers (request_id, step_id, approver_id)
                        VALUES (%s, %s, %s)
                        """,
                        (request_id, step_id, approver_id),
                    )

            if approver_map:
                sender_email = get_sender_email(cur, user_id)
                if not sender_email:
                    raise HTTPException(
                        status_code=400,
                        detail="Connect Gmail in Settings to send approval emails.",
                    )
                workflow_name = None
                cur.execute(
                    "SELECT workflow_name FROM workflows WHERE workflow_id = %s",
                    (payload.workflow_id,),
                )
                wf_row = cur.fetchone()
                workflow_name = wf_row[0] if wf_row else None

                cur.execute(
                    """
                    SELECT user_id, name, email
                    FROM users
                    WHERE user_id = ANY(%s)
                    """,
                    (list({*approver_map.values()}),),
                )
                approver_info = {row[0]: (row[1], row[2]) for row in cur.fetchall()}

                first_step_id = step_rows[0][0] if step_rows else None
                for step_id, _role_id, _order in step_rows:
                    approver_id = approver_map.get(step_id)
                    if not approver_id:
                        continue
                    token = get_or_create_token(cur, request_id, step_id, approver_id)
                    if step_id == first_step_id:
                        create_notification(
                            cur,
                            approver_id,
                            f'New request "{payload.title.strip()}" needs your approval.',
                            request_id,
                        )
                        name, email = approver_info.get(approver_id, (None, None))
                        sent = send_review_email(
                            cur,
                            user_id,
                            email,
                            name,
                            payload.title.strip(),
                            workflow_name,
                            token,
                        )
                        if not sent:
                            raise HTTPException(
                                status_code=400,
                                detail="Failed to send approval email. Reconnect Gmail in Settings.",
                            )

    return {"request_id": request_id}


@router.put("/requests/{request_id}")
def update_request(request_id: int, payload: RequestUpdateIn, request: Request):
    user_id = require_user_id(request)
    title = payload.title.strip() if payload.title is not None else None
    description = payload.description.strip() if payload.description is not None else None

    if payload.title is not None and not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty.")
    if payload.description is not None and not description:
        description = None

    if title is None and payload.description is None:
        raise HTTPException(status_code=400, detail="No updates provided.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT created_by, status
                FROM requests
                WHERE request_id = %s
                """,
                (request_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Request not found.")
            created_by, status = row
            if created_by != user_id:
                raise HTTPException(status_code=403, detail="Not authorized.")
            if status != "Pending":
                raise HTTPException(
                    status_code=400,
                    detail="Only pending requests can be edited.",
                )

            cur.execute(
                """
                UPDATE requests
                SET title = COALESCE(%s, title),
                    description = COALESCE(%s, description)
                WHERE request_id = %s
                """,
                (title, description, request_id),
            )

    return {"status": "updated"}


@router.delete("/requests/{request_id}")
def delete_request(request_id: int, request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT created_by, status
                FROM requests
                WHERE request_id = %s
                """,
                (request_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Request not found.")
            created_by, status = row
            if created_by != user_id:
                raise HTTPException(status_code=403, detail="Not authorized.")
            if status != "Pending":
                raise HTTPException(
                    status_code=400,
                    detail="Only pending requests can be cancelled.",
                )

            cur.execute("DELETE FROM requests WHERE request_id = %s", (request_id,))

    return {"status": "deleted"}
