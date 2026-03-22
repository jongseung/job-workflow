import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Node } from '@xyflow/react'
import { Trash2, X, GitMerge, ArrowLeft } from 'lucide-react'
import type { WorkflowNodeData } from './nodes/WorkflowNode'
import { NODE_TYPE_META } from './nodes/WorkflowNode'
import { MappableInput, type UpstreamOutput } from './MappableInput'
import { modulesApi } from '../../../api/modules'
import type { InputMapping } from '../../../api/workflows'

// Config editors
import { SqlConfigEditor } from './config/SqlConfigEditor'
import { HttpConfigEditor } from './config/HttpConfigEditor'
import { PythonConfigEditor } from './config/PythonConfigEditor'
import { OutputConfigSection } from './config/OutputConfigSection'
import { NodeTestPanel } from './config/NodeTestPanel'

interface NodeConfigPanelProps {
  node: Node | null
  allNodes: Node[]
  allEdges: { source: string; target: string }[]
  onUpdateNode: (nodeId: string, data: Partial<WorkflowNodeData>) => void
  onDeleteNode: (nodeId: string) => void
  onClose: () => void
  workflowId: string
}

export function NodeConfigPanel({
  node,
  allNodes,
  allEdges,
  onUpdateNode,
  onDeleteNode,
  onClose,
  workflowId,
}: NodeConfigPanelProps) {
  const [localLabel, setLocalLabel] = useState('')
  const [activeTab, setActiveTab] = useState<'config' | 'mapping' | 'info'>('config')

  const nodeData = node?.data as WorkflowNodeData | undefined

  useEffect(() => {
    if (nodeData) {
      setLocalLabel(nodeData.label || '')
    }
  }, [node?.id])

  const { data: moduleInfo } = useQuery({
    queryKey: ['module', nodeData?.moduleId],
    queryFn: () => modulesApi.get(nodeData!.moduleId!).then((r) => r.data),
    enabled: !!nodeData?.moduleId,
  })

  // Compute upstream nodes (BFS from current node)
  const upstreamOutputs: UpstreamOutput[] = (() => {
    if (!node) return []
    const visited = new Set<string>()
    const result: UpstreamOutput[] = []
    const queue = [node.id]

    while (queue.length > 0) {
      const current = queue.shift()!
      const parents = allEdges
        .filter((e) => e.target === current)
        .map((e) => e.source)

      for (const parentId of parents) {
        if (visited.has(parentId)) continue
        visited.add(parentId)
        queue.push(parentId)

        const parentNode = allNodes.find((n) => n.id === parentId)
        if (!parentNode) continue
        const pData = parentNode.data as WorkflowNodeData

        result.push({
          nodeId: parentId,
          nodeLabel: pData.label || parentId,
          moduleType: pData.moduleType || 'action',
          fields: [],
        })
      }
    }

    return result.reverse()
  })()

  if (!node || !nodeData) {
    return (
      <div className="w-72 flex-shrink-0 h-full flex flex-col items-center justify-center border-l border-border bg-bg-card">
        <GitMerge className="w-10 h-10 text-text-muted mb-3 opacity-30" />
        <div className="text-[12px] text-text-muted">노드를 클릭하여 설정하세요</div>
      </div>
    )
  }

  const meta = NODE_TYPE_META[nodeData.moduleType] || NODE_TYPE_META.action
  const { Icon } = meta

  // Helper: update a single config key
  const handleConfigChange = (key: string, value: unknown) => {
    onUpdateNode(node.id, {
      config: { ...(nodeData.config || {}), [key]: value },
    })
  }

  // Helper: update multiple config keys at once
  const handleConfigBatch = (updates: Record<string, unknown>) => {
    onUpdateNode(node.id, {
      config: { ...(nodeData.config || {}), ...updates },
    })
  }

  const handleMappingChange = (fieldName: string, value: InputMapping | string | null) => {
    const newMapping = { ...(nodeData.inputMapping || {}) }
    if (value === null) {
      delete newMapping[fieldName]
    } else if (typeof value === 'string') {
      newMapping[fieldName] = { type: 'static', value }
    } else {
      newMapping[fieldName] = value
    }
    onUpdateNode(node.id, { inputMapping: newMapping })
  }

  const inputFields = moduleInfo?.input_schema
    ? parseSchemaFields(moduleInfo.input_schema)
    : []

  const executorType = moduleInfo?.executor_type ?? 'builtin'
  const moduleType = nodeData.moduleType
  const cfg = nodeData.config || {}

  const TABS = [
    { key: 'config' as const,  label: '설정' },
    { key: 'mapping' as const, label: '매핑' },
    { key: 'info' as const,    label: '정보' },
  ]

  // Determine if this node needs DB output section
  const showOutputSection =
    moduleType !== 'condition' &&
    moduleType !== 'trigger' &&
    moduleType !== 'merge'

  // Determine if this node needs the test panel
  const showTestPanel = workflowId && workflowId !== 'new' && moduleType !== 'trigger'

  return (
    <div className="w-72 flex-shrink-0 h-full flex flex-col border-l border-border bg-bg-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: `${meta.color}30`, background: `${meta.color}06` }}
      >
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color: meta.color, flexShrink: 0 }} />
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: meta.color }}
            >
              {meta.label}
            </div>
            <div className="text-[13px] font-semibold text-text-primary">
              {nodeData.label}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDeleteNode(node.id)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all"
            title="노드 삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Node name editor */}
      <div className="px-4 py-3 border-b border-border">
        <label className="block text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
          노드 이름
        </label>
        <input
          type="text"
          value={localLabel}
          onChange={(e) => setLocalLabel(e.target.value)}
          onBlur={() => onUpdateNode(node.id, { label: localLabel })}
          className="w-full bg-bg-tertiary rounded-lg px-3 py-1.5 text-[13px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`
              flex-1 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors border-b-2
              ${activeTab === key
                ? 'text-text-primary'
                : 'text-text-muted hover:text-text-secondary border-transparent'}
            `}
            style={{ borderColor: activeTab === key ? meta.color : undefined }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* ── CONFIG TAB ── */}
        {activeTab === 'config' && (
          <div className="space-y-4">

            {/* Condition node */}
            {moduleType === 'condition' && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                  조건식
                </label>
                <textarea
                  value={(cfg.condition as string) || ''}
                  onChange={(e) => handleConfigChange('condition', e.target.value)}
                  placeholder="예: value > 10 or status == 'active'"
                  rows={3}
                  className="w-full bg-bg-tertiary rounded-lg px-3 py-2 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors resize-none font-mono"
                />
                <p className="mt-1.5 text-[10px] text-text-muted">
                  Python 표현식. 이전 노드 데이터 필드를 변수로 사용 가능.
                </p>
              </div>
            )}

            {/* Trigger: initial data */}
            {moduleType === 'trigger' && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                  초기 데이터 (선택)
                </label>
                <textarea
                  value={(cfg.initial_data as string) || ''}
                  onChange={(e) => handleConfigChange('initial_data', e.target.value)}
                  placeholder='{"key": "value"}'
                  rows={4}
                  className="w-full bg-bg-tertiary rounded-lg px-3 py-2 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors resize-none font-mono"
                />
                <p className="mt-1.5 text-[10px] text-text-muted">
                  워크플로우 실행 시 초기 컨텍스트로 전달됩니다
                </p>
              </div>
            )}

            {/* SQL executor */}
            {executorType === 'sql' && (
              <SqlConfigEditor
                config={{
                  datasource_id: (cfg.datasource_id as string) ?? null,
                  query: (cfg.query as string) ?? moduleInfo?.executor_code ?? undefined,
                }}
                onChange={handleConfigBatch}
                defaultQuery={moduleInfo?.executor_code ?? undefined}
              />
            )}

            {/* HTTP executor */}
            {executorType === 'http' && (
              <HttpConfigEditor
                config={{
                  url: (cfg.url as string) ?? (moduleInfo?.executor_config as Record<string, unknown>)?.url as string ?? '',
                  method: (cfg.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH') ?? ((moduleInfo?.executor_config as Record<string, unknown>)?.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH') ?? 'POST',
                  headers: (cfg.headers as Record<string, string>) ?? ((moduleInfo?.executor_config as Record<string, unknown>)?.headers as Record<string, string>) ?? {},
                  body_template: (cfg.body_template as string) ?? '',
                }}
                onChange={handleConfigBatch}
              />
            )}

            {/* Python executor */}
            {executorType === 'python' && (
              <PythonConfigEditor
                code={(cfg.code as string) ?? moduleInfo?.executor_code ?? ''}
                onChange={(code) => handleConfigChange('code', code)}
                defaultCode={moduleInfo?.executor_code ?? undefined}
              />
            )}

            {/* Transform node (python variant) */}
            {moduleType === 'transform' && executorType !== 'python' && (
              <PythonConfigEditor
                code={(cfg.code as string) ?? moduleInfo?.executor_code ?? ''}
                onChange={(code) => handleConfigChange('code', code)}
                defaultCode={moduleInfo?.executor_code ?? undefined}
              />
            )}

            {/* Builtin with input_schema fields (non-condition/trigger) */}
            {executorType === 'builtin' &&
              moduleType !== 'condition' &&
              moduleType !== 'trigger' &&
              moduleType !== 'merge' &&
              inputFields.length > 0 && (
              <div className="space-y-3">
                {inputFields.map((field) => (
                  <div key={field.name}>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                      {field.label}
                      {field.required && <span className="text-danger ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      value={(cfg[field.name] as string) || ''}
                      onChange={(e) => handleConfigChange(field.name, e.target.value)}
                      placeholder={field.description}
                      className="w-full bg-bg-tertiary rounded-lg px-3 py-1.5 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Merge: no config needed */}
            {moduleType === 'merge' && (
              <div className="text-center py-4 text-[12px] text-text-muted">
                병렬 노드의 결과를 자동으로 합칩니다
              </div>
            )}

            {/* DB output section */}
            {showOutputSection && (
              <OutputConfigSection
                config={{
                  save_output: cfg.save_output as boolean,
                  output_datasource_id: cfg.output_datasource_id as string,
                  output_table: cfg.output_table as string,
                  output_write_mode: cfg.output_write_mode as 'append' | 'replace' | 'upsert',
                }}
                onChange={handleConfigBatch}
              />
            )}

            {/* Node test panel */}
            {showTestPanel && (
              <NodeTestPanel
                workflowId={workflowId}
                nodeId={node.id}
                nodeData={nodeData}
              />
            )}
          </div>
        )}

        {/* ── MAPPING TAB ── */}
        {activeTab === 'mapping' && (
          <div>
            {upstreamOutputs.length === 0 ? (
              <div className="text-center py-6 text-[12px] text-text-muted">
                <ArrowLeft className="w-6 h-6 mx-auto mb-2 opacity-40" />
                이 노드에 연결된 이전 노드가 없습니다.
              </div>
            ) : inputFields.length > 0 ? (
              inputFields.map((field) => (
                <MappableInput
                  key={field.name}
                  fieldName={field.name}
                  label={field.label}
                  value={
                    (nodeData.inputMapping?.[field.name] as InputMapping | string | undefined) ?? null
                  }
                  upstreamOutputs={upstreamOutputs}
                  onChange={(val) => handleMappingChange(field.name, val)}
                  placeholder={field.description}
                />
              ))
            ) : (
              <div className="text-center py-6 text-[12px] text-text-muted">
                input_schema가 정의된 모듈을 선택하면 매핑 옵션이 표시됩니다.
              </div>
            )}
          </div>
        )}

        {/* ── INFO TAB ── */}
        {activeTab === 'info' && moduleInfo && (
          <div className="space-y-4">
            <InfoRow label="Node ID" value={node.id} mono />
            <InfoRow label="Module" value={moduleInfo.name} />
            <InfoRow label="Executor" value={moduleInfo.executor_type} mono />
            <InfoRow label="Version" value={`v${moduleInfo.version}`} />
            {moduleInfo.description && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">
                  설명
                </div>
                <p className="text-[12px] leading-relaxed text-text-muted">
                  {moduleInfo.description}
                </p>
              </div>
            )}
            {moduleInfo.output_schema && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">
                  출력 스키마
                </div>
                <pre className="text-[10px] p-2 rounded bg-bg-tertiary border border-border overflow-x-auto font-mono text-text-muted">
                  {JSON.stringify(moduleInfo.output_schema, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'info' && !moduleInfo && (
          <div className="text-center py-6 text-[12px] text-text-muted">
            모듈 정보가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-text-muted mb-0.5">
        {label}
      </div>
      <div className={`text-[12px] text-text-secondary ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  )
}

function parseSchemaFields(schema: Record<string, unknown>) {
  const props = (schema.properties || {}) as Record<string, Record<string, unknown>>
  const required = (schema.required || []) as string[]
  return Object.entries(props).map(([name, def]) => ({
    name,
    label: (def.title as string) || name,
    type: (def.type as string) || 'string',
    description: (def.description as string) || '',
    required: required.includes(name),
  }))
}
