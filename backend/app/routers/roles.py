from typing import List

from fastapi import APIRouter, HTTPException, Request

from app.db import get_conn
from app.deps import require_admin
from app.schemas import RoleIn, RoleOut

router = APIRouter()


@router.get("/roles", response_model=List[RoleOut])
def list_roles():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT role_id, role_name
                FROM roles
                ORDER BY role_name ASC
                """
            )
            rows = cur.fetchall()

    return [RoleOut(role_id=row[0], role_name=row[1]) for row in rows]


@router.post("/roles")
def create_role(payload: RoleIn, request: Request):
    require_admin(request)
    role_name = payload.role_name.strip()
    if not role_name:
        raise HTTPException(status_code=400, detail="Role name is required.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT role_id FROM roles WHERE role_name = %s", (role_name,))
            if cur.fetchone() is not None:
                raise HTTPException(status_code=400, detail="Role already exists.")

            cur.execute(
                """
                INSERT INTO roles (role_name)
                VALUES (%s)
                RETURNING role_id
                """,
                (role_name,),
            )
            role_id = cur.fetchone()[0]

    return {"role_id": role_id}
