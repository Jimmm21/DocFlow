from typing import Optional

from app.core.config import FRONTEND_URL
from app.google_email import send_gmail


def create_notification(cur, user_id: int, message: str, request_id: int | None = None) -> None:
    cur.execute(
        """
        INSERT INTO notifications (user_id, request_id, message)
        VALUES (%s, %s, %s)
        """,
        (user_id, request_id, message),
    )


def send_review_email(
    cur,
    sender_user_id: int,
    to_email: Optional[str],
    approver_name: Optional[str],
    request_title: str,
    workflow_name: Optional[str],
    token: str,
) -> bool:
    if not to_email:
        return False
    link = f"{FRONTEND_URL.rstrip('/')}/?review_token={token}"
    subject = f"Approval needed: {request_title}"
    heading = workflow_name or "Workflow Request"
    greeting = f"Hi {approver_name or 'there'},"
    text = (
        f"{greeting}\n\n"
        f"You have a pending approval for \"{request_title}\" ({heading}).\n"
        f"Review here: {link}\n"
    )
    html = f"""
    <p>{greeting}</p>
    <p>You have a pending approval for <strong>{request_title}</strong> ({heading}).</p>
    <p><a href="{link}">Review request</a></p>
    """
    return send_gmail(cur, sender_user_id, to_email, subject, text, html)


def send_request_status_email(
    cur,
    sender_user_id: int,
    to_email: Optional[str],
    requester_name: Optional[str],
    approver_name: Optional[str],
    request_title: str,
    workflow_name: Optional[str],
    status: str,
    comment: Optional[str] = None,
) -> bool:
    if not to_email:
        return False

    status_label = status.capitalize()
    status_lower = status_label.lower()
    heading = workflow_name or "Workflow Request"
    greeting = f"Hi {requester_name or 'there'},"
    actor = approver_name or "an approver"
    subject = f"Request {status_lower}: {request_title}"

    comment_text = f"Comment: {comment}\n" if comment else ""
    text = (
        f"{greeting}\n\n"
        f"Your request \"{request_title}\" ({heading}) was {status_lower} by {actor}.\n"
        f"{comment_text}"
        f"Open the app: {FRONTEND_URL.rstrip('/')}\n"
    )

    comment_html = ""
    if comment:
        safe_comment = comment.replace("\n", "<br />")
        comment_html = f"<p><strong>Comment:</strong> {safe_comment}</p>"

    html = f"""
    <p>{greeting}</p>
    <p>Your request <strong>{request_title}</strong> ({heading}) was {status_lower} by {actor}.</p>
    {comment_html}
    <p><a href="{FRONTEND_URL.rstrip('/')}">Open the app</a></p>
    """
    return send_gmail(cur, sender_user_id, to_email, subject, text, html)
