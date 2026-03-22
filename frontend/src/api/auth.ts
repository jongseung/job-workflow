import client from './client';
import type { TokenResponse, User } from '@/types/api';

export async function login(username: string, password: string): Promise<TokenResponse> {
  const res = await client.post('/auth/login', { username, password });
  return res.data;
}

export async function getMe(token?: string): Promise<User> {
  const res = await client.get('/auth/me', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  return res.data;
}
