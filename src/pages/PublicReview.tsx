import React, { useEffect, useMemo, useState } from 'react';
import { ICONS } from '../constants';
import { cn } from '../lib/utils';
import ConfirmDialog from '../components/ConfirmDialog';

type RequestStepStatus = {
  step_id: number;
  step_name: string;
  step_order?: number | null;
  action_type: string;
  status: string;
  approver_name?: string | null;
  comment?: string | null;
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

const PublicReview: React.FC<{ token: string }> = ({ token }) => {
  const apiUrl = useMemo(
    () => import.meta.env.VITE_API_URL || 'http://localhost:9000',
    [],
  );
  const [details, setDetails] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAttachment, setActiveAttachment] = useState<RequestAttachment | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionCompleted, setActionCompleted] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);

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

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiUrl}/public/review/${token}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'Unable to load request.');
        }
        const data = await response.json();
        if (active) setDetails(data as RequestDetail);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load request.';
        if (active) setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [apiUrl, token]);

  const approve = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const response = await fetch(`${apiUrl}/public/review/${token}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to approve.');
      }
      setDetails((prev) => (prev ? { ...prev, status: 'Approved' } : prev));
      setActionCompleted(true);
      setActionMessage('This page is done. You may close it.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve.';
      setActionMessage(message);
    } finally {
      setActionLoading(false);
    }
  };

  const reject = async () => {
    if (!rejectComment.trim()) {
      setRejectError('Rejection comment is required.');
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    try {
      const response = await fetch(`${apiUrl}/public/review/${token}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: rejectComment.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to reject.');
      }
      setDetails((prev) => (prev ? { ...prev, status: 'Rejected' } : prev));
      setActionCompleted(true);
      setActionMessage('This page is done. You may close it.');
      setRejecting(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject.';
      setActionMessage(message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Request Review</h1>
            <p className="text-slate-500">
              {details ? `REQ-${String(details.request_id).padStart(3, '0')}` : 'Loading...'}
            </p>
          </div>
          <button className="p-2 rounded-full hover:bg-slate-100 text-slate-400">
            <ICONS.X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          {loading || !details ? (
            <div className="space-y-3">
              <div className="h-6 rounded bg-slate-100 animate-pulse" />
              <div className="h-24 rounded bg-slate-100 animate-pulse" />
              <div className="h-12 rounded bg-slate-100 animate-pulse" />
            </div>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-blue flex items-center justify-center text-sky-blue-accent">
                  <ICONS.FileText size={22} />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-slate-900">{details.title}</h2>
                  <p className="text-sm text-slate-500">
                    {details.workflow_name || details.request_type} • Submitted by{' '}
                    {details.created_by_name || 'Unknown'} • {formatDate(details.created_at)}
                  </p>
                </div>
                <span
                  className={cn(
                    'status-badge',
                    details.status === 'Approved'
                      ? 'status-approved'
                      : details.status === 'Rejected'
                        ? 'status-rejected'
                        : 'status-pending',
                  )}
                >
                  {details.status}
                </span>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Description</p>
                <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">
                  {details.description || 'No description provided.'}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-slate-400 mb-2">Attachments</p>
                {details.attachments.length === 0 ? (
                  <p className="text-sm text-slate-500">No files attached.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {details.attachments.map((file, idx) => (
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
                    <p className="text-xs font-semibold uppercase text-slate-400">File Preview</p>
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
                <p className="text-xs font-semibold uppercase text-slate-400 mb-3">Workflow Steps</p>
                <div className="space-y-3">
                  {details.steps.map((step) => (
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
                      <span className="text-xs font-semibold text-slate-500">{step.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {actionMessage && (
                <div
                  className={cn(
                    'rounded-xl border px-4 py-3 text-sm',
                    actionCompleted
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-slate-50 text-slate-700',
                  )}
                >
                  {actionMessage}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={actionLoading || actionCompleted || details.status !== 'Pending'}
                  onClick={() => {
                    setRejecting(true);
                    setRejectComment('');
                    setRejectError(null);
                  }}
                >
                  Reject
                </button>
                <button
                  className="px-5 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={actionLoading || actionCompleted || details.status !== 'Pending'}
                  onClick={() => setConfirmApprove(true)}
                >
                  {actionLoading ? 'Working...' : 'Accept'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold">Reject Request</h2>
              <button
                onClick={() => setRejecting(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ICONS.X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent min-h-[120px]"
                placeholder="Explain the reason for rejection..."
              />
              {rejectError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {rejectError}
                </div>
              )}
            </div>
            <div className="p-5 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setRejecting(false)}
                className="px-5 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={actionLoading}
                onClick={reject}
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmApprove}
        title="Approve request?"
        description={
          details
            ? `Approve "${details.title}" and move it to the next step?`
            : 'Approve this request and move it to the next step?'
        }
        confirmLabel="Approve"
        onCancel={() => setConfirmApprove(false)}
        onConfirm={async () => {
          setConfirmApprove(false);
          await approve();
        }}
      />

      {previewFullscreen && activeAttachment && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-6">
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
    </div>
  );
};

export default PublicReview;
