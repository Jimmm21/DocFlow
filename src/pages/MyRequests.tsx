import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ICONS, RequestStatus } from '../constants';
import { cn } from '../lib/utils';
import { useSession } from '../context/SessionContext';
import ConfirmDialog from '../components/ConfirmDialog';

type RequestSummary = {
  request_id: number;
  title: string;
  request_type: string;
  status: RequestStatus;
  workflow_name?: string | null;
  created_by_name?: string | null;
  created_at: string | null;
  current_step_name?: string | null;
};

type WorkflowOption = {
  workflow_id: number;
  workflow_name: string;
  description: string | null;
  steps_count: number;
};

type ApproverUser = {
  user_id: number;
  name: string;
  role_id: number | null;
  role_name?: string | null;
};

type WorkflowStep = {
  step_id: number;
  step_name: string;
  role_id: number | null;
  role_name?: string | null;
  step_order?: number | null;
  action_type: string;
  approvers: ApproverUser[];
};

type AttachmentPayload = {
  name: string;
  content_type: string | null;
  data: string;
  size: number;
};

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const readFileAsDataUrl = (file: File): Promise<AttachmentPayload> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        content_type: file.type || null,
        data: String(reader.result || ''),
        size: file.size,
      });
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.readAsDataURL(file);
  });

