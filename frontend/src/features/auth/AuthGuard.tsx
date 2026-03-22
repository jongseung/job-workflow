import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { getMe } from '@/api/auth';
import { PageLoading } from '@/components/shared/LoadingSpinner';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, setUser, logout } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated && !user) {
      getMe()
        .then(setUser)
        .catch(() => logout());
    }
  }, [isAuthenticated, user, setUser, logout]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user) {
    return <PageLoading />;
  }

  return <>{children}</>;
}
