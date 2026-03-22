import client from './client';
import type { AuditEntry, PaginatedResponse } from '@/types/api';

export async function getAuditLogs(params?: {
  page?: number;
  page_size?: number;
  action?: string;
  resource_type?: string;
  user_id?: string;
}): Promise<PaginatedResponse<AuditEntry>> {
  const res = await client.get('/audit', { params });
  return res.data;
}
