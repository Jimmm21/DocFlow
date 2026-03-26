import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ICONS } from '../constants';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSession } from '../context/SessionContext';

type PendingApproval = {
  request_id: number;
  request_title: string;
  request_creator_name?: string | null;
  current_step_name?: string | null;
  workflow_name?: string | null;
  submitted_at?: string | null;
};

type RequestStepStatus = {
  step_id: number;
  step_name: string;
  step_order?: number | null;
  action_type: string;
  status: string;
  approver_name?: string | null;
};

type RequestAttachment = {
  name: string;
  content_type?: string | null;
  data: string;
};

type RequestDetail = {
  request_id: number;
  title: string;
  description?: string | null;
  request_type: string;
  status: string;
  workflow_name?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
  current_step_name?: string | null;
  steps: RequestStepStatus[];
  attachments: RequestAttachment[];
};

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

const Approvals: React.FC = () => {
  const { apiFetch } = useSession();
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [reviewDetails, setReviewDetails] = useState<RequestDetail | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [activeAttachment, setActiveAttachment] = useState<RequestAttachment | null>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState<PendingApproval | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [confirmApproval, setConfirmApproval] = useState<PendingApproval | null>(null);

  const apiUrl = useMemo(
    () => import.meta.env.VITE_API_URL || 'http://localhost:9000',
    [],
  );

  const fetchPendingApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${apiUrl}/approvals/pending`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to load pending approvals.');
      }
      const data = await response.json();
      setPendingApprovals(Array.isArray(data) ? data : []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load pending approvals.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, apiUrl]);

  useEffect(() => {
    fetchPendingApprovals();
  }, [fetchPendingApprovals]);

  const loadReviewDetails = useCallback(
    async (requestId: number) => {
      setReviewError(null);
      setReviewLoading(true);
      setReviewDetails(null);
      try {
        const response = await apiFetch(`${apiUrl}/requests/${requestId}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'Failed to load request details.');
        }
        const data = await response.json();
        setReviewDetails(data as RequestDetail);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load request details.';
        setReviewError(message);
      } finally {
        setReviewLoading(false);
      }
    },
    [apiFetch, apiUrl],
  );

  const handleAction = async (
    requestId: number,
    action: 'approve' | 'reject',
    comment?: string,
  ) => {
    setError(null);
    setActioningId(requestId);
    try {
      const body = comment ? { comment } : undefined;
      const response = await apiFetch(
        `${apiUrl}/approvals/${requestId}/${action}`,
        {
          method: 'POST',
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to update approval.');
      }
      await fetchPendingApprovals();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update approval.';
      setError(message);
    } finally {
      setActioningId(null);
    }
  };

  const downloadAttachment = (attachment: RequestAttachment) => {
    const link = document.createElement('a');
    link.href = attachment.data;
    link.download = attachment.name || 'attachment';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const openAttachment = (attachment: RequestAttachment) => {
    const win = window.open();
    if (win) {
      win.location.href = attachment.data;
      return;
    }
    downloadAttachment(attachment);
  };

  const getMimeType = (data: string) => {
    const match = data.match(/^data:([^;]+);/);
    return match ? match[1] : '';
  };

  const decodeTextData = (data: string) => {
    const base64 = data.split(',', 2)[1];
    if (!base64) return '';
    try {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pending Approvals</h1>
        <p className="text-slate-500">
          Review and take action on requests awaiting your approval.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, idx) => (
            <div key={idx} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : pendingApprovals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-blue text-sky-blue-accent">
            <ICONS.CheckCircle size={22} />
          </div>
          <h4 className="text-lg font-semibold text-slate-900">All caught up</h4>
          <p className="text-sm text-slate-500 mt-1">
            No approvals are waiting for you right now.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {pendingApprovals.map((req) => (
            <div
              key={req.request_id}
              className="card flex flex-col md:flex-row md:items-center justify-between gap-6"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-blue flex items-center justify-center text-sky-blue-accent">
                  <ICONS.FileText size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-sky-blue-accent bg-sky-blue px-2 py-0.5 rounded-md">
                      {`REQ-${String(req.request_id).padStart(3, '0')}`}
                    </span>
                    <span className="text-xs text-slate-500">
                      {req.workflow_name || 'Workflow'}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900">{req.request_title}</h3>
                  <p className="text-sm text-slate-500">
                    Submitted by{' '}
                    <span className="font-medium text-slate-700">
                      {req.request_creator_name || 'Unknown'}
                    </span>{' '}
                    • {formatDate(req.submitted_at)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:items-end gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ICONS.Clock size={14} />
                  <span>
                    Current Step:{' '}
                    <span className="font-semibold text-slate-700">
                      {req.current_step_name || 'Pending'}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={() => setConfirmApproval(req)}
                    disabled={actioningId === req.request_id}
                  >
                    {actioningId === req.request_id ? 'Working...' : 'Approve'}
                  </button>
                  <button
                    className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={() => {
                      setRejectingRequest(req);
                      setRejectComment('');
                      setRejectError(null);
                    }}
                    disabled={actioningId === req.request_id}
                  >
                    {actioningId === req.request_id ? 'Working...' : 'Reject'}
                  </button>
                  <button
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition-all active:scale-95"
                    onClick={() => {
                      setReviewId(req.request_id);
                      loadReviewDetails(req.request_id);
                    }}
                  >
                    Review
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => {
              setReviewId(null);
              setReviewDetails(null);
              setReviewError(null);
              setActiveAttachment(null);
              setPreviewFullscreen(false);
            }}
          />
          <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Request Review</h2>
                <p className="text-sm text-slate-500">
                  {reviewDetails
                    ? `REQ-${String(reviewDetails.request_id).padStart(3, '0')}`
                    : `REQ-${String(reviewId).padStart(3, '0')}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setReviewId(null);
                  setReviewDetails(null);
                  setReviewError(null);
                  setActiveAttachment(null);
                  setPreviewFullscreen(false);
                }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ICONS.X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {reviewLoading && (
                <div className="space-y-3">
                  <div className="h-6 rounded bg-slate-100 animate-pulse" />
                  <div className="h-24 rounded bg-slate-100 animate-pulse" />
                  <div className="h-12 rounded bg-slate-100 animate-pulse" />
                </div>
              )}

              {reviewError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {reviewError}
                </div>
              )}

              {reviewDetails && !reviewLoading && (
                <>
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-sky-blue flex items-center justify-center text-sky-blue-accent">
                      <ICONS.FileText size={28} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        {reviewDetails.workflow_name || reviewDetails.request_type}
                      </p>
                      <h3 className="text-2xl font-bold text-slate-900">
                        {reviewDetails.title}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Submitted by{' '}
                        <span className="font-medium text-slate-700">
                          {reviewDetails.created_by_name || 'Unknown'}
                        </span>{' '}
                        • {formatDate(reviewDetails.created_at)}
                      </p>
                    </div>
                    <div className="ml-auto">
                      <span className="status-badge status-pending">
                        {reviewDetails.status}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400">Description</p>
                    <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">
                      {reviewDetails.description || 'No description provided.'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-2">
                      Attachments
                    </p>
                    {reviewDetails.attachments.length === 0 ? (
                      <p className="text-sm text-slate-500">No files attached.</p>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {reviewDetails.attachments.map((file, idx) => (
                          <button
                            key={`${file.name}-${idx}`}
                            onClick={() => {
                              setActiveAttachment(file);
                              setPreviewFullscreen(false);
                            }}
                            className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-sky-blue-accent transition-colors"
                          >
                            <ICONS.FileText size={18} className="text-sky-blue-accent" />
                            <span className="text-sm font-medium">{file.name}</span>
                            <span className="text-xs text-slate-400">View</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {activeAttachment && (
                    <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        File Preview
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openAttachment(activeAttachment)}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Open file
                        </button>
                        <button
                          onClick={() => setPreviewFullscreen(true)}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Full screen
                        </button>
                        <button
                          onClick={() => {
                            setActiveAttachment(null);
                            setPreviewFullscreen(false);
                          }}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Close Preview
                        </button>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      {activeAttachment.data.startsWith('data:image') ? (
                        <img
                          src={activeAttachment.data}
                          alt={activeAttachment.name}
                          className="max-h-[360px] w-full object-contain rounded-xl"
                        />
                      ) : activeAttachment.data.startsWith('data:video') ? (
                        <video
                          src={activeAttachment.data}
                          controls
                          className="w-full max-h-[360px] rounded-xl bg-slate-900"
                        />
                      ) : activeAttachment.data.startsWith('data:application/pdf') ? (
                        <iframe
                          title={activeAttachment.name}
                          src={activeAttachment.data}
                          className="w-full h-[360px] rounded-xl border-0"
                        />
                      ) : getMimeType(activeAttachment.data).startsWith('text/') ||
                        ['application/json', 'application/xml'].includes(
                          getMimeType(activeAttachment.data),
                        ) ? (
                        <pre className="max-h-[360px] overflow-auto text-sm text-slate-700 whitespace-pre-wrap">
                          {decodeTextData(activeAttachment.data) || 'No preview available.'}
                        </pre>
                      ) : (
                        <div className="text-sm text-slate-500 flex flex-col items-center gap-3 py-6">
                          <p>Open this file to view its contents.</p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openAttachment(activeAttachment)}
                              className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              Open file
                            </button>
                            <button
                              onClick={() => downloadAttachment(activeAttachment)}
                              className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              Download
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 mb-3">
                      Workflow Steps
                    </p>
                    <div className="space-y-3">
                      {reviewDetails.steps.map((step) => (
                        <div
                          key={step.step_id}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {step.step_order ? `${step.step_order}. ` : ''}
                              {step.step_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {step.action_type} • {step.approver_name || 'Unassigned'}
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-slate-500">
                            {step.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-5 bg-slate-50 flex items-center justify-end">
              <button
                onClick={() => {
                  setReviewId(null);
                  setReviewDetails(null);
                  setReviewError(null);
                  setActiveAttachment(null);
                  setPreviewFullscreen(false);
                }}
                className="px-5 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFullscreen && activeAttachment && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-slate-900/80"
            onClick={() => setPreviewFullscreen(false)}
          />
          <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{activeAttachment.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openAttachment(activeAttachment)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <ICONS.Eye size={14} />
                  Open
                </button>
                <button
                  onClick={() => downloadAttachment(activeAttachment)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <ICONS.Download size={14} />
                  Download
                </button>
                <button
                  onClick={() => setPreviewFullscreen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <ICONS.X size={20} />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-50">
              {activeAttachment.data.startsWith('data:image') ? (
                <img
                  src={activeAttachment.data}
                  alt={activeAttachment.name}
                  className="max-h-[80vh] w-full object-contain rounded-xl bg-white"
                />
              ) : activeAttachment.data.startsWith('data:video') ? (
                <video
                  src={activeAttachment.data}
                  controls
                  className="w-full max-h-[80vh] rounded-xl bg-slate-900"
                />
              ) : activeAttachment.data.startsWith('data:application/pdf') ? (
                <iframe
                  title={activeAttachment.name}
                  src={activeAttachment.data}
                  className="w-full h-[80vh] rounded-xl border-0 bg-white"
                />
              ) : getMimeType(activeAttachment.data).startsWith('text/') ||
                ['application/json', 'application/xml'].includes(
                  getMimeType(activeAttachment.data),
                ) ? (
                <pre className="max-h-[80vh] overflow-auto text-sm text-slate-700 whitespace-pre-wrap bg-white rounded-xl p-4">
                  {decodeTextData(activeAttachment.data) || 'No preview available.'}
                </pre>
              ) : (
                <div className="text-sm text-slate-500 bg-white rounded-xl p-6 text-center space-y-3">
                  <p>Open this file to view its contents.</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => openAttachment(activeAttachment)}
                      className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Open file
                    </button>
                    <button
                      onClick={() => downloadAttachment(activeAttachment)}
                      className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Download
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {rejectingRequest && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => {
              setRejectingRequest(null);
              setRejectComment('');
              setRejectError(null);
            }}
          />
          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Reject Request</h2>
                <p className="text-sm text-slate-500">
                  {`REQ-${String(rejectingRequest.request_id).padStart(3, '0')}`} •{' '}
                  {rejectingRequest.request_title}
                </p>
              </div>
              <button
                onClick={() => {
                  setRejectingRequest(null);
                  setRejectComment('');
                  setRejectError(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ICONS.X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Confirm this rejection. A comment is required and will be visible to the requester.
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Rejection Comment
                </label>
                <textarea
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent min-h-[120px]"
                  placeholder="Explain why this request is being rejected..."
                />
              </div>

              {rejectError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {rejectError}
                </div>
              )}
            </div>

            <div className="p-5 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setRejectingRequest(null);
                  setRejectComment('');
                  setRejectError(null);
                }}
                className="px-5 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={actioningId === rejectingRequest.request_id}
                onClick={async () => {
                  if (!rejectComment.trim()) {
                    setRejectError('Please add a rejection comment.');
                    return;
                  }
                  setRejectError(null);
                  await handleAction(
                    rejectingRequest.request_id,
                    'reject',
                    rejectComment.trim(),
                  );
                  setRejectingRequest(null);
                  setRejectComment('');
                }}
              >
                {actioningId === rejectingRequest.request_id ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmApproval)}
        title="Approve request?"
        description={
          confirmApproval
            ? `Approve "${confirmApproval.request_title}"? This will move the request to the next step.`
            : undefined
        }
        confirmLabel="Approve"
        onCancel={() => setConfirmApproval(null)}
        onConfirm={async () => {
          if (!confirmApproval) return;
          const requestId = confirmApproval.request_id;
          setConfirmApproval(null);
          await handleAction(requestId, 'approve');
        }}
      />
    </div>
  );
};

export default Approvals;
