import React, { useState } from 'react';
import { ICONS } from '../constants';
import { useSession } from '../context/SessionContext';

const Login: React.FC = () => {
  const { setSession } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:9000';

  const submit = async (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }
    setError(null);

    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Login failed.');
      }

      const session = await response.json();
      setSession(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-sky-blue-accent flex items-center justify-center text-white">
            <ICONS.Workflows size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">DocFlow</h1>
            <p className="text-slate-500 text-sm">Sign in to your workspace</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-blue-accent"
              placeholder="********"
            />
          </div>
          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <button className="btn-primary w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        
      </div>
    </div>
  );
};

export default Login;
