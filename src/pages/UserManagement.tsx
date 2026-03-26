import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ICONS } from '../constants';
import { cn } from '../lib/utils';
import { useSession } from '../context/SessionContext';
import ConfirmDialog from '../components/ConfirmDialog';

type RoleOption = {
  role_id: number;
  role_name: string;
};

type UserSummary = {
  user_id: number;
  name: string;
  email: string;
  role_id: number | null;
  role_name?: string | null;
  created_at?: string | null;
};

const UserManagement: React.FC = () => {
  const { apiFetch } = useSession();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRoleId, setEditRoleId] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserSummary | null>(null);
  const [confirmEditSave, setConfirmEditSave] = useState(false);

  const apiUrl = useMemo(
    () => import.meta.env.VITE_API_URL || 'http://localhost:9000',
    [],
  );

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const response = await apiFetch(`${apiUrl}/users`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to load users.');
      }
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users.';
      setError(message);
    } finally {
      setLoadingUsers(false);
    }
  }, [apiUrl, apiFetch]);

  const fetchRoles = useCallback(async () => {
    setLoadingRoles(true);
    setError(null);
    try {
      const response = await apiFetch(`${apiUrl}/roles`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to load roles.');
      }
      const data = await response.json();
      setRoles(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load roles.';
      setError(message);
    } finally {
      setLoadingRoles(false);
    }
  }, [apiUrl, apiFetch]);

  useEffect(() => {
    if (mode === 'list') {
      fetchUsers();
      fetchRoles();
    }
  }, [mode, fetchUsers, fetchRoles]);

  useEffect(() => {
    if (mode === 'create') {
      fetchRoles();
    }
  }, [mode, fetchRoles]);

  const resetForm = () => {
    setName('');
    setEmail('');
    setRoleId('');
    setPassword('');
    setSubmitError(null);
  };

  const resetRoleForm = () => {
    setRoleName('');
    setRoleError(null);
  };

  const createUser = async () => {
    setSubmitError(null);

    if (!name.trim()) {
      setSubmitError('Name is required.');
      return;
    }

    if (!email.trim()) {
      setSubmitError('Email is required.');
      return;
    }

    if (!password) {
      setSubmitError('Password is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        role_id: roleId ? Number(roleId) : null,
        password,
      };

      const response = await apiFetch(`${apiUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to add user.');
      }

      resetForm();
      setMode('list');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add user.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const createRole = async () => {
    setRoleError(null);
    if (!roleName.trim()) {
      setRoleError('Role name is required.');
      return;
    }

    setRoleSubmitting(true);
    try {
      const response = await apiFetch(`${apiUrl}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_name: roleName.trim() }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to add role.');
      }

      resetRoleForm();
      setShowRoleForm(false);
      fetchRoles();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add role.';
      setRoleError(message);
    } finally {
      setRoleSubmitting(false);
    }
  };

  const startEdit = (user: UserSummary) => {
    setEditingUser(user);
    setEditName(user.name || '');
    setEditEmail(user.email || '');
    setEditRoleId(user.role_id ? String(user.role_id) : '');
    setEditPassword('');
    setEditError(null);
  };

  const closeEdit = () => {
    setEditingUser(null);
    setEditName('');
    setEditEmail('');
    setEditRoleId('');
    setEditPassword('');
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    setEditError(null);
    if (!editName.trim()) {
      setEditError('Name is required.');
      return;
    }
    if (!editEmail.trim()) {
      setEditError('Email is required.');
      return;
    }

    setEditSubmitting(true);
    try {
      const payload = {
        name: editName.trim(),
        email: editEmail.trim(),
        role_id: editRoleId ? Number(editRoleId) : null,
        password: editPassword ? editPassword : undefined,
      };

      const response = await apiFetch(`${apiUrl}/users/${editingUser.user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to update user.');
      }

      await fetchUsers();
      closeEdit();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user.';
      setEditError(message);
    } finally {
      setEditSubmitting(false);
    }
  };

  const deleteUser = async (user: UserSummary) => {
    setError(null);
    try {
      const response = await apiFetch(`${apiUrl}/users/${user.user_id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to delete user.');
      }
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete user.';
      setError(message);
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
                setMode('list');
              }}
            >
              <ICONS.ArrowRight className="rotate-180" size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Add User</h1>
              <p className="text-slate-500">Create a new user and assign a role.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn-secondary"
              onClick={() => {
                resetForm();
                setMode('list');
              }}
            >
              Cancel
            </button>
            <button className="btn-primary" onClick={createUser} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save User'}
            </button>
          </div>
        </div>

        <div className="card space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                placeholder="e.g., Jane Smith"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                placeholder="jane@company.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                placeholder="Create a password"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Role</label>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                disabled={loadingRoles}
              >
                <option value="">Select a role</option>
                {roles.map((role) => (
                  <option key={role.role_id} value={role.role_id}>
                    {role.role_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-secondary whitespace-nowrap"
                onClick={() => {
                  setShowRoleForm((prev) => !prev);
                  setRoleError(null);
                }}
              >
                {showRoleForm ? 'Hide Role' : 'Add Role'}
              </button>
            </div>
            {showRoleForm && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-slate-500">Role Name</label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                    placeholder="e.g., Legal"
                  />
                </div>
                {roleError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
                    {roleError}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={createRole}
                    disabled={roleSubmitting}
                  >
                    {roleSubmitting ? 'Saving...' : 'Save Role'}
                  </button>
                  <button
                    type="button"
                    className="text-sm font-medium text-slate-500 hover:text-slate-700"
                    onClick={() => {
                      resetRoleForm();
                      setShowRoleForm(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {submitError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {submitError}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500">Manage user roles and permissions across the system.</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setMode('create')}>
          <ICONS.Plus size={18} />
          Add User
        </button>
      </div>

      <div className="card">
        {error && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {loadingUsers ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, idx) => (
              <div key={idx} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-4 font-semibold text-slate-500 text-sm">User</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Role</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm">Status</th>
                  <th className="pb-4 font-semibold text-slate-500 text-sm text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((user) => (
                  <tr key={user.user_id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{user.name}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-xs font-medium",
                        user.role_name === 'Admin' ? "bg-purple-100 text-purple-800" :
                        user.role_name === 'Manager' ? "bg-blue-100 text-blue-800" :
                        "bg-slate-100 text-slate-800"
                      )}>
                        {user.role_name || 'Unassigned'}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-sm text-slate-600">Active</span>
                      </div>
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                          onClick={() => startEdit(user)}
                          title="Edit"
                        >
                          <ICONS.Edit2 size={16} />
                        </button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                          onClick={() => setConfirmDeleteUser(user)}
                          title="Delete"
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

      {editingUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={closeEdit}
          />
          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Edit User</h2>
                <p className="text-sm text-slate-500">{editingUser.email}</p>
              </div>
              <button
                onClick={closeEdit}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ICONS.X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-slate-500">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-slate-500">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-slate-500">Role</label>
                  <select
                    value={editRoleId}
                    onChange={(e) => setEditRoleId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                    disabled={loadingRoles}
                  >
                    <option value="">Unassigned</option>
                    {roles.map((role) => (
                      <option key={role.role_id} value={role.role_id}>
                        {role.role_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-slate-500">
                    New Password (optional)
                  </label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
                    placeholder="Leave blank to keep current"
                  />
                </div>
              </div>

              {editError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {editError}
                </div>
              )}
            </div>

            <div className="p-5 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={closeEdit}
                className="px-5 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                disabled={editSubmitting}
              >
                Cancel
              </button>
              <button
                className="px-5 py-2 rounded-xl bg-sky-blue-accent hover:bg-sky-600 text-white font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={editSubmitting}
                onClick={() => setConfirmEditSave(true)}
              >
                {editSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteUser)}
        title="Delete user?"
        description={
          confirmDeleteUser
            ? `Delete ${confirmDeleteUser.name}? This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDeleteUser(null)}
        onConfirm={async () => {
          if (!confirmDeleteUser) return;
          const user = confirmDeleteUser;
          setConfirmDeleteUser(null);
          await deleteUser(user);
        }}
      />

      <ConfirmDialog
        open={confirmEditSave}
        title="Save changes?"
        description="Update this user with the new details?"
        confirmLabel="Save Changes"
        onCancel={() => setConfirmEditSave(false)}
        onConfirm={async () => {
          setConfirmEditSave(false);
          await saveEdit();
        }}
      />
    </div>
  );
};

export default UserManagement;
