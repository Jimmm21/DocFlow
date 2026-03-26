import React, { useEffect, useMemo, useState } from 'react';
import { ICONS } from '../constants';
import { useSession } from '../context/SessionContext';
import ConfirmDialog from '../components/ConfirmDialog';

const Settings: React.FC = () => {
  const { apiFetch, session, setSession } = useSession();
  const apiUrl = useMemo(
    () => import.meta.env.VITE_API_URL || 'http://localhost:9000',
    [],
  );
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email?: string | null;
  }>({ connected: false });
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [gmailSuccess, setGmailSuccess] = useState<string | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [confirmProfileUpdate, setConfirmProfileUpdate] = useState(false);
  const [confirmPasswordUpdate, setConfirmPasswordUpdate] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail') === 'connected') {
      setGmailSuccess('Gmail connected successfully.');
      params.delete('gmail');
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const response = await apiFetch(`${apiUrl}/me`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'Failed to load profile.');
        }
        const data = await response.json();
        if (active) {
          setProfileName(data.name || '');
          setProfileEmail(data.email || '');
          setEmailVerified(Boolean(data.email_verified));
          setProfileAvatar(data.avatar_url || null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load profile.';
        if (active) {
          setProfileError(message);
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };
    loadProfile();
    return () => {
      active = false;
    };
  }, [apiFetch, apiUrl]);

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      setGmailLoading(true);
      setGmailError(null);
      try {
        const response = await apiFetch(`${apiUrl}/integrations/gmail/status`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'Failed to load Gmail status.');
        }
        const data = await response.json();
        if (active) {
          setGmailStatus({
            connected: Boolean(data.connected),
            email: data.email || null,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load Gmail status.';
        if (active) {
          setGmailError(message);
        }
      } finally {
        if (active) {
          setGmailLoading(false);
        }
      }
    };
    loadStatus();
    return () => {
      active = false;
    };
  }, [apiFetch, apiUrl]);

  const startGmailConnect = async () => {
    setGmailError(null);
    setGmailLoading(true);
    try {
      const response = await apiFetch(`${apiUrl}/integrations/gmail/start`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to start Gmail verification.');
      }
      const data = await response.json();
      if (!data.url) {
        throw new Error('Missing OAuth URL.');
      }
      window.location.href = data.url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to start Gmail verification.';
      setGmailError(message);
      setGmailLoading(false);
    }
  };

  const updateProfile = async () => {
    setProfileError(null);
    setProfileSuccess(null);
    if (!profileName.trim()) {
      setProfileError('Full name is required.');
      return;
    }
    if (!emailVerified && !profileEmail.trim()) {
      setProfileError('Email is required.');
      return;
    }

    setProfileLoading(true);
    try {
      const payload: { name: string; email?: string } = {
        name: profileName.trim(),
      };
      if (!emailVerified) {
        payload.email = profileEmail.trim();
      }

      const response = await apiFetch(`${apiUrl}/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to update profile.');
      }
      const data = await response.json();
      setProfileName(data.name || '');
      setProfileEmail(data.email || '');
      setEmailVerified(Boolean(data.email_verified));
      setProfileAvatar(data.avatar_url || null);
      if (session) {
        setSession({
          user_id: session.user_id,
          name: data.name,
          email: data.email,
          role_name: data.role_name ?? session.role_name,
          avatar_url: data.avatar_url ?? session.avatar_url ?? null,
        });
      }
      setProfileSuccess('Profile updated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update profile.';
      setProfileError(message);
    } finally {
      setProfileLoading(false);
    }
  };

  const readAvatar = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });

  const updateAvatar = async (file: File) => {
    setAvatarError(null);
    setAvatarSuccess(null);
    setAvatarLoading(true);
    try {
      const dataUrl = await readAvatar(file);
      const response = await apiFetch(`${apiUrl}/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: dataUrl }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to update avatar.');
      }
      const data = await response.json();
      setProfileAvatar(data.avatar_url || null);
      if (session) {
        setSession({
          user_id: session.user_id,
          name: data.name ?? session.name,
          email: data.email ?? session.email,
          role_name: data.role_name ?? session.role_name,
          avatar_url: data.avatar_url ?? null,
        });
      }
      setAvatarSuccess('Avatar updated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update avatar.';
      setAvatarError(message);
    } finally {
      setAvatarLoading(false);
    }
  };

  const updatePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword.trim() || !newPassword.trim()) {
      setPasswordError('Current and new password are required.');
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await apiFetch(`${apiUrl}/me/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to change password.');
      }
      setCurrentPassword('');
      setNewPassword('');
      setPasswordSuccess('Password updated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password.';
      setPasswordError(message);
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">Configure your personal preferences and system settings.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h3 className="font-bold text-lg mb-6">Profile Information</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-6 mb-6">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden">
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <ICONS.User size={40} />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="btn-secondary text-sm cursor-pointer">
                    {avatarLoading ? 'Uploading...' : 'Change Avatar'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          updateAvatar(file);
                        }
                        e.currentTarget.value = '';
                      }}
                      disabled={avatarLoading}
                    />
                  </label>
                  <button
                    className="btn-primary text-sm"
                    onClick={() => setConfirmProfileUpdate(true)}
                    disabled={profileLoading}
                  >
                    {profileLoading ? 'Saving...' : 'Update Profile'}
                  </button>
                </div>
              </div>
              {avatarError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
                  {avatarError}
                </div>
              )}
              {avatarSuccess && (
                <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-2 text-sm text-green-700">
                  {avatarSuccess}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-blue-accent"
                    placeholder="Full name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-blue-accent"
                    placeholder="Email address"
                    disabled={emailVerified}
                  />
                  {emailVerified && (
                    <p className="text-xs text-green-600 font-semibold">
                      Verified via Gmail. Email is locked to the verified address.
                    </p>
                  )}
                </div>
              </div>
              {profileError && (
                <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="mt-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {profileSuccess}
                </div>
              )}
            </div>
          </div>

        </div>

        <div className="space-y-6">
          <div className="card bg-sky-blue-accent text-white border-none">
            <h3 className="font-bold text-lg mb-2">Pro Plan</h3>
            <p className="text-sky-100 text-sm mb-6">Get unlimited workflows and advanced analytics.</p>
            <button className="w-full py-2.5 bg-white text-sky-blue-accent font-bold rounded-xl hover:bg-sky-50 transition-colors">
              Upgrade Now
            </button>
          </div>
          
          <div className="card">
            <h3 className="font-bold text-lg mb-4">Security</h3>
            <button
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors"
              onClick={() => setShowPasswordForm((prev) => !prev)}
            >
              <span className="text-sm font-medium">Change Password</span>
              <ICONS.ChevronRight size={16} className="text-slate-400" />
            </button>
            {showPasswordForm && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-blue-accent"
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-blue-accent"
                    placeholder="Enter new password"
                  />
                </div>
                {passwordError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-xs text-green-700">
                    {passwordSuccess}
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    className="btn-primary text-sm"
                    onClick={() => setConfirmPasswordUpdate(true)}
                    disabled={passwordLoading}
                  >
                    {passwordLoading ? 'Saving...' : 'Update Password'}
                  </button>
                </div>
              </div>
            )}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Verify Email (Gmail)</p>
                  <p className="text-xs text-slate-500">
                    {gmailStatus.connected
                      ? `Connected as ${gmailStatus.email || 'your Gmail'}`
                      : 'Connect your Gmail account to the system.'}
                  </p>
                </div>
                <button
                  className="btn-secondary text-sm"
                  onClick={startGmailConnect}
                  disabled={gmailLoading}
                >
                  {gmailStatus.connected ? 'Reconnect' : 'Verify Email'}
                </button>
              </div>
              {gmailSuccess && (
                <div className="text-xs text-green-600 font-semibold">{gmailSuccess}</div>
              )}
              {gmailError && (
                <div className="text-xs text-red-600 font-semibold">{gmailError}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmProfileUpdate}
        title="Update profile?"
        description="Save these profile changes?"
        confirmLabel="Update Profile"
        onCancel={() => setConfirmProfileUpdate(false)}
        onConfirm={async () => {
          setConfirmProfileUpdate(false);
          await updateProfile();
        }}
      />

      <ConfirmDialog
        open={confirmPasswordUpdate}
        title="Update password?"
        description="Change your account password now?"
        confirmLabel="Update Password"
        onCancel={() => setConfirmPasswordUpdate(false)}
        onConfirm={async () => {
          setConfirmPasswordUpdate(false);
          await updatePassword();
        }}
      />
    </div>
  );
};

export default Settings;
