from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import CORS_ORIGINS
from app.routers import approvals, auth, integrations, notifications, profile, public_review, reports, requests, roles, users, workflows

app = FastAPI()

origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()] or ["*"]
allow_all = "*" in origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(roles.router)
app.include_router(users.router)
app.include_router(workflows.router)
app.include_router(requests.router)
app.include_router(approvals.router)
app.include_router(integrations.router)
app.include_router(notifications.router)
app.include_router(public_review.router)
app.include_router(profile.router)
app.include_router(reports.router)
