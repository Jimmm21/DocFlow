from fastapi import HTTPException, Request

from app.db import get_conn


def require_user_id(request: Request) -> int:
    raw = request.headers.get("x-user-id")
    if not raw:
        raise HTTPException(status_code=400, detail="Missing X-User-Id header.")
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id.")


def require_admin(request: Request) -> int:
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.role_name
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.role_id
                WHERE u.user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="User not found.")
            role_name = row[0]
            if role_name != "Admin":
                raise HTTPException(status_code=403, detail="Admin access required.")
    return user_id
