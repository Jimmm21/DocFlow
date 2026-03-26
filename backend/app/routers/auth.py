from fastapi import APIRouter, HTTPException

from app.db import get_conn
from app.schemas import LoginIn, LoginOut
from app.security import verify_password

router = APIRouter()


@router.post("/auth/login", response_model=LoginOut)
def login(payload: LoginIn):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text")
            cur.execute(
                """
                SELECT u.user_id, u.name, u.email, u.password_hash, r.role_name, u.avatar_url
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.role_id
                WHERE u.email = %s
                """,
                (payload.email,),
            )
            user_row = cur.fetchone()
            if user_row is None:
                raise HTTPException(status_code=400, detail="Invalid credentials.")

            if not verify_password(user_row[3], payload.password):
                raise HTTPException(status_code=400, detail="Invalid credentials.")

    return LoginOut(
        user_id=user_row[0],
        name=user_row[1],
        email=user_row[2],
        role_name=user_row[4],
        avatar_url=user_row[5],
    )
