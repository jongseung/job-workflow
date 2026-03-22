import apiClient from './client'

export interface StepModule {
  id: string
  name: string
  description: string | null
  module_type: 'action' | 'data' | 'transform' | 'condition' | 'trigger' | 'merge'
  category: string
  icon: string | null
  color: string | null
  input_schema: Record<string, unknown> | null
  output_schema: Record<string, unknown> | null
  config_schema: Record<string, unknown> | null
  executor_type: 'python' | 'http' | 'sql' | 'builtin'
  executor_code: string | null
  executor_config: Record<string, unknown> | null
  is_active: boolean
  is_builtin: boolean
  version: number
  created_by: string | null
  created_at: string
  updated_at: string | null
}

export interface ModuleCreate {
  name: string
  description?: string
  module_type: string
  category?: string
  icon?: string
  color?: string
  version?: string
  input_schema?: Record<string, unknown>
  output_schema?: Record<string, unknown>
  config_schema?: Record<string, unknown>
  executor_type?: string
  executor_code?: string
  executor_config?: Record<string, unknown>
  is_active?: boolean
}

export const modulesApi = {
  list: (activeOnly = true) =>
    apiClient.get<StepModule[]>('/modules', { params: { active_only: activeOnly } }),

  get: (id: string) =>
    apiClient.get<StepModule>(`/modules/${id}`),

  create: (data: ModuleCreate) =>
    apiClient.post<StepModule>('/modules', data),

  update: (id: string, data: Partial<ModuleCreate> & { is_active?: boolean }) =>
    apiClient.put<StepModule>(`/modules/${id}`, data),

  delete: (id: string) =>
    apiClient.delete(`/modules/${id}`),

  test: (id: string, inputData: Record<string, unknown>) =>
    apiClient.post<{ success: boolean; output?: unknown; error?: string }>(
      `/modules/${id}/test`,
      { input_data: inputData }
    ),
}
