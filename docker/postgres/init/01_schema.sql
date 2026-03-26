BEGIN;

CREATE TABLE IF NOT EXISTS roles (
  role_id serial PRIMARY KEY,
  role_name text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  user_id serial PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  avatar_url text,
  role_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_users_role
    FOREIGN KEY (role_id)
    REFERENCES roles(role_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workflows (
  workflow_id serial PRIMARY KEY,
  workflow_name text NOT NULL,
  description text,
  created_by integer,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_workflows_created_by
    FOREIGN KEY (created_by)
    REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  step_id serial PRIMARY KEY,
  workflow_id integer NOT NULL,
  step_name text NOT NULL,
  role_id integer,
  step_order integer NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('approve', 'review')),
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_workflow_steps_workflow
    FOREIGN KEY (workflow_id)
    REFERENCES workflows(workflow_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_workflow_steps_role
    FOREIGN KEY (role_id)
    REFERENCES roles(role_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT uq_workflow_steps_order UNIQUE (workflow_id, step_order)
);

CREATE TABLE IF NOT EXISTS requests (
  request_id serial PRIMARY KEY,
  title text NOT NULL,
  description text,
  request_type text NOT NULL,
  workflow_id integer,
  created_by integer,
  current_step integer,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_requests_workflow
    FOREIGN KEY (workflow_id)
    REFERENCES workflows(workflow_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_requests_created_by
    FOREIGN KEY (created_by)
    REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_requests_current_step
    FOREIGN KEY (current_step)
    REFERENCES workflow_steps(step_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS request_steps (
  request_step_id serial PRIMARY KEY,
  request_id integer NOT NULL,
  step_id integer,
  approver_id integer,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  comments text,
  completed_at timestamp,
  CONSTRAINT fk_request_steps_request
    FOREIGN KEY (request_id)
    REFERENCES requests(request_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_request_steps_step
    FOREIGN KEY (step_id)
    REFERENCES workflow_steps(step_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_request_steps_approver
    FOREIGN KEY (approver_id)
    REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS request_attachments (
  attachment_id serial PRIMARY KEY,
  request_id integer NOT NULL,
  file_name text NOT NULL,
  content_type text,
  file_data bytea NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_request_attachments_request
    FOREIGN KEY (request_id)
    REFERENCES requests(request_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS request_approvers (
  id serial PRIMARY KEY,
  request_id integer NOT NULL,
  step_id integer NOT NULL,
  approver_id integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_request_approvers_request
    FOREIGN KEY (request_id)
    REFERENCES requests(request_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_request_approvers_step
    FOREIGN KEY (step_id)
    REFERENCES workflow_steps(step_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_request_approvers_user
    FOREIGN KEY (approver_id)
    REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS approvals (
  approval_id serial PRIMARY KEY,
  request_step_id integer NOT NULL,
  approver_id integer,
  action text NOT NULL CHECK (action IN ('Approved', 'Rejected', 'Changes Requested')),
  comments text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_approvals_request_step
    FOREIGN KEY (request_step_id)
    REFERENCES request_steps(request_step_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_approvals_approver
    FOREIGN KEY (approver_id)
    REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id serial PRIMARY KEY,
  user_id integer,
  request_id integer,
  action text NOT NULL,
  "timestamp" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_audit_logs_request
    FOREIGN KEY (request_id)
    REFERENCES requests(request_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id serial PRIMARY KEY,
  user_id integer NOT NULL,
  request_id integer,
  message text NOT NULL,
  read_status boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_notifications_request
    FOREIGN KEY (request_id)
    REFERENCES requests(request_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (status);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id ON workflow_steps (workflow_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver_id ON approvals (approver_id);

CREATE INDEX IF NOT EXISTS idx_requests_workflow_id ON requests (workflow_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_by ON requests (created_by);
CREATE INDEX IF NOT EXISTS idx_requests_current_step ON requests (current_step);
CREATE INDEX IF NOT EXISTS idx_request_steps_request_id ON request_steps (request_id);
CREATE INDEX IF NOT EXISTS idx_request_steps_step_id ON request_steps (step_id);
CREATE INDEX IF NOT EXISTS idx_request_steps_approver_id ON request_steps (approver_id);
CREATE INDEX IF NOT EXISTS idx_request_attachments_request_id ON request_attachments (request_id);
CREATE INDEX IF NOT EXISTS idx_request_approvers_request_id ON request_approvers (request_id);
CREATE INDEX IF NOT EXISTS idx_approvals_request_step_id ON approvals (request_step_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs (request_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_request_id ON notifications (request_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_requests_set_updated_at ON requests;
CREATE TRIGGER trg_requests_set_updated_at
BEFORE UPDATE ON requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
