import { 
  LayoutDashboard, 
  FileText, 
  CheckCircle2, 
  GitBranch, 
  BarChart3, 
  Users, 
  Settings,
  Search,
  Bell,
  User,
  Menu,
  X,
  Plus,
  Filter,
  MoreVertical,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  Download,
  Trash2,
  Edit2,
  Eye,
  Sun,
  Moon
} from 'lucide-react';

export const ICONS = {
  Dashboard: LayoutDashboard,
  MyRequests: FileText,
  Approvals: CheckCircle2,
  Workflows: GitBranch,
  Reports: BarChart3,
  UserManagement: Users,
  Settings: Settings,
  Search,
  Bell,
  User,
  Menu,
  X,
  Plus,
  Filter,
  MoreVertical,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  Download,
  Trash2,
  Edit2,
  Eye,
  Sun,
  Moon,
  FileText,
  BarChart3
};

export type NavItem = {
  id: string;
  label: string;
  icon: keyof typeof ICONS;
};

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'Dashboard' },
  { id: 'my-requests', label: 'My Requests', icon: 'MyRequests' },
  { id: 'approvals', label: 'Approvals', icon: 'Approvals' },
  { id: 'workflows', label: 'Workflows', icon: 'Workflows' },
  { id: 'reports', label: 'Reports', icon: 'Reports' },
  { id: 'user-management', label: 'User Management', icon: 'UserManagement' },
  { id: 'settings', label: 'Settings', icon: 'Settings' },
];

export type RequestStatus = 'Pending' | 'Approved' | 'Rejected';

export type Request = {
  id: string;
  title: string;
  type: string;
  status: RequestStatus;
  currentStep: string;
  dateSubmitted: string;
  submittedBy: string;
  description?: string;
};

export const MOCK_REQUESTS: Request[] = [
  { id: 'REQ-001', title: 'Cloud Infrastructure Upgrade', type: 'Infrastructure', status: 'Pending', currentStep: 'Manager Approval', dateSubmitted: '2024-03-15', submittedBy: 'John Doe' },
  { id: 'REQ-002', title: 'New Developer Laptop', type: 'Hardware', status: 'Approved', currentStep: 'Completed', dateSubmitted: '2024-03-14', submittedBy: 'Jane Smith' },
  { id: 'REQ-003', title: 'Security Audit Access', type: 'Access Control', status: 'Rejected', currentStep: 'Security Review', dateSubmitted: '2024-03-12', submittedBy: 'Mike Ross' },
  { id: 'REQ-004', title: 'Database Migration Plan', type: 'Database', status: 'Pending', currentStep: 'CTO Review', dateSubmitted: '2024-03-16', submittedBy: 'Sarah Connor' },
  { id: 'REQ-005', title: 'Software License Renewal', type: 'Software', status: 'Approved', currentStep: 'Completed', dateSubmitted: '2024-03-10', submittedBy: 'David Miller' },
];

export const MOCK_USERS = [
  { id: '1', name: 'John Doe', email: 'john@itcompany.com', role: 'Developer', status: 'Active' },
  { id: '2', name: 'Sarah Connor', email: 'sarah@itcompany.com', role: 'Manager', status: 'Active' },
  { id: '3', name: 'Mike Ross', email: 'mike@itcompany.com', role: 'Admin', status: 'Active' },
  { id: '4', name: 'Jane Smith', email: 'jane@itcompany.com', role: 'QA', status: 'Inactive' },
];

export const CURRENT_USER_ID = 1;

export const WORKFLOW_ACTIVITY_DATA = [
  { name: 'Mon', requests: 12, approvals: 8 },
  { name: 'Tue', requests: 19, approvals: 15 },
  { name: 'Wed', requests: 15, approvals: 12 },
  { name: 'Thu', requests: 22, approvals: 18 },
  { name: 'Fri', requests: 30, approvals: 25 },
  { name: 'Sat', requests: 10, approvals: 5 },
  { name: 'Sun', requests: 8, approvals: 4 },
];

export const DEPT_REQUESTS_DATA = [
  { name: 'Engineering', value: 45 },
  { name: 'Product', value: 25 },
  { name: 'Sales', value: 15 },
  { name: 'HR', value: 10 },
  { name: 'Finance', value: 5 },
];
