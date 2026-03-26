from typing import List

from fastapi import APIRouter, HTTPException, Request

from app.db import get_conn
from app.deps import require_admin
from app.schemas import UserIn, UserOut, UserUpdateIn
from app.security import hash_password

router = APIRouter()


@router.get("/users", response_model=List[UserOut])
def list_users(request: Request):
    require_admin(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.user_id, u.name, u.email, u.role_id, r.role_name, u.created_at
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.role_id
                ORDER BY u.created_at DESC, u.user_id DESC
                """
            )
            rows = cur.fetchall()

    return [
        UserOut(
            user_id=row[0],
            name=row[1],
            email=row[2],
            role_id=row[3],
            role_name=row[4],
            created_at=row[5],
        )
        for row in rows
    ]


@router.post("/users")
def create_user(payload: UserIn, request: Request):
    require_admin(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM users WHERE email = %s", (payload.email,))
            if cur.fetchone() is not None:
                raise HTTPException(status_code=400, detail="Email already exists.")

            role_id = payload.role_id
            if role_id is None and payload.role_name:
                cur.execute(
                    """
                    INSERT INTO roles (role_name)
                    VALUES (%s)
                    ON CONFLICT (role_name) DO NOTHING
                    """,
                    (payload.role_name,),
                )
                cur.execute(
                    "SELECT role_id FROM roles WHERE role_name = %s",
                    (payload.role_name,),
                )
                role_row = cur.fetchone()
                role_id = role_row[0] if role_row else None

            if role_id is not None:
                cur.execute("SELECT role_id FROM roles WHERE role_id = %s", (role_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=400, detail="Unknown role_id.")

            cur.execute(
                """
                INSERT INTO users (name, email, password_hash, role_id)
                VALUES (%s, %s, %s, %s)
                RETURNING user_id
                """,
                (
                    payload.name.strip(),
                    payload.email.strip(),
                    hash_password(payload.password),
                    role_id,
                ),
            )
            user_id = cur.fetchone()[0]

    return {"user_id": user_id}


@router.put("/users/{user_id}")
def update_user(user_id: int, payload: UserUpdateIn, request: Request):
    require_admin(request)
    fields_set = payload.model_fields_set
    name = payload.name.strip() if payload.name is not None else None
    email = payload.email.strip() if payload.email is not None else None
    password = payload.password
    role_id = payload.role_id if payload.role_id is not None else None
    role_id_provided = "role_id" in fields_set

    if "name" in fields_set and not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty.")
    if "email" in fields_set and not email:
        raise HTTPException(status_code=400, detail="Email cannot be empty.")

    updates = []
    values = []

    if "name" in fields_set:
        updates.append("name = %s")
        values.append(name)
    if "email" in fields_set:
        updates.append("email = %s")
        values.append(email)
    if role_id_provided:
        updates.append("role_id = %s")
        values.append(role_id)
    if "password" in fields_set and password:
        updates.append("password_hash = %s")
        values.append(hash_password(password))

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM users WHERE user_id = %s", (user_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found.")

            if "email" in fields_set:
                cur.execute(
                    "SELECT user_id FROM users WHERE email = %s AND user_id <> %s",
                    (email, user_id),
                )
                if cur.fetchone() is not None:
                    raise HTTPException(status_code=400, detail="Email already exists.")

            if role_id_provided and role_id is not None:
                cur.execute("SELECT role_id FROM roles WHERE role_id = %s", (role_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=400, detail="Unknown role_id.")

            cur.execute(
                f"""
                UPDATE users
                SET {', '.join(updates)}
                WHERE user_id = %s
                """,
                (*values, user_id),
            )

    return {"status": "updated"}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, request: Request):
    require_admin(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM users WHERE user_id = %s", (user_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found.")

            cur.execute("DELETE FROM users WHERE user_id = %s", (user_id,))

    return {"status": "deleted"}
