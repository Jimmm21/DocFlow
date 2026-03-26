import secrets
from datetime import timedelta


def ensure_review_token_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS request_review_tokens (
          token_id serial PRIMARY KEY,
          token text NOT NULL UNIQUE,
          request_id integer NOT NULL,
          step_id integer NOT NULL,
          approver_id integer NOT NULL,
          expires_at timestamp NOT NULL,
          used_at timestamp,
          created_at timestamp NOT NULL DEFAULT now(),
          CONSTRAINT uq_request_review_step UNIQUE (request_id, step_id, approver_id),
          CONSTRAINT fk_review_tokens_request
            FOREIGN KEY (request_id)
            REFERENCES requests(request_id)
            ON UPDATE CASCADE
            ON DELETE CASCADE,
          CONSTRAINT fk_review_tokens_step
            FOREIGN KEY (step_id)
            REFERENCES workflow_steps(step_id)
            ON UPDATE CASCADE
            ON DELETE CASCADE,
          CONSTRAINT fk_review_tokens_user
            FOREIGN KEY (approver_id)
            REFERENCES users(user_id)
            ON UPDATE CASCADE
            ON DELETE CASCADE
        )
        """
    )


def get_or_create_token(cur, request_id: int, step_id: int, approver_id: int, ttl_hours: int = 168) -> str:
    ensure_review_token_table(cur)
    token = secrets.token_urlsafe(32)
    cur.execute(
        """
        INSERT INTO request_review_tokens
          (token, request_id, step_id, approver_id, expires_at)
        VALUES (%s, %s, %s, %s, now() + (%s || ' hours')::interval)
        ON CONFLICT (request_id, step_id, approver_id)
        DO UPDATE SET
          token = EXCLUDED.token,
          expires_at = EXCLUDED.expires_at,
          used_at = NULL
        RETURNING token
        """,
        (token, request_id, step_id, approver_id, int(ttl_hours)),
    )
    row = cur.fetchone()
    return row[0] if row else token
