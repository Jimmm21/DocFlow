from fastapi import APIRouter, HTTPException, Request

from app.db import get_conn
from app.deps import require_user_id
from app.schemas import PasswordChangeIn, ProfileOut, ProfileUpdateIn
from app.security import hash_password, verify_password

router = APIRouter()


def _get_verified_email(cur, user_id: int):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS email_integrations (
          integration_id serial PRIMARY KEY,
          user_id integer NOT NULL,
          provider text NOT NULL,
          email text,
          access_token text NOT NULL,
          refresh_token text,
          expires_at timestamp,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now(),
          CONSTRAINT uq_email_integrations_user_provider
            UNIQUE (user_id, provider),
          CONSTRAINT fk_email_integrations_user
            FOREIGN KEY (user_id)
            REFERENCES users(user_id)
            ON UPDATE CASCADE
            ON DELETE CASCADE
        )
        """
    )
    cur.execute(
        """
        SELECT email
        FROM email_integrations
        WHERE user_id = %s AND provider = 'gmail'
        """,
        (user_id,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def _ensure_avatar_column(cur) -> None:
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text")


@router.get("/me", response_model=ProfileOut)
def get_profile(request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_avatar_column(cur)
            cur.execute(
                """
                SELECT u.user_id, u.name, u.email, r.role_name, u.avatar_url
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.role_id
                WHERE u.user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="User not found.")

            verified_email = _get_verified_email(cur, user_id)

    email_value = verified_email or row[2]
    return ProfileOut(
        user_id=row[0],
        name=row[1],
        email=email_value,
        role_name=row[3],
        avatar_url=row[4],
        email_verified=bool(verified_email),
        verified_email=verified_email,
    )


@router.put("/me", response_model=ProfileOut)
def update_profile(payload: ProfileUpdateIn, request: Request):
    user_id = require_user_id(request)
    fields_set = payload.model_fields_set
    name = payload.name.strip() if payload.name is not None else None
    email = payload.email.strip() if payload.email is not None else None
    avatar_url = payload.avatar_url
    if avatar_url is not None and isinstance(avatar_url, str) and not avatar_url.strip():
        avatar_url = None

    if payload.name is not None and not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty.")
    if payload.email is not None and not email:
        raise HTTPException(status_code=400, detail="Email cannot be empty.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            _ensure_avatar_column(cur)
            cur.execute(
                """
                SELECT u.user_id, u.name, u.email, r.role_name, u.avatar_url
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.role_id
                WHERE u.user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="User not found.")

            verified_email = _get_verified_email(cur, user_id)
            email_verified = bool(verified_email)

            updates = []
            values = []

            if name is not None:
                updates.append("name = %s")
                values.append(name)

            if email_verified:
                updates.append("email = %s")
                values.append(verified_email)
            elif email is not None:
                cur.execute(
                    "SELECT user_id FROM users WHERE email = %s AND user_id <> %s",
                    (email, user_id),
                )
                if cur.fetchone() is not None:
                    raise HTTPException(status_code=400, detail="Email already exists.")
                updates.append("email = %s")
                values.append(email)

            if "avatar_url" in fields_set:
                updates.append("avatar_url = %s")
                values.append(avatar_url)

            if updates:
                cur.execute(
                    f"""
                    UPDATE users
                    SET {', '.join(updates)}
                    WHERE user_id = %s
                    """,
                    (*values, user_id),
                )

            cur.execute(
                """
                SELECT u.user_id, u.name, u.email, r.role_name, u.avatar_url
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.role_id
                WHERE u.user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()

    email_value = verified_email or row[2]
    return ProfileOut(
        user_id=row[0],
        name=row[1],
        email=email_value,
        role_name=row[3],
        avatar_url=row[4],
        email_verified=email_verified,
        verified_email=verified_email,
    )


@router.put("/me/password")
def change_password(payload: PasswordChangeIn, request: Request):
    user_id = require_user_id(request)
    current_password = payload.current_password
    new_password = payload.new_password

    if current_password == new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must be different from the current password.",
        )

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password_hash FROM users WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="User not found.")
            if not verify_password(row[0], current_password):
                raise HTTPException(status_code=400, detail="Current password is incorrect.")

            cur.execute(
                "UPDATE users SET password_hash = %s WHERE user_id = %s",
                (hash_password(new_password), user_id),
            )

    return {"status": "updated"}
