import client from './client';
import type { DataSource, ConnectionTestResult, TableSchema, TablePreview, ValidateOutputResult } from '@/types/api';

export async function getDataSources(): Promise<DataSource[]> {
  const res = await client.get('/datasources');
  return res.data;
}

export async function getDataSource(id: string): Promise<DataSource> {
  const res = await client.get(`/datasources/${id}`);
  return res.data;
}

export async function createDataSource(data: Partial<DataSource> & { password?: string }): Promise<DataSource> {
  const res = await client.post('/datasources', data);
  return res.data;
}

export async function updateDataSource(id: string, data: Partial<DataSource> & { password?: string }): Promise<DataSource> {
  const res = await client.put(`/datasources/${id}`, data);
  return res.data;
}

export async function deleteDataSource(id: string): Promise<void> {
  await client.delete(`/datasources/${id}`);
}

export async function testConnection(data: {
  db_type: string;
  host?: string | null;
  port?: number | null;
  database: string;
  username?: string | null;
  password?: string | null;
  ssl_mode?: string | null;
}): Promise<ConnectionTestResult> {
  const res = await client.post('/datasources/test', data);
  return res.data;
}

export async function testSavedConnection(id: string): Promise<ConnectionTestResult> {
  const res = await client.post(`/datasources/${id}/test`);
  return res.data;
}

export async function getDataSourceTables(id: string): Promise<{ tables: string[] }> {
  const res = await client.get(`/datasources/${id}/tables`);
  return res.data;
}

export async function getTableSchema(id: string, table: string): Promise<TableSchema> {
  const res = await client.get(`/datasources/${id}/tables/${encodeURIComponent(table)}/schema`);
  return res.data;
}

export async function getTablePreview(id: string, table: string, limit = 10): Promise<TablePreview> {
  const res = await client.get(`/datasources/${id}/tables/${encodeURIComponent(table)}/preview`, {
    params: { limit },
  });
  return res.data;
}

export async function validateOutput(
  id: string,
  table: string,
  sampleRow: Record<string, unknown>,
): Promise<ValidateOutputResult> {
  const res = await client.post(
    `/datasources/${id}/tables/${encodeURIComponent(table)}/validate`,
    { sample_row: sampleRow },
  );
  return res.data;
}
