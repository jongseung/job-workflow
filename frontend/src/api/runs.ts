import client from './client';
import type { JobRun, PaginatedResponse } from '@/types/api';

export async function getJobRuns(
  jobId: string,
  params?: { page?: number; page_size?: number; status?: string }
): Promise<PaginatedResponse<JobRun>> {
  const res = await client.get(`/jobs/${jobId}/runs`, { params });
  return res.data;
}

export async function getRecentRuns(limit = 10): Promise<JobRun[]> {
  const res = await client.get('/runs/recent', { params: { limit } });
  return res.data;
}
