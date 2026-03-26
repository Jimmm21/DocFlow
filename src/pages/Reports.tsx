import React, { useEffect, useMemo, useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area
} from 'recharts';
import { ICONS } from '../constants';
import { useSession } from '../context/SessionContext';

type ReportSummary = {
  avg_approval_time_by_month: { name: string; time: number }[];
  bottlenecks: { name: string; delay: number }[];
  requests_by_type: { name: string; value: number }[];
  efficiency_score: number;
  efficiency_note: string;
  total_requests: number;
  closed_requests: number;
};

const Reports: React.FC = () => {
  const { apiFetch } = useSession();
  const apiUrl = useMemo(
    () => import.meta.env.VITE_API_URL || 'http://localhost:9000',
    [],
  );
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch(`${apiUrl}/reports/summary`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'Failed to load reports.');
        }
        const data = (await response.json()) as ReportSummary;
        if (active) setSummary(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load reports.';
        if (active) setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [apiFetch, apiUrl]);

  const exportData = () => {
    if (!summary) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reports-summary.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const timeData = summary?.avg_approval_time_by_month ?? [];
  const bottleneckData = summary?.bottlenecks ?? [];
  const typeData = summary?.requests_by_type ?? [];
  const efficiencyScore = summary?.efficiency_score ?? 0;
  const efficiencyNote = summary?.efficiency_note ?? 'No data yet.';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
          <p className="text-slate-500">Analyze system performance and identify bottlenecks.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-bold text-lg mb-6">Average Approval Time (Days)</h3>
          <div className="h-[300px] w-full min-h-[300px] min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minHeight={300}
              minWidth={0}
              initialDimension={{ width: 300, height: 300 }}
            >
              <AreaChart data={timeData}>
                <defs>
                  <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="time" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorTime)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold text-lg mb-6">Bottleneck Detection (Avg. Delay Hours)</h3>
          <div className="h-[300px] w-full min-h-[300px] min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minHeight={300}
              minWidth={0}
              initialDimension={{ width: 300, height: 300 }}
            >
              <BarChart data={bottleneckData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} width={120} />
                <Tooltip />
                <Bar dataKey="delay" radius={[0, 4, 4, 0]}>
                  {bottleneckData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.delay > 40 ? '#ef4444' : '#0ea5e9'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold text-lg mb-6">Requests by Type</h3>
          <div className="h-[300px] w-full min-h-[300px] min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minHeight={300}
              minWidth={0}
              initialDimension={{ width: 300, height: 300 }}
            >
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {typeData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={['#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'][index % 5]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card flex flex-col justify-center items-center text-center p-12">
          <div className="w-20 h-20 rounded-full bg-sky-blue flex items-center justify-center text-sky-blue-accent mb-6">
            <ICONS.BarChart3 size={40} />
          </div>
          <h3 className="text-xl font-bold mb-2">System Efficiency Score</h3>
          <p className="text-4xl font-black text-green-500 mb-4">
            {loading ? '--' : `${efficiencyScore}%`}
          </p>
          <p className="text-slate-500 max-w-xs">{efficiencyNote}</p>
        </div>
      </div>
    </div>
  );
};

export default Reports;
