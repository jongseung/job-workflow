import client from './client';
import type { JobRun, PaginatedResponse } from '@/types/api';

export async function getJobRuns(
  jobId: string,
  params?: { page?: number; page_size?: number; status?: string }
): Promise<PaginatedResponse<JobRun>> {
  const res = await client.get(`/jobs/${jobId}/runs`, { params });
  return res.data;
}

export type RunType = 'all' | 'job' | 'workflow';

/** Unified run item returned by /runs/recent */
export interface RecentRun {
  id: string;
  run_type: 'job' | 'workflow';
  status: string;
  trigger_type: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  triggered_by: string | null;
  created_at: string;
  // Job-specific
  job_id?: string;
  job_name?: string;
  // Workflow-specific
  workflow_id?: string;
  workflow_name?: string;
}

export async function getRecentRuns(limit = 10, runType: RunType = 'all'): Promise<RecentRun[]> {
  const res = await client.get('/runs/recent', { params: { limit, run_type: runType } });
  return res.data;
}

export async function getWorkflowRunLogs(
  runId: string,
): Promise<PaginatedResponse<import('@/types/api').JobLog>> {
  const res = await client.get(`/runs/workflow/${runId}/logs`);
  return res.data;
}
