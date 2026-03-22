import client from './client';
import type { Job, JobListItem, PaginatedResponse } from '@/types/api';

export async function getJobs(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  schedule_type?: string;
  is_active?: boolean;
}): Promise<PaginatedResponse<JobListItem>> {
  const res = await client.get('/jobs', { params });
  return res.data;
}

export async function getJob(id: string): Promise<Job> {
  const res = await client.get(`/jobs/${id}`);
  return res.data;
}

export async function createJob(data: Partial<Job>): Promise<Job> {
  const res = await client.post('/jobs', data);
  return res.data;
}

export async function updateJob(id: string, data: Partial<Job>): Promise<Job> {
  const res = await client.put(`/jobs/${id}`, data);
  return res.data;
}

export async function deleteJob(id: string): Promise<void> {
  await client.delete(`/jobs/${id}`);
}

export async function triggerRun(jobId: string): Promise<{ run_id: string; status: string }> {
  const res = await client.post(`/jobs/${jobId}/run`);
  return res.data;
}

export async function cancelRun(jobId: string, runId: string): Promise<void> {
  await client.post(`/jobs/${jobId}/cancel`, null, { params: { run_id: runId } });
}

export async function toggleJob(jobId: string): Promise<Job> {
  const res = await client.put(`/jobs/${jobId}/toggle`);
  return res.data;
}

export async function uploadJobFile(file: File): Promise<{ name: string; code: string; code_filename: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await client.post('/jobs/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function cloneJob(jobId: string): Promise<Job> {
  const res = await client.post(`/jobs/${jobId}/clone`);
  return res.data;
}

export async function bulkAction(jobIds: string[], action: string): Promise<{
  success: number;
  failed: number;
  results: { job_id: string; status: string; message?: string }[];
}> {
  const res = await client.post('/jobs/bulk', { job_ids: jobIds, action });
  return res.data;
}

export async function getJobDependencies(jobId: string): Promise<{
  upstream: { id: string; name: string; last_status: string | null }[];
  downstream: { id: string; name: string; last_status: string | null }[];
}> {
  const res = await client.get(`/jobs/${jobId}/dependencies`);
  return res.data;
}
