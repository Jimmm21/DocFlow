import base64
from email.message import EmailMessage
from typing import Optional

import httpx

from app.core.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET


def _ensure_table(cur) -> None:
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


def get_sender_email(cur, user_id: int) -> Optional[str]:
    _ensure_table(cur)
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


def _refresh_access_token(refresh_token: str) -> Optional[tuple[str, int]]:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return None
    response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=20,
    )
    if response.status_code != 200:
        return None
    data = response.json()
    access_token = data.get("access_token")
    expires_in = int(data.get("expires_in") or 0)
    if not access_token:
        return None
    return access_token, expires_in


def _get_tokens(cur, user_id: int) -> Optional[tuple[str, Optional[str], Optional[str]]]:
    _ensure_table(cur)
    cur.execute(
        """
        SELECT email, access_token, refresh_token
        FROM email_integrations
        WHERE user_id = %s AND provider = 'gmail'
        """,
        (user_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    return row[0], row[1], row[2]


def send_gmail(
    cur,
    sender_user_id: int,
    to_email: str,
    subject: str,
    text: str,
    html: Optional[str] = None,
) -> bool:
    sender_info = _get_tokens(cur, sender_user_id)
    if sender_info is None:
        return False

    sender_email, access_token, refresh_token = sender_info
    token = access_token
    expires_in = 0
    if refresh_token:
        refreshed = _refresh_access_token(refresh_token)
        if refreshed:
            token, expires_in = refreshed
            cur.execute(
                """
                UPDATE email_integrations
                SET access_token = %s,
                    expires_at = now() + (%s || ' seconds')::interval,
                    updated_at = now()
                WHERE user_id = %s AND provider = 'gmail'
                """,
                (token, int(expires_in), sender_user_id),
            )

    if not token:
        return False

    message = EmailMessage()
    message["To"] = to_email
    message["From"] = sender_email or to_email
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8").rstrip("=")
    response = httpx.post(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        headers={"Authorization": f"Bearer {token}"},
        json={"raw": raw},
        timeout=20,
    )
    return response.status_code in {200, 202}
