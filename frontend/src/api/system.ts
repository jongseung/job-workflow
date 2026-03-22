import client from './client';
import type { SystemStats, RunHistoryPoint } from '@/types/api';

export async function getStats(): Promise<SystemStats> {
  const res = await client.get('/system/stats');
  return res.data;
}

export async function getSchedulerStatus() {
  const res = await client.get('/scheduler/status');
  return res.data;
}

export async function getRunHistory(days: number = 14): Promise<RunHistoryPoint[]> {
  const res = await client.get('/system/run-history', { params: { days } });
  return res.data;
}

