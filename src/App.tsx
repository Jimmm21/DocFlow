import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar, Navbar } from './components/Layout';
import Dashboard from './pages/Dashboard';
import MyRequests from './pages/MyRequests';
import Approvals from './pages/Approvals';
import Workflows from './pages/Workflows';
import Reports from './pages/Reports';
import UserManagement from './pages/UserManagement';
import Settings from './pages/Settings';
import RequestDetails from './pages/RequestDetails';
import Login from './pages/Login';
import PublicReview from './pages/PublicReview';
import { useSession } from './context/SessionContext';

export default function App() {
  const { session } = useSession();
  const reviewToken = new URLSearchParams(window.location.search).get('review_token');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [detailsMode, setDetailsMode] = useState<'view' | 'edit'>('view');
  const [requestsMode, setRequestsMode] = useState<'list' | 'create'>('list');

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const requestId = Number(detail.requestId);
      if (!Number.isFinite(requestId)) return;
      setSelectedRequestId(requestId);
      setDetailsMode('view');
      setShowDetails(true);
    };
    window.addEventListener('open-request', handler as EventListener);
    return () => {
      window.removeEventListener('open-request', handler as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('request_id');
    if (!raw) return;
    const requestId = Number(raw);
    if (!Number.isFinite(requestId)) return;
    setSelectedRequestId(requestId);
    setDetailsMode('view');
    setShowDetails(true);
    params.delete('request_id');
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', next);
  }, [session]);

  const renderContent = () => {
    if (showDetails && selectedRequestId !== null) {
      return (
        <RequestDetails
          requestId={selectedRequestId}
          mode={detailsMode}
          onBack={() => setShowDetails(false)}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            onCreateRequest={() => {
              setActiveTab('my-requests');
              setRequestsMode('create');
              setShowDetails(false);
              setSelectedRequestId(null);
              setDetailsMode('view');
            }}
            onViewAllRequests={() => {
              setActiveTab('my-requests');
              setRequestsMode('list');
              setShowDetails(false);
              setSelectedRequestId(null);
              setDetailsMode('view');
            }}
          />
        );
      case 'my-requests':
        return (
          <MyRequests
            initialMode={requestsMode}
            onModeChange={setRequestsMode}
            onViewRequest={(requestId) => {
              setSelectedRequestId(requestId);
              setDetailsMode('view');
              setShowDetails(true);
            }}
            onEditRequest={(requestId) => {
              setSelectedRequestId(requestId);
              setDetailsMode('edit');
              setShowDetails(true);
            }}
          />
        );
      case 'approvals':
        return <Approvals />;
      case 'workflows':
        return <Workflows />;
      case 'reports':
        return <Reports />;
      case 'user-management':
        if (session?.role_name !== 'Admin') {
          return (
            <div className="card">
              <h2 className="text-xl font-bold text-slate-900">Access restricted</h2>
              <p className="text-slate-500 mt-2">
                User management is only available to Admin accounts.
              </p>
            </div>
          );
        }
        return <UserManagement />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  if (reviewToken) {
    return <PublicReview token={reviewToken} />;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-slate-50 transition-colors duration-300">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(id) => {
          setActiveTab(id);
          setShowDetails(false);
          setSelectedRequestId(null);
          setDetailsMode('view');
          setRequestsMode('list');
        }} 
        isCollapsed={isCollapsed} 
        setIsCollapsed={setIsCollapsed} 
      />
      
      <main 
        className="transition-all duration-300 min-h-screen flex flex-col"
        style={{ marginLeft: isCollapsed ? 80 : 260 }}
      >
        <Navbar />
        
        <div className="flex-1 p-8 max-w-7xl mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={showDetails ? 'details' : activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Toast Notification Simulation */}
      <div className="fixed bottom-8 right-8 z-[100] pointer-events-none">
        <AnimatePresence>
          {/* Example toast could be triggered here */}
        </AnimatePresence>
      </div>
    </div>
  );
}
