import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useUIStore } from '@/stores/uiStore';

export function AppShell() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  return (
    <div className="flex min-h-screen noise">
      <Sidebar />

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => useUIStore.getState().toggleSidebar()}
        />
      )}

      <main className="flex-1 transition-[margin] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ml-0 lg:ml-[260px]">
        <Outlet />
      </main>
    </div>
  );
}
