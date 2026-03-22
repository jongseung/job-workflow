import { QueryClient, MutationCache } from '@tanstack/react-query';
import { useUIStore } from '@/stores/uiStore';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  mutationCache: new MutationCache({
    onError: (error: any) => {
      const message =
        error?.response?.data?.detail ||
        error?.message ||
        'An unexpected error occurred';
      useUIStore.getState().addNotification({
        type: 'error',
        message: String(message),
      });
    },
  }),
});
