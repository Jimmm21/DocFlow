from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class WorkflowStepIn(BaseModel):
    step_name: str = Field(..., min_length=1)
    role_name: Optional[str] = None
    action_type: str = Field(..., min_length=1)
    step_order: Optional[int] = None


class WorkflowIn(BaseModel):
    workflow_name: str = Field(..., min_length=1)
    description: Optional[str] = None
    created_by: Optional[int] = None
    steps: List[WorkflowStepIn]


class WorkflowSummary(BaseModel):
    workflow_id: int
    workflow_name: str
    description: Optional[str] = None
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None
    steps_count: int = 0


class AttachmentIn(BaseModel):
    name: str = Field(..., min_length=1)
    content_type: Optional[str] = None
    data: str = Field(..., min_length=1)


class AttachmentOut(BaseModel):
    name: str
    content_type: Optional[str] = None
    data: str


class RequestApproverIn(BaseModel):
    step_id: int = Field(..., gt=0)
    approver_id: int = Field(..., gt=0)


class RequestIn(BaseModel):
    title: str = Field(..., min_length=1)
    workflow_id: int = Field(..., gt=0)
    description: Optional[str] = None
    notes: Optional[str] = None
    request_type: Optional[str] = None
    created_by: Optional[int] = None
    attachments: Optional[List[AttachmentIn]] = None
    approvers: Optional[List[RequestApproverIn]] = None


class RequestUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None


class RequestSummary(BaseModel):
    request_id: int
    title: str
    description: Optional[str] = None
    request_type: str
    status: str
    workflow_id: Optional[int] = None
    workflow_name: Optional[str] = None
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None
    current_step_name: Optional[str] = None
    current_step_id: Optional[int] = None


class RequestStepStatusOut(BaseModel):
    step_id: int
    step_name: str
    step_order: Optional[int] = None
    action_type: str
    status: str
    approver_name: Optional[str] = None
    comment: Optional[str] = None


class RequestDetailOut(RequestSummary):
    steps: List[RequestStepStatusOut] = []
    attachments: List[AttachmentOut] = []


class PendingApprovalOut(BaseModel):
    request_id: int
    request_title: str
    request_creator_name: Optional[str] = None
    current_step_name: Optional[str] = None
    workflow_name: Optional[str] = None
    submitted_at: Optional[datetime] = None


class ApproverUser(BaseModel):
    user_id: int
    name: str
    role_id: Optional[int] = None
    role_name: Optional[str] = None


class WorkflowStepOut(BaseModel):
    step_id: int
    step_name: str
    role_id: Optional[int] = None
    role_name: Optional[str] = None
    step_order: Optional[int] = None
    action_type: str
    approvers: List[ApproverUser] = []


class RoleOut(BaseModel):
    role_id: int
    role_name: str


class RoleIn(BaseModel):
    role_name: str = Field(..., min_length=1)


class UserOut(BaseModel):
    user_id: int
    name: str
    email: str
    role_id: Optional[int] = None
    role_name: Optional[str] = None
    created_at: Optional[datetime] = None


class UserIn(BaseModel):
    name: str = Field(..., min_length=1)
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)
    role_id: Optional[int] = None
    role_name: Optional[str] = None


class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[int] = None


class LoginIn(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class LoginOut(BaseModel):
    user_id: int
    name: str
    email: str
    role_name: Optional[str] = None
    avatar_url: Optional[str] = None


class ApprovalActionIn(BaseModel):
    comment: Optional[str] = None


class ProfileOut(BaseModel):
    user_id: int
    name: str
    email: str
    role_name: Optional[str] = None
    email_verified: bool = False
    verified_email: Optional[str] = None
    avatar_url: Optional[str] = None


class ProfileUpdateIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None


class PasswordChangeIn(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)


class NotificationOut(BaseModel):
    notification_id: int
    message: str
    request_id: Optional[int] = None
    read_status: bool
    created_at: Optional[datetime] = None
