import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const { refreshToken, logout, login } = useAuthStore.getState();
      if (refreshToken && !error.config._retry) {
        error.config._retry = true;
        try {
          const res = await axios.post('/api/auth/refresh', {
            refresh_token: refreshToken,
          });
          const { access_token, refresh_token } = res.data;
          login(access_token, refresh_token, useAuthStore.getState().user!);
          error.config.headers.Authorization = `Bearer ${access_token}`;
          return client(error.config);
        } catch {
          logout();
        }
      } else {
        logout();
      }
    }
    return Promise.reject(error);
  }
);

export default client;
