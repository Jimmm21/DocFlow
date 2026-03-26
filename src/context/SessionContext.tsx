import React, { createContext, useContext, useMemo, useState } from 'react';

export type Session = {
  user_id: number;
  name: string;
  email: string;
  role_name?: string | null;
  avatar_url?: string | null;
};

type SessionContextValue = {
  session: Session | null;
  setSession: (session: Session) => void;
  clearSession: () => void;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const SESSION_KEY = 'docflow_session';

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSessionState] = useState<Session | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  });

  const setSession = (nextSession: Session) => {
    setSessionState(nextSession);
    try {
      const { avatar_url, ...persisted } = nextSession;
      localStorage.setItem(SESSION_KEY, JSON.stringify(persisted));
    } catch {
      // ignore storage quota errors
    }
  };

  const clearSession = () => {
    setSessionState(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const apiFetch = useMemo(() => {
    return (input: RequestInfo | URL, init: RequestInit = {}) => {
      const headers = new Headers(init.headers || {});
      if (session?.user_id) {
        headers.set('X-User-Id', String(session.user_id));
      }
      return fetch(input, { ...init, headers });
    };
  }, [session]);

  React.useEffect(() => {
    if (!session?.user_id || session.avatar_url) return;
    let active = true;
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:9000';
    const load = async () => {
      try {
        const response = await fetch(`${apiUrl}/me`, {
          headers: { 'X-User-Id': String(session.user_id) },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (active && data.avatar_url) {
          setSessionState((prev) =>
            prev ? { ...prev, avatar_url: data.avatar_url } : prev,
          );
        }
      } catch {
        // ignore
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [session?.user_id, session?.avatar_url]);

  return (
    <SessionContext.Provider value={{ session, setSession, clearSession, apiFetch }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
};
