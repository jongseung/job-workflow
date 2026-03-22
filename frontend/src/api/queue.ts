import client from './client';
import type { QueueStatus } from '@/types/api';

export async function getQueueStatus(): Promise<QueueStatus> {
  const res = await client.get('/queue/status');
  return res.data;
}

export async function getVenvStats(): Promise<{ count: number; total_size_bytes: number }> {
  const res = await client.get('/queue/venv-stats');
  return res.data;
}