const MyRequests: React.FC<{
  initialMode?: 'list' | 'create';
  onModeChange?: (mode: 'list' | 'create') => void;
  onViewRequest?: (requestId: number) => void;
  onEditRequest?: (requestId: number) => void;
}> = ({ initialMode = 'list', onModeChange, onViewRequest, onEditRequest }) => {
  const { session, apiFetch } = useSession();
  const [mode, setMode] = useState<'list' | 'create'>(initialMode);
  const [filter, setFilter] = useState<RequestStatus | 'All'>('All');
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [workflowsError, setWorkflowsError] = useState<string | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [selectedApprovers, setSelectedApprovers] = useState<Record<number, string>>({});

  const [title, setTitle] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<AttachmentPayload[]>([]);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteRequest, setConfirmDeleteRequest] = useState<RequestSummary | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const apiUrl = useMemo(
    () => import.meta.env.VITE_API_URL || 'http://localhost:9000',
    [],
  );

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const response = await apiFetch(`${apiUrl}/requests`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to load requests.');
      }
      const data = await response.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load requests.';
      setRequestsError(message);
    } finally {
      setRequestsLoading(false);
    }
  }, [apiUrl, apiFetch]);

  const fetchWorkflows = useCallback(async () => {
    setWorkflowsLoading(true);
    setWorkflowsError(null);
    try {
      const response = await apiFetch(`${apiUrl}/workflows`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to load workflows.');
      }
      const data = await response.json();
      setWorkflows(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load workflows.';
      setWorkflowsError(message);
    } finally {
      setWorkflowsLoading(false);
    }
  }, [apiUrl, apiFetch]);

  const fetchWorkflowSteps = useCallback(
    async (workflowId: number) => {
      setStepsLoading(true);
      setStepsError(null);
      try {
        const response = await apiFetch(`${apiUrl}/workflows/${workflowId}/steps`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'Failed to load workflow steps.');
        }
        const data = await response.json();
        setWorkflowSteps(Array.isArray(data) ? data : []);
        setSelectedApprovers({});
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load workflow steps.';
        setStepsError(message);
        setWorkflowSteps([]);
      } finally {
        setStepsLoading(false);
      }
    },
    [apiUrl, apiFetch],
  );

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (mode === 'list') {
      fetchRequests();
    }
  }, [mode, fetchRequests]);

  useEffect(() => {
    if (mode === 'create') {
      fetchWorkflows();
    }
  }, [mode, fetchWorkflows]);

  useEffect(() => {
    if (!workflowId) {
      setWorkflowSteps([]);
      setSelectedApprovers({});
      setStepsError(null);
      return;
    }
    fetchWorkflowSteps(Number(workflowId));
  }, [workflowId, fetchWorkflowSteps]);

  const filteredRequests = filter === 'All'
    ? requests
    : requests.filter((r) => r.status === filter);

  const selectedWorkflow = workflows.find(
    (workflow) => workflow.workflow_id === Number(workflowId),
  );

  const resetForm = () => {
    setTitle('');
    setWorkflowId('');
    setDescription('');
    setNotes('');
    setAttachments([]);
    setWorkflowSteps([]);
    setSelectedApprovers({});
    setStepsError(null);
    setSubmitError(null);
  };

  const updateMode = (next: 'list' | 'create') => {
    setMode(next);
    onModeChange?.(next);
  };

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    setSubmitError(null);
    const files = Array.from(fileList);
    const oversized = files.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (oversized) {
      setSubmitError(`"${oversized.name}" exceeds 5MB. Please upload a smaller file.`);
      return;
    }

    setIsReadingFiles(true);
    try {
      const payloads = await Promise.all(files.map((file) => readFileAsDataUrl(file)));
      setAttachments((prev) => [...prev, ...payloads]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add files.';
      setSubmitError(message);
    } finally {
      setIsReadingFiles(false);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const submitRequest = async () => {
    setSubmitError(null);

    if (isReadingFiles) {
      setSubmitError('Please wait for files to finish loading.');
      return;
    }

    if (!title.trim()) {
      setSubmitError('Request name is required.');
      return;
    }

    if (!session?.user_id) {
      setSubmitError('No active user session.');
      return;
    }

    if (!workflowId) {
      setSubmitError('Please select a workflow.');
      return;
    }

    if (workflowSteps.length === 0) {
      setSubmitError('Selected workflow has no steps.');
      return;
    }

    const missingApprovers = workflowSteps.filter(
      (step) => step.role_id && !selectedApprovers[step.step_id],
    );
    if (missingApprovers.length > 0) {
      setSubmitError('Please select approvers for each step.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        workflow_id: Number(workflowId),
        description: description.trim() || null,
        notes: notes.trim() || null,
        request_type: 'Workflow',
        attachments: attachments.map(({ name, content_type, data }) => ({
          name,
          content_type,
          data,
        })),
        approvers: workflowSteps
          .filter((step) => step.role_id && selectedApprovers[step.step_id])
          .map((step) => ({
            step_id: step.step_id,
            approver_id: Number(selectedApprovers[step.step_id]),
          })),
      };

      const response = await apiFetch(`${apiUrl}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to submit request.');
      }

      resetForm();
      updateMode('list');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit request.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteRequest = async (requestId: number) => {
    setDeleteError(null);
    try {
      const response = await apiFetch(`${apiUrl}/requests/${requestId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to cancel request.');
      }
      await fetchRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel request.';
      setDeleteError(message);
    }
  };

  if (mode === 'create') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
              onClick={() => {
                resetForm();
                updateMode('list');
              }}
            >
              <ICONS.ArrowRight className="rotate-180" size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">New Request</h1>
              <p className="text-slate-500">
                Provide the request details and select a workflow for approval.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn-secondary"
              onClick={() => {
                resetForm();
                updateMode('list');
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => setConfirmSubmit(true)}
              disabled={isSubmitting || isReadingFiles}
            >
              {isSubmitting ? 'Submitting...' : isReadingFiles ? 'Processing files...' : 'Submit Request'}
            </button>
          </div>
        </div>

        <div className="card space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Request Name</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                placeholder="e.g., New Security Review"
              />
            </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Workflow</label>
            <select
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
              disabled={workflowsLoading}
            >
              <option value="">Select a workflow</option>
              {workflows.map((workflow) => (
                <option key={workflow.workflow_id} value={workflow.workflow_id}>
                  {workflow.workflow_name}
                </option>
              ))}
            </select>
            {workflowsError && (
              <p className="text-xs text-red-600">{workflowsError}</p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Approvers</label>
              <p className="text-xs text-slate-400 mt-1">
                Select approvers based on each workflow step role.
              </p>
            </div>
            {stepsLoading && <span className="text-xs text-slate-500">Loading steps...</span>}
          </div>

          {stepsError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
              {stepsError}
            </div>
          )}

          {!stepsLoading && workflowId && workflowSteps.length === 0 && !stepsError && (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              No steps found for this workflow.
            </div>
          )}

          {workflowSteps.length > 0 && (
            <div className="grid gap-3">
              {workflowSteps.map((step, index) => (
                <div
                  key={step.step_id}
                  className="flex flex-col md:flex-row md:items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {index + 1}. {step.step_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Role: {step.role_name || 'Unassigned'}
                    </p>
                  </div>
                  <div className="min-w-[220px]">
                    <select
                      value={selectedApprovers[step.step_id] || ''}
                      onChange={(e) =>
                        setSelectedApprovers((prev) => ({
                          ...prev,
                          [step.step_id]: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                      disabled={step.approvers.length === 0}
                    >
                      <option value="">
                        {step.approvers.length === 0
                          ? 'No users for role'
                          : 'Select approver'}
                      </option>
                      {step.approvers.map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-slate-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent min-h-[120px]"
              placeholder="Outline the request requirements..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent min-h-[120px]"
              placeholder="Optional notes for reviewers..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Attachments</label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn-secondary cursor-pointer inline-flex items-center gap-2">
                <ICONS.Plus size={16} />
                Add File
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              {isReadingFiles && (
                <span className="text-xs text-slate-500">Processing files...</span>
              )}
              {!isReadingFiles && attachments.length === 0 && (
                <span className="text-xs text-slate-400">No files added.</span>
              )}
            </div>

            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <ICONS.FileText size={16} className="text-sky-blue-accent" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{file.name}</p>
                        <p className="text-xs text-slate-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                      onClick={() => removeAttachment(index)}
                      type="button"
                    >
                      <ICONS.Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedWorkflow && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">Selected Workflow</p>
                  <p className="text-sm font-semibold text-slate-900">{selectedWorkflow.workflow_name}</p>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  {selectedWorkflow.steps_count} steps
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                {selectedWorkflow.description || 'No description provided.'}
              </p>
            </div>
          )}

          {submitError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {submitError}
            </div>
          )}
        </div>

        <ConfirmDialog
          open={confirmSubmit}
          title="Submit request?"
          description="Submit this request and start the approval workflow?"
          confirmLabel="Submit Request"
          onCancel={() => setConfirmSubmit(false)}
          onConfirm={async () => {
            setConfirmSubmit(false);
            await submitRequest();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Requests</h1>
          <p className="text-slate-500">Manage and track your submitted document requests.</p>
        </div>
        <button
          className="btn-primary flex items-center justify-center gap-2"
          onClick={() => updateMode('create')}
        >
          <ICONS.Plus size={18} />
          New Request
        </button>
      </div>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            {['All', 'Pending', 'Approved', 'Rejected'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as RequestStatus | 'All')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                  filter === f
                    ? "bg-sky-blue-accent text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-64">
              <ICONS.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-blue-accent"
              />
            </div>
            <button className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500">
              <ICONS.Filter size={18} />
            </button>
          </div>
        </div>

        {requestsError && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {requestsError}
          </div>
        )}
        {deleteError && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {deleteError}
          </div>
        )}

        {requestsLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, idx) => (
              <div key={idx} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-blue text-sky-blue-accent">
              <ICONS.FileText size={22} />
            </div>
            <h4 className="text-lg font-semibold text-slate-900">No requests yet</h4>
            <p className="text-sm text-slate-500 mt-1">
              Submit a new request to kick off a workflow.
            </p>
            <button
              className="btn-primary mt-4 inline-flex items-center gap-2"
              onClick={() => updateMode('create')}
            >
              <ICONS.Plus size={16} />
              New Request
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Request ID</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Title</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Type</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Status</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Date Submitted</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRequests.map((req) => (
                  <tr
                    key={req.request_id}
                    className="group hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="py-4 text-sm font-medium text-sky-blue-accent">
                      {`REQ-${String(req.request_id).padStart(3, '0')}`}
                    </td>
                    <td className="py-4 text-sm font-semibold">{req.title}</td>
                    <td className="py-4 text-sm text-slate-500">
                      {req.workflow_name || req.request_type}
                    </td>
                    <td className="py-4">
                      <span className={cn(
                        "status-badge",
                        req.status === 'Approved'
                          ? "status-approved"
                          : req.status === 'Pending'
                            ? "status-pending"
                            : "status-rejected"
                      )}>
                        {req.status}
                      </span>
                    </td>
                    <td className="py-4 text-sm text-slate-500">
                      {formatDate(req.created_at)}
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                          title="View"
                          onClick={() => onViewRequest?.(req.request_id)}
                        >
                          <ICONS.Eye size={16} />
                        </button>
                        <button
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            req.status === 'Pending'
                              ? "hover:bg-amber-50 text-amber-600"
                              : "text-slate-300 cursor-not-allowed"
                          )}
                          title="Edit"
                          onClick={() => {
                            if (req.status !== 'Pending') return;
                            onEditRequest?.(req.request_id);
                          }}
                          disabled={req.status !== 'Pending'}
                        >
                          <ICONS.Edit2 size={16} />
                        </button>
                        <button
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            req.status === 'Pending'
                              ? "hover:bg-red-50 text-red-600"
                              : "text-slate-300 cursor-not-allowed"
                          )}
                          title="Cancel"
                          onClick={() => {
                            if (req.status !== 'Pending') return;
                            setConfirmDeleteRequest(req);
                          }}
                          disabled={req.status !== 'Pending'}
                        >
                          <ICONS.Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmDeleteRequest)}
        title="Cancel request?"
        description={
          confirmDeleteRequest
            ? `Cancel "${confirmDeleteRequest.title}"? This cannot be undone.`
            : undefined
        }
        confirmLabel="Cancel Request"
        danger
        onCancel={() => setConfirmDeleteRequest(null)}
        onConfirm={async () => {
          if (!confirmDeleteRequest) return;
          const requestId = confirmDeleteRequest.request_id;
          setConfirmDeleteRequest(null);
          await deleteRequest(requestId);
        }}
      />

    </div>
  );
};

export default MyRequests;
