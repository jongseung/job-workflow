import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Briefcase, ScrollText, Settings, Zap, Shield, Database, GitMerge, Boxes } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/workflows', icon: GitMerge, label: 'Workflows' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/datasources', icon: Database, label: 'Datasources' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function NavItem({ to, icon: Icon, label, end }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3.5 px-4 py-3 rounded-xl text-[13px] font-semibold transition-all duration-200 relative',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover/50'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full shadow-[0_0_8px_rgba(0,212,255,0.4)]" />
          )}
          <Icon className={cn('w-[18px] h-[18px] transition-colors', isActive ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary')} />
          {label}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  return (
    <aside
      className={cn(
        'w-[260px] bg-sidebar/95 backdrop-blur-xl border-r border-border/50 flex flex-col h-screen fixed left-0 top-0 z-30',
        'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0'
      )}
    >
      {/* Logo */}
      <div className="h-[72px] flex items-center px-7 border-b border-border/30">
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center mr-3 shadow-[0_0_12px_rgba(0,212,255,0.1)]">
          <Zap className="w-4 h-4 text-primary" />
        </div>
        <span className="text-[17px] font-extrabold text-text-primary tracking-tight">JobScheduler</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">

        {navItems.map((item) => (
          <NavItem key={item.to} {...item} end={item.to === '/'} />
        ))}
        {user?.role === 'admin' && (
          <>
            <div className="pt-2 pb-1 px-4">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: '#2a2a35' }}>Admin</span>
            </div>
            <NavItem to="/admin/modules" icon={Boxes} label="Module Library" />
            <NavItem to="/audit" icon={Shield} label="Audit Log" />
          </>
        )}
      </nav>

      {/* User Info */}
      <div className="p-5 border-t border-border/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xs font-extrabold shadow-[0_0_8px_rgba(0,212,255,0.08)]">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{user?.username}</p>
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{user?.role}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
