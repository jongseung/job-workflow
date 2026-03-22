import client from './client';
import type { JobLog, PaginatedResponse } from '@/types/api';

export async function getRunLogs(
  runId: string,
  params?: { page?: number; page_size?: number; stream?: string; level?: string; search?: string }
): Promise<PaginatedResponse<JobLog>> {
  const res = await client.get(`/logs/${runId}`, { params });
  return res.data;
}
