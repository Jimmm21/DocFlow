import React, { useEffect, useMemo, useState } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { motion } from 'motion/react';
import { ICONS } from '../constants';
import { cn } from '../lib/utils';
import { useSession } from '../context/SessionContext';

type RequestSummary = {
  request_id: number;
  title: string;
  request_type: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  workflow_name?: string | null;
  current_step_name?: string | null;
  created_at?: string | null;
};

type PendingApproval = {
  request_id: number;
};

const Dashboard: React.FC<{
  onCreateRequest?: () => void;
  onViewAllRequests?: () => void;
}> = ({ onCreateRequest, onViewAllRequests }) => {
  const { apiFetch } = useSession();
  const apiUrl = useMemo(
    () => import.meta.env.VITE_API_URL || 'http://localhost:9000',
    [],
  );
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [requestsRes, approvalsRes] = await Promise.all([
          apiFetch(`${apiUrl}/requests`),
          apiFetch(`${apiUrl}/approvals/pending`),
        ]);

        if (!requestsRes.ok) {
          const body = await requestsRes.json().catch(() => ({}));
          throw new Error(body.detail || 'Failed to load requests.');
        }
        if (!approvalsRes.ok) {
          const body = await approvalsRes.json().catch(() => ({}));
          throw new Error(body.detail || 'Failed to load approvals.');
        }

        const requestsData = await requestsRes.json();
        const approvalsData = await approvalsRes.json();

        if (active) {
          setRequests(Array.isArray(requestsData) ? requestsData : []);
          setPendingApprovals(Array.isArray(approvalsData) ? approvalsData : []);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load dashboard.';
        if (active) {
          setError(message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [apiFetch, apiUrl]);

  const totalRequests = requests.length;
  const pendingRequests = requests.filter((r) => r.status === 'Pending').length;
  const approvedRequests = requests.filter((r) => r.status === 'Approved').length;
  const rejectedRequests = requests.filter((r) => r.status === 'Rejected').length;

  const stats = [
    {
      label: 'Total Requests',
      value: totalRequests.toString(),
      icon: 'MyRequests',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Pending Approvals',
      value: pendingApprovals.length.toString(),
      icon: 'Clock',
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
    },
    {
      label: 'Approved Requests',
      value: approvedRequests.toString(),
      icon: 'CheckCircle',
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Rejected Requests',
      value: rejectedRequests.toString(),
      icon: 'XCircle',
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
  ];

  const activityData = (() => {
    const days: { name: string; key: string; requests: number; approvals: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      days.push({
        name: date.toLocaleDateString('en-US', { weekday: 'short' }),
        key,
        requests: 0,
        approvals: 0,
      });
    }
    const map = new Map(days.map((d) => [d.key, d]));
    requests.forEach((req) => {
      if (!req.created_at) return;
      const key = new Date(req.created_at).toISOString().slice(0, 10);
      const entry = map.get(key);
      if (!entry) return;
      entry.requests += 1;
      if (req.status === 'Approved') {
        entry.approvals += 1;
      }
    });
    return Array.from(map.values());
  })();

  const statusData = [
    { name: 'Pending', value: pendingRequests },
    { name: 'Approved', value: approvedRequests },
    { name: 'Rejected', value: rejectedRequests },
  ];

  const recentRequests = [...requests]
    .sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    })
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
          <p className="text-slate-500">Welcome back, here's what's happening today.</p>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={onCreateRequest}
        >
          <ICONS.Plus size={18} />
          New Request
        </button>
      </div>

      {error && (
        <div className="card border border-red-100 bg-red-50 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => {
          const Icon = ICONS[stat.icon as keyof typeof ICONS];
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="card flex items-center gap-4"
            >
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", stat.bg)}>
                <Icon className={stat.color} size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">{stat.label}</p>
                <h3 className="text-2xl font-bold text-slate-900">
                  {loading ? '—' : stat.value}
                </h3>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg">Workflow Activity</h3>
            <select className="bg-slate-50 border-none text-sm rounded-lg px-2 py-1 outline-none">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="h-[300px] w-full min-h-[300px] min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minHeight={300}
              minWidth={0}
            >
              <LineChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="requests" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, fill: '#0ea5e9' }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="approvals" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dept Chart */}
        <div className="card">
          <h3 className="font-bold text-lg mb-6">Requests by Status</h3>
          <div className="h-[300px] w-full min-h-[300px] min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minHeight={300}
              minWidth={0}
            >
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'][index % 5]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {statusData.map((dept, idx) => (
              <div key={dept.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'][idx % 5] }}></div>
                  <span className="text-slate-600">{dept.name}</span>
                </div>
                <span className="font-semibold">{dept.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Requests Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-lg">Recent Requests</h3>
          <button
            className="text-sky-blue-accent text-sm font-medium hover:underline"
            onClick={onViewAllRequests}
          >
            View All
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-4 font-semibold text-slate-500 text-sm">Request ID</th>
                <th className="pb-4 font-semibold text-slate-500 text-sm">Title</th>
                <th className="pb-4 font-semibold text-slate-500 text-sm">Type</th>
                <th className="pb-4 font-semibold text-slate-500 text-sm">Status</th>
                <th className="pb-4 font-semibold text-slate-500 text-sm">Current Step</th>
                <th className="pb-4 font-semibold text-slate-500 text-sm">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [...Array(3)].map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={6} className="py-3">
                      <div className="h-8 rounded-lg bg-slate-100 animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : recentRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No requests yet.
                  </td>
                </tr>
              ) : (
                recentRequests.map((req) => (
                  <tr key={req.request_id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 text-sm font-medium text-sky-blue-accent">
                      {`REQ-${String(req.request_id).padStart(3, '0')}`}
                    </td>
                    <td className="py-4 text-sm font-semibold">{req.title}</td>
                    <td className="py-4 text-sm text-slate-500">
                      {req.workflow_name || req.request_type}
                    </td>
                    <td className="py-4">
                      <span className={cn(
                        "status-badge",
                        req.status === 'Approved' ? "status-approved" : req.status === 'Pending' ? "status-pending" : "status-rejected"
                      )}>
                        {req.status}
                      </span>
                    </td>
                    <td className="py-4 text-sm text-slate-500">{req.current_step_name || '-'}</td>
                    <td className="py-4 text-sm text-slate-500">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
