import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ICONS, NAV_ITEMS, NavItem } from '../constants';
import { useSession } from '../context/SessionContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isCollapsed, setIsCollapsed }) => {
  const { session } = useSession();
  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 260 }}
      className={cn(
        "fixed left-0 top-0 h-screen bg-white border-r border-slate-200 z-50 transition-colors duration-300",
        "flex flex-col"
      )}
    >
      <div className="p-6 flex items-center justify-between">
        {!isCollapsed && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 font-bold text-xl text-sky-blue-accent"
          >
            <div className="w-8 h-8 bg-sky-blue-accent rounded-lg flex items-center justify-center text-white">
              <ICONS.Workflows size={20} />
            </div>
            <span>DocFlow</span>
          </motion.div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 bg-sky-blue-accent rounded-lg flex items-center justify-center text-white mx-auto">
            <ICONS.Workflows size={20} />
          </div>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hidden lg:block"
        >
          {isCollapsed ? <ICONS.ChevronRight size={18} /> : <ICONS.Menu size={18} />}
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-1 mt-4">
        {NAV_ITEMS.filter((item) => {
          if (item.id !== 'user-management') return true;
          return session?.role_name === 'Admin';
        }).map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                isActive 
                  ? "bg-sky-blue text-sky-blue-accent font-medium" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon size={20} className={cn(isActive ? "text-sky-blue-accent" : "text-slate-400 group-hover:text-slate-600")} />
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  {item.label}
                </motion.span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200">
        <div className={cn("flex items-center gap-3", isCollapsed ? "justify-center" : "px-2")}>
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 overflow-hidden">
            {session?.avatar_url ? (
              <img src={session.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <ICONS.User size={20} />
            )}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-900">
                {session?.name || 'User'}
              </span>
              <span className="text-xs text-slate-500">
                {session?.role_name || 'Member'}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  );
};

type NotificationItem = {
  notification_id: number;
  message: string;
  request_id?: number | null;
  read_status: boolean;
  created_at?: string | null;
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Navbar: React.FC = () => {
  const { session, clearSession, apiFetch } = useSession();
  const apiUrl = useMemo(
    () => import.meta.env.VITE_API_URL || 'http://localhost:9000',
    [],
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const loadNotifications = async (showLoader = true) => {
    setNotificationsError(null);
    if (showLoader) setNotificationsLoading(true);
    try {
      const response = await apiFetch(`${apiUrl}/notifications`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to load notifications.');
      }
      const data = await response.json();
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load notifications.';
      setNotificationsError(message);
    } finally {
      if (showLoader) setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.user_id) return;
    loadNotifications(false);
  }, [session?.user_id, apiFetch, apiUrl]);

  useEffect(() => {
    if (!notificationsOpen) return;
    let active = true;
    const load = async () => {
      if (!active) return;
      await loadNotifications(true);
    };
    load();
    return () => {
      active = false;
    };
  }, [notificationsOpen, apiFetch, apiUrl]);

  const markRead = async (notificationId: number) => {
    try {
      await apiFetch(`${apiUrl}/notifications/${notificationId}/read`, {
        method: 'POST',
      });
      setNotifications((prev) =>
        prev.map((item) =>
          item.notification_id === notificationId
            ? { ...item, read_status: true }
            : item,
        ),
      );
    } catch {
      // silently ignore
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch(`${apiUrl}/notifications/read-all`, { method: 'POST' });
      setNotifications((prev) => prev.map((item) => ({ ...item, read_status: true })));
      await loadNotifications(false);
    } catch {
      // silently ignore
    }
  };

  const openRequestFromNotification = (requestId: number) => {
    window.dispatchEvent(new CustomEvent('open-request', { detail: { requestId } }));
    setNotificationsOpen(false);
  };

  const unreadCount = notifications.filter((n) => !n.read_status).length;
  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 px-6 flex items-center justify-between">
      <div className="flex-1 max-w-md relative">
        <ICONS.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Search requests, workflows..." 
          className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-sky-blue-accent outline-none transition-all"
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 relative"
            onClick={() => setNotificationsOpen((prev) => !prev)}
          >
            <ICONS.Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Notifications</p>
                <button
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notificationsLoading && (
                  <div className="p-4 text-sm text-slate-500">Loading...</div>
                )}
                {notificationsError && (
                  <div className="p-4 text-sm text-red-600">{notificationsError}</div>
                )}
                {!notificationsLoading && !notificationsError && notifications.length === 0 && (
                  <div className="p-4 text-sm text-slate-500">No notifications yet.</div>
                )}
                {!notificationsLoading &&
                  !notificationsError &&
                  notifications.map((item) => (
                    <button
                      key={item.notification_id}
                      className={cn(
                        "w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50",
                        item.read_status ? "bg-white" : "bg-sky-50/40"
                      )}
                      onClick={() => {
                        markRead(item.notification_id);
                        if (item.request_id) {
                          openRequestFromNotification(item.request_id);
                        } else {
                          setNotificationsOpen(false);
                        }
                      }}
                    >
                      <p className="text-sm text-slate-700">{item.message}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatTimestamp(item.created_at)}
                      </p>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
        <div className="h-8 w-px bg-slate-200 mx-2"></div>
        <button className="flex items-center gap-2 hover:bg-slate-100 p-1.5 rounded-xl transition-colors">
          <div className="w-8 h-8 rounded-lg bg-sky-blue-accent flex items-center justify-center text-white text-xs font-bold overflow-hidden">
            {session?.avatar_url ? (
              <img src={session.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              (session?.name || 'U')
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
            )}
          </div>
          <ICONS.ChevronRight size={16} className="text-slate-400 rotate-90" />
        </button>
        <button
          className="text-sm font-medium text-slate-500 hover:text-slate-700"
          onClick={clearSession}
        >
          Sign out
        </button>
      </div>
    </header>
  );
};

export { Sidebar, Navbar };
