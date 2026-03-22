import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/features/auth/AuthGuard';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { JobListPage } from '@/features/jobs/JobListPage';
import { JobCreatePage } from '@/features/jobs/JobCreatePage';
import { JobDetailPage } from '@/features/jobs/JobDetailPage';
import { JobEditPage } from '@/features/jobs/JobEditPage';
import { LogViewerPage } from '@/features/logs/LogViewerPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { DataSourceListPage, DataSourceDetailPage, DataSourceFormPage } from '@/features/datasources';
import { useUIStore } from '@/stores/uiStore';
import { X, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

const TOAST_CONFIG = {
  success: {
    icon: CheckCircle2,
    barColor: 'bg-success',
    iconColor: 'text-success',
    bg: 'bg-success/5 border-success/20',
  },
  error: {
    icon: XCircle,
    barColor: 'bg-danger',
    iconColor: 'text-danger',
    bg: 'bg-danger/5 border-danger/20',
  },
  warning: {
    icon: AlertTriangle,
    barColor: 'bg-warning',
    iconColor: 'text-warning',
    bg: 'bg-warning/5 border-warning/20',
  },
  info: {
    icon: Info,
    barColor: 'bg-info',
    iconColor: 'text-info',
    bg: 'bg-info/5 border-info/20',
  },
};

function Notifications() {
  const notifications = useUIStore((s) => s.notifications);
  const remove = useUIStore((s) => s.removeNotification);

  if (notifications.length === 0) return null;
  return (
    <div className="fixed top-5 right-5 z-50 space-y-3 max-w-sm w-full">
      {notifications.map((n) => {
        const config = TOAST_CONFIG[n.type] || TOAST_CONFIG.info;
        const Icon = config.icon;
        return (
          <div
            key={n.id}
            className={`flex items-start gap-3.5 pr-4 pt-4 pb-4 rounded-2xl border ${config.bg} backdrop-blur-xl shadow-2xl shadow-black/40 animate-slide-in-right cursor-pointer overflow-hidden relative`}
            onClick={() => remove(n.id)}
          >
            {/* Left accent bar */}
            <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${config.barColor} rounded-l-2xl`} />
            <div className="pl-5">
              <Icon className={`w-5 h-5 ${config.iconColor} shrink-0 mt-0.5`} />
            </div>
            <p className="text-sm text-text-primary flex-1 font-medium leading-relaxed">{n.message}</p>
            <X className="w-4 h-4 text-text-muted hover:text-text-primary shrink-0 mt-0.5 transition-colors" />
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Notifications />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AuthGuard><AppShell /></AuthGuard>}>
            <Route index element={<DashboardPage />} />
            <Route path="jobs" element={<JobListPage />} />
            <Route path="jobs/new" element={<JobCreatePage />} />
            <Route path="jobs/:id" element={<JobDetailPage />} />
            <Route path="jobs/:id/edit" element={<JobEditPage />} />
            <Route path="logs" element={<LogViewerPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="datasources" element={<DataSourceListPage />} />
            <Route path="datasources/new" element={<DataSourceFormPage mode="create" />} />
            <Route path="datasources/:id" element={<DataSourceDetailPage />} />
            <Route path="datasources/:id/edit" element={<DataSourceFormPage mode="edit" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
