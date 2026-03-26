import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ICONS } from '../constants';
import WorkflowBuilder from './WorkflowBuilder';
import { useSession } from '../context/SessionContext';

type WorkflowSummary = {
  workflow_id: number;
  workflow_name: string;
  description: string | null;
  created_by: number | null;
  created_by_name?: string | null;
  created_at: string | null;
  steps_count: number;
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const Workflows: React.FC = () => {
  const { apiFetch } = useSession();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = useMemo(
    () => import.meta.env.VITE_API_URL || 'http://localhost:9000',
    [],
  );

  const fetchWorkflows = useCallback(async () => {
    setIsLoading(true);
    setError(null);
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
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    if (mode === 'list') {
      fetchWorkflows();
    }
  }, [mode, fetchWorkflows]);

  if (mode === 'create') {
    return (
      <WorkflowBuilder
        cancelLabel="Back to list"
        onCancel={() => setMode('list')}
        onSaved={() => setMode('list')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workflows</h1>
          <p className="text-slate-500">
            Review and manage the workflows created across your team.
          </p>
        </div>
        <button
          className="btn-primary flex items-center justify-center gap-2"
          onClick={() => setMode('create')}
        >
          <ICONS.Plus size={18} />
          Create Workflow
        </button>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-lg">Created Workflows</h3>
          <button
            className="text-sm font-medium text-sky-blue-accent hover:underline"
            onClick={fetchWorkflows}
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, idx) => (
              <div key={idx} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-blue text-sky-blue-accent">
              <ICONS.Workflows size={22} />
            </div>
            <h4 className="text-lg font-semibold text-slate-900">No workflows yet</h4>
            <p className="text-sm text-slate-500 mt-1">
              Create your first workflow to start tracking approvals.
            </p>
            <button
              className="btn-primary mt-4 inline-flex items-center gap-2"
              onClick={() => setMode('create')}
            >
              <ICONS.Plus size={16} />
              Create Workflow
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Name</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Description</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Steps</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Created By</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {workflows.map((workflow) => (
                  <tr
                    key={workflow.workflow_id}
                    className="group hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="py-4 text-sm font-semibold text-slate-900">
                      {workflow.workflow_name}
                    </td>
                    <td className="py-4 text-sm text-slate-500">
                      {workflow.description || '—'}
                    </td>
                    <td className="py-4">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {workflow.steps_count} steps
                      </span>
                    </td>
                    <td className="py-4 text-sm text-slate-500">
                      {workflow.created_by_name
                        ? workflow.created_by_name
                        : workflow.created_by
                          ? `User #${workflow.created_by}`
                          : 'System'}
                    </td>
                    <td className="py-4 text-sm text-slate-500">
                      {formatDate(workflow.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Workflows;
