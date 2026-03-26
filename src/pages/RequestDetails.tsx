import React, { useEffect, useMemo, useState } from 'react';
import { ICONS } from '../constants';
import { cn } from '../lib/utils';
import { useSession } from '../context/SessionContext';
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
  created_by?: number | null;
  created_by_name?: string | null;
  created_at?: string | null;
  current_step_name?: string | null;
  steps: RequestStepStatus[];
  attachments: RequestAttachment[];
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const RequestDetails: React.FC<{
  requestId: number;
  onBack: () => void;
  mode?: 'view' | 'edit';
}> = ({ requestId, onBack, mode = 'view' }) => {
  const { apiFetch, session } = useSession();
  const apiUrl = useMemo(
    () => import.meta.env.VITE_API_URL || 'http://localhost:9000',
    [],
  );
  const [details, setDetails] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAttachment, setActiveAttachment] = useState<RequestAttachment | null>(null);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(mode === 'edit');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
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
    let mounted = true;
    const loadDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch(`${apiUrl}/requests/${requestId}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'Failed to load request details.');
        }
        const data = await response.json();
        if (mounted) {
          const nextDetails = data as RequestDetail;
          setDetails(nextDetails);
          setEditTitle(nextDetails.title || '');
          setEditDescription(nextDetails.description || '');
          setIsEditing(mode === 'edit');
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load request details.';
        if (mounted) {
          setError(message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    loadDetails();
    return () => {
      mounted = false;
    };
  }, [apiFetch, apiUrl, requestId]);
  useEffect(() => {
    setIsEditing(mode === 'edit');
  }, [mode, requestId]);

  const totalSteps = details?.steps.length || 0;
  const completedSteps =
    details?.steps.filter((step) => step.status === 'Completed').length || 0;
  const progress = totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const canEdit =
    details &&
    details.status === 'Pending' &&
    session?.user_id &&
    details.created_by === session.user_id;

  useEffect(() => {
    if (!canEdit) {
      setIsEditing(false);
    }
  }, [canEdit]);

  const saveChanges = async () => {
    setSaveError(null);
    if (!editTitle.trim()) {
      setSaveError('Title is required.');
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch(`${apiUrl}/requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to update request.');
      }
      const refresh = await apiFetch(`${apiUrl}/requests/${requestId}`);
      if (!refresh.ok) {
        const body = await refresh.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to reload request.');
      }
      const data = (await refresh.json()) as RequestDetail;
      setDetails(data);
      setEditTitle(data.title || '');
      setEditDescription(data.description || '');
      setIsEditing(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update request.';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <ICONS.ArrowRight className="rotate-180" size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Request Details</h1>
          <p className="text-slate-500">
            {`REQ-${String(requestId).padStart(3, '0')}`}
          </p>
        </div>
        {details && canEdit && (
          <div className="ml-auto flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setIsEditing(false);
                    setEditTitle(details.title || '');
                    setEditDescription(details.description || '');
                    setSaveError(null);
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={() => setConfirmSave(true)}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <button
                className="btn-secondary"
                onClick={() => setIsEditing(true)}
              >
                Edit Request
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading || !details ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card h-40 animate-pulse bg-slate-100" />
            <div className="card h-72 animate-pulse bg-slate-100" />
          </div>
          <div className="card h-72 animate-pulse bg-slate-100" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                    />
                  ) : (
                    <h3 className="font-bold text-lg">{details.title}</h3>
                  )}
                  <p className="text-sm text-slate-500">
                    {details.workflow_name || details.request_type}
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
              <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Requester</p>
                  <p className="font-semibold">{details.created_by_name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Submitted</p>
                  <p className="font-semibold">{formatDateTime(details.created_at)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Description</p>
                  {isEditing ? (
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent min-h-[120px]"
                      placeholder="Describe the request..."
                    />
                  ) : (
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                      {details.description || 'No description provided.'}
                    </p>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Attachments</p>
                  {details.attachments.length === 0 ? (
                    <p className="text-sm text-slate-500">No files attached.</p>
                  ) : (
                    <div className="flex flex-wrap gap-3 mt-2">
                      {details.attachments.map((file, idx) => (
                        <button
                          key={`${file.name}-${idx}`}
                          onClick={() => {
                            setActiveAttachment(file);
                            setPreviewFullscreen(false);
                          }}
                          className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 hover:border-sky-blue-accent transition-colors"
                        >
                          <ICONS.FileText size={16} className="text-sky-blue-accent" />
                          <span className="text-xs font-medium">{file.name}</span>
                          <span className="text-[10px] text-slate-400">View</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {activeAttachment && (
                  <div className="col-span-2">
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
                {saveError && (
                  <div className="col-span-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {saveError}
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h3 className="font-bold text-lg mb-6">Approval History</h3>
              <div className="space-y-8 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                {details.steps.map((step) => {
                  const isCompleted = step.status === 'Completed';
                  const isCurrent = step.status === 'Current';
                  const isRejected = step.status === 'Rejected';
                  return (
                    <div key={step.step_id} className="relative pl-10">
                      <div
                        className={cn(
                          'absolute left-0 top-0 w-9 h-9 rounded-full flex items-center justify-center z-10',
                          isCompleted
                            ? 'bg-green-500 text-white'
                            : isRejected
                              ? 'bg-red-500 text-white'
                              : isCurrent
                                ? 'bg-sky-blue-accent text-white ring-4 ring-sky-blue'
                                : 'bg-slate-100 text-slate-400',
                        )}
                      >
                        {isCompleted ? (
                          <ICONS.CheckCircle size={18} />
                        ) : isRejected ? (
                          <ICONS.XCircle size={18} />
                        ) : isCurrent ? (
                          <ICONS.Clock size={18} />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-current" />
                        )}
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-slate-900">{step.step_name}</h4>
                          <p className="text-sm text-slate-500">
                            {step.approver_name || 'Unassigned'} • {step.action_type}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-400 uppercase">
                            {step.status}
                          </p>
                        </div>
                      </div>
                      {step.comment && (
                        <div className="mt-2 p-3 bg-slate-50 rounded-xl text-sm text-slate-600 italic">
                          "{step.comment}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card">
              <h3 className="font-bold text-lg mb-6">Workflow Progress</h3>
              <div className="flex flex-col items-center py-4">
                <div className="relative w-32 h-32 mb-6">
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    <circle
                      className="text-slate-100 stroke-current"
                      strokeWidth="10"
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                    ></circle>
                    <circle
                      className="text-sky-blue-accent stroke-current"
                      strokeWidth="10"
                      strokeLinecap="round"
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      strokeDasharray="251.2"
                      strokeDashoffset={251.2 - (251.2 * progress) / 100}
                    ></circle>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="text-2xl font-black">{progress}%</span>
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Complete
                    </span>
                  </div>
                </div>
                <div className="w-full space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Current Step</span>
                    <span className="font-bold">
                      {details.current_step_name || 'Completed'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Steps Completed</span>
                    <span className="font-bold">
                      {completedSteps} / {totalSteps}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {details.status === 'Rejected' && (
              <div className="card border border-red-200 bg-red-50">
                <h3 className="font-bold text-lg text-red-700 mb-2">Rejected</h3>
                <p className="text-sm text-red-700">
                  This request was rejected. See the comment in the timeline.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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

      <ConfirmDialog
        open={confirmSave}
        title="Save changes?"
        description="Update this request with your latest edits?"
        confirmLabel="Save Changes"
        onCancel={() => setConfirmSave(false)}
        onConfirm={async () => {
          setConfirmSave(false);
          await saveChanges();
        }}
      />
    </div>
  );
};

export default RequestDetails;
