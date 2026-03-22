import apiClient from './client'

export interface WorkflowOut {
  id: string
  name: string
  description: string | null
  canvas_data: { nodes: CanvasNode[]; edges: CanvasEdge[] } | null
  status: 'draft' | 'active' | 'archived'
  is_active: boolean
  schedule_type: 'manual' | 'cron' | 'interval'
  cron_expression: string | null
  interval_seconds: number | null
  timeout_seconds: number
  webhook_token: string | null
  tags: string[] | null
  created_by: string | null
  created_at: string
  updated_at: string | null
  node_count: number
  last_run_status: string | null
  last_run_at: string | null
}

export interface CanvasNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    moduleType: string
    moduleId: string | null
    config: Record<string, unknown>
    inputMapping: Record<string, InputMapping>
  }
}

export type InputMappingType = 'node_output' | 'static' | 'initial'

export interface InputMapping {
  type: InputMappingType
  nodeId?: string
  path?: string
  value?: unknown
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  data?: { branch?: 'true' | 'false' | null }
}

export interface WorkflowRunOut {
  id: string
  workflow_id: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  trigger_type: string
  context_data: Record<string, unknown> | null
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  error_message: string | null
  triggered_by: string | null
  created_at: string
  node_runs: WorkflowNodeRunOut[]
}

export interface WorkflowNodeRunOut {
  id: string
  workflow_run_id: string
  node_id: string
  module_id: string | null
  node_type: string
  node_label: string | null
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  input_data: Record<string, unknown> | null
  output_data: Record<string, unknown> | null
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  execution_order: number
  created_at: string
}

export const workflowsApi = {
  list: () => apiClient.get<WorkflowOut[]>('/workflows'),

  get: (id: string) => apiClient.get<WorkflowOut>(`/workflows/${id}`),

  create: (data: { name: string; description?: string }) =>
    apiClient.post<WorkflowOut>('/workflows', data),

  update: (id: string, data: Partial<WorkflowOut> & { canvas_data?: unknown }) =>
    apiClient.put<WorkflowOut>(`/workflows/${id}`, data),

  delete: (id: string) => apiClient.delete(`/workflows/${id}`),

  run: (id: string, contextData?: Record<string, unknown>) =>
    apiClient.post<WorkflowRunOut>(`/workflows/${id}/run`, {
      context_data: contextData || {},
    }),

  listRuns: (id: string, limit = 20) =>
    apiClient.get<WorkflowRunOut[]>(`/workflows/${id}/runs`, { params: { limit } }),

  getRun: (runId: string) =>
    apiClient.get<WorkflowRunOut>(`/workflows/runs/${runId}`),
}
