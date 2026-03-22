import client from './client';
import type { AnalysisResult } from '@/types/api';

export async function analyzeCode(code: string): Promise<AnalysisResult> {
  const res = await client.post('/analysis/analyze', { code });
  return res.data;
}
