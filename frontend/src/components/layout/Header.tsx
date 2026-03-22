import { LogOut, Menu } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';

export function Header({ title }: { title: string }) {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-[72px] bg-header backdrop-blur-xl border-b border-border/30 flex items-center justify-between px-8 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-2.5 -ml-2 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-xl transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-extrabold text-text-primary tracking-tight">{title}</h1>
      </div>
      <Button variant="ghost" size="sm" onClick={handleLogout} icon={LogOut}>
        로그아웃
      </Button>
    </header>
  );
}
