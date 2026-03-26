import base64
import hashlib
import hmac
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.core.config import (
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_STATE_SECRET,
    GOOGLE_REDIRECT_URI,
)
from app.db import get_conn
from app.deps import require_user_id

router = APIRouter()

STATE_TTL_SECONDS = 600
PROVIDER_NAME = "gmail"


def _encode_state(user_id: int) -> str:
    if not GOOGLE_OAUTH_STATE_SECRET:
        raise HTTPException(status_code=500, detail="GOOGLE_OAUTH_STATE_SECRET is not set.")
    timestamp = int(time.time())
    message = f"{user_id}:{timestamp}".encode("utf-8")
    signature = hmac.new(
        GOOGLE_OAUTH_STATE_SECRET.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()
    raw = f"{user_id}:{timestamp}:{signature}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _decode_state(state: str) -> int:
    if not GOOGLE_OAUTH_STATE_SECRET:
        raise HTTPException(status_code=500, detail="GOOGLE_OAUTH_STATE_SECRET is not set.")
    padded = state + "=" * (-len(state) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        user_id_str, timestamp_str, signature = raw.split(":", 2)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid state.") from exc

    message = f"{user_id_str}:{timestamp_str}".encode("utf-8")
    expected = hmac.new(
        GOOGLE_OAUTH_STATE_SECRET.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=400, detail="Invalid state signature.")

    timestamp = int(timestamp_str)
    if int(time.time()) - timestamp > STATE_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="State expired.")

    return int(user_id_str)


def _ensure_oauth_config():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID is not set.")
    if not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_SECRET is not set.")
    if not GOOGLE_REDIRECT_URI:
        raise HTTPException(status_code=500, detail="GOOGLE_REDIRECT_URI is not set.")


@router.get("/integrations/gmail/status")
def gmail_status(request: Request):
    user_id = require_user_id(request)
    with get_conn() as conn:
        with conn.cursor() as cur:
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
                SELECT email, expires_at
                FROM email_integrations
                WHERE user_id = %s AND provider = %s
                """,
                (user_id, PROVIDER_NAME),
            )
            row = cur.fetchone()

    if row is None:
        return {"connected": False, "email": None}

    return {"connected": True, "email": row[0], "expires_at": row[1]}


@router.get("/integrations/gmail/start")
def gmail_start(request: Request):
    user_id = require_user_id(request)
    _ensure_oauth_config()

    state = _encode_state(user_id)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "scope": "openid email https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.send",
        "state": state,
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return {"url": auth_url}


@router.get("/integrations/gmail/callback")
def gmail_callback(request: Request):
    _ensure_oauth_config()

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")
    if error:
        raise HTTPException(status_code=400, detail=error)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state.")

    user_id = _decode_state(state)

    token_response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": GOOGLE_REDIRECT_URI,
        },
        timeout=20,
    )
    if token_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange token.")

    token_payload = token_response.json()
    access_token = token_payload.get("access_token")
    refresh_token = token_payload.get("refresh_token")
    expires_in = token_payload.get("expires_in") or 0
    if not access_token:
        raise HTTPException(status_code=400, detail="Missing access token.")

    userinfo_response = httpx.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    email = None
    if userinfo_response.status_code == 200:
        email = userinfo_response.json().get("email")

    with get_conn() as conn:
        with conn.cursor() as cur:
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
                INSERT INTO email_integrations
                  (user_id, provider, email, access_token, refresh_token, expires_at)
                VALUES (%s, %s, %s, %s, %s, now() + (%s || ' seconds')::interval)
                ON CONFLICT (user_id, provider)
                DO UPDATE SET
                  email = EXCLUDED.email,
                  access_token = EXCLUDED.access_token,
                  refresh_token = COALESCE(EXCLUDED.refresh_token, email_integrations.refresh_token),
                  expires_at = EXCLUDED.expires_at,
                  updated_at = now()
                """,
                (
                    user_id,
                    PROVIDER_NAME,
                    email,
                    access_token,
                    refresh_token,
                    int(expires_in),
                ),
            )

    return RedirectResponse(f"{FRONTEND_URL.rstrip('/')}/settings?gmail=connected")
