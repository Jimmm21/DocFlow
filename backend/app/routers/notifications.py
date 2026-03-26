from typing import List

from fastapi import APIRouter, HTTPException, Request

from app.db import get_conn
from app.deps import require_user_id
from app.schemas import NotificationOut

router = APIRouter()


@router.get("/notifications", response_model=List[NotificationOut])
def list_notifications(request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT notification_id, message, request_id, read_status, created_at
                FROM notifications
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT 50
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    return [
        NotificationOut(
            notification_id=row[0],
            message=row[1],
            request_id=row[2],
            read_status=row[3],
            created_at=row[4],
        )
        for row in rows
    ]


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: int, request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE notifications
                SET read_status = true
                WHERE notification_id = %s AND user_id = %s
                """,
                (notification_id, user_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Notification not found.")
    return {"status": "read"}


@router.post("/notifications/read-all")
def mark_all_read(request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE notifications
                SET read_status = true
                WHERE user_id = %s AND read_status = false
                """,
                (user_id,),
            )
    return {"status": "read"}
