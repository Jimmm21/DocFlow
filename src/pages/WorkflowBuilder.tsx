import React, { useEffect, useMemo, useState } from 'react';
import { motion, Reorder } from 'motion/react';
import { ICONS } from '../constants';
import { cn } from '../lib/utils';
import { useSession } from '../context/SessionContext';
import ConfirmDialog from '../components/ConfirmDialog';

type WorkflowStep = {
  id: string;
  name: string;
  role: string;
  type: 'Approve' | 'Review';
};

type RoleOption = {
  role_id: number;
  role_name: string;
};

type WorkflowBuilderProps = {
  onCancel?: () => void;
  onSaved?: () => void;
  cancelLabel?: string;
};

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  onCancel,
  onSaved,
  cancelLabel = 'Discard',
}) => {
  const { session, apiFetch } = useSession();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:9000';
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([
    { id: '1', name: 'Initial Review', role: 'Team Lead', type: 'Review' },
    { id: '2', name: 'Technical Validation', role: 'Senior Developer', type: 'Review' },
    { id: '3', name: 'Final Approval', role: 'Manager', type: 'Approve' },
  ]);
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);

  useEffect(() => {
    let active = true;
    const loadRoles = async () => {
      setRolesError(null);
      try {
        const response = await apiFetch(`${apiUrl}/roles`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'Failed to load roles.');
        }
        const data = await response.json();
        if (active) {
          setRoles(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load roles.';
        if (active) {
          setRolesError(message);
        }
      }
    };
    loadRoles();
    return () => {
      active = false;
    };
  }, [apiFetch, apiUrl]);

  const roleOptions = useMemo(() => roles.map((role) => role.role_name), [roles]);

  const addStep = () => {
    const fallbackRole = roleOptions[0] || 'Assignee';
    const newStep: WorkflowStep = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Step',
      role: fallbackRole,
      type: 'Review',
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const saveWorkflow = async () => {
    setSaveError(null);
    setSaveSuccess(null);
    let shouldNavigate = false;

    if (!workflowName.trim()) {
      setSaveError('Workflow name is required.');
      return;
    }
    if (!session?.user_id) {
      setSaveError('No active user session.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        workflow_name: workflowName.trim(),
        description: workflowDescription.trim() || null,
        steps: steps.map((step, idx) => ({
          step_name: step.name,
          role_name: step.role,
          action_type: step.type.toLowerCase(),
          step_order: idx + 1,
        })),
      };

      const response = await apiFetch(`${apiUrl}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to save workflow.');
      }

      if (onSaved) {
        shouldNavigate = true;
      } else {
        setSaveSuccess('Workflow saved.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save workflow.';
      setSaveError(message);
    } finally {
      setIsSaving(false);
      if (shouldNavigate && onSaved) {
        onSaved();
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workflow Builder</h1>
          <p className="text-slate-500">Design dynamic approval sequences with drag-and-drop ease.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="btn-primary"
            onClick={() => setConfirmSave(true)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Workflow'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Workflow Name</label>
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
              placeholder="e.g., Deployment Approval"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Description</label>
            <input
              type="text"
              value={workflowDescription}
              onChange={(e) => setWorkflowDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
              placeholder="Optional"
            />
          </div>
        </div>
        {(saveError || saveSuccess) && (
          <div className="mt-3 text-sm">
            {saveError && <p className="text-red-600">{saveError}</p>}
            {saveSuccess && <p className="text-green-600">{saveSuccess}</p>}
          </div>
        )}
      </div>

      <div className="card bg-slate-50 border-dashed border-2 min-h-[600px] relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#0ea5e9 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        
        <div className="relative z-10 flex flex-col items-center py-12">
          <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg mb-8">
            <ICONS.Plus size={24} />
          </div>
          <div className="w-px h-8 bg-slate-300 mb-8"></div>

          <Reorder.Group axis="y" values={steps} onReorder={setSteps} className="space-y-12 w-full max-w-md">
            {steps.map((step, idx) => (
              <Reorder.Item key={step.id} value={step} className="relative">
                <motion.div 
                  layout
                  className="card p-5 border-2 border-transparent hover:border-sky-blue-accent transition-all cursor-grab active:cursor-grabbing group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-blue flex items-center justify-center text-sky-blue-accent font-bold">
                        {idx + 1}
                      </div>
                      <input 
                        type="text" 
                        value={step.name} 
                        onChange={(e) => {
                          const newSteps = [...steps];
                          newSteps[idx].name = e.target.value;
                          setSteps(newSteps);
                        }}
                        className="font-bold bg-transparent border-none focus:ring-0 p-0 w-40"
                      />
                    </div>
                    <button 
                      onClick={() => removeStep(step.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <ICONS.Trash2 size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Assigned Role</label>
                      <select 
                        value={step.role}
                        onChange={(e) => {
                          const newSteps = [...steps];
                          newSteps[idx].role = e.target.value;
                          setSteps(newSteps);
                        }}
                        className="w-full bg-slate-50 border-none rounded-lg text-sm p-2 outline-none"
                      >
                        {step.role && !roleOptions.includes(step.role) && (
                          <option value={step.role}>{step.role}</option>
                        )}
                        {roleOptions.length === 0 && (
                          <option value="">No roles available</option>
                        )}
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      {rolesError && (
                        <p className="text-[10px] text-red-500 mt-1">{rolesError}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Action Type</label>
                      <div className="flex p-1 bg-slate-50 rounded-lg">
                        <button 
                          onClick={() => {
                            const newSteps = [...steps];
                            newSteps[idx].type = 'Review';
                            setSteps(newSteps);
                          }}
                          className={cn("flex-1 py-1 text-xs rounded-md transition-all", step.type === 'Review' ? "bg-white shadow-sm font-bold" : "text-slate-500")}
                        >
                          Review
                        </button>
                        <button 
                          onClick={() => {
                            const newSteps = [...steps];
                            newSteps[idx].type = 'Approve';
                            setSteps(newSteps);
                          }}
                          className={cn("flex-1 py-1 text-xs rounded-md transition-all", step.type === 'Approve' ? "bg-white shadow-sm font-bold" : "text-slate-500")}
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
                
                {idx < steps.length - 1 && (
                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <div className="w-px h-10 bg-slate-300"></div>
                    <ICONS.ChevronRight className="rotate-90 text-slate-300 -mt-1" size={16} />
                  </div>
                )}
              </Reorder.Item>
            ))}
          </Reorder.Group>

          <button 
            onClick={addStep}
            className="mt-12 group flex flex-col items-center gap-2"
          >
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 group-hover:border-sky-blue-accent group-hover:text-sky-blue-accent transition-all">
              <ICONS.Plus size={20} />
            </div>
            <span className="text-sm font-medium text-slate-400 group-hover:text-sky-blue-accent">Add Step</span>
          </button>

          <div className="w-px h-8 bg-slate-300 mt-8"></div>
          <div className="w-12 h-12 rounded-full bg-sky-blue-accent flex items-center justify-center text-white shadow-lg mt-8">
            <ICONS.CheckCircle size={24} />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSave}
        title="Save workflow?"
        description="Save this workflow and make it available for requests?"
        confirmLabel="Save Workflow"
        onCancel={() => setConfirmSave(false)}
        onConfirm={async () => {
          setConfirmSave(false);
          await saveWorkflow();
        }}
      />
    </div>
  );
};

export default WorkflowBuilder;
