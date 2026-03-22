import { useState, useEffect, useRef, useCallback } from 'react'
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
import { HtmlConfigEditor } from './config/HtmlConfigEditor'
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

/** Extract known output fields from a node's data (output_schema or executor type defaults) */
function extractOutputFields(
  data: WorkflowNodeData
): Array<{ path: string; type: string; example?: unknown }> {
  // 1. From explicit output_schema
  if (data.outputSchema?.properties) {
    const props = data.outputSchema.properties as Record<
      string,
      Record<string, unknown>
    >
    return Object.entries(props).map(([name, def]) => ({
      path: name,
      type: (def?.type as string) || 'any',
      example: def?.example as unknown,
    }))
  }

  // 2. Well-known defaults by executor type
  const et = data.executorType
  if (et === 'sql') {
    return [
      { path: 'rows', type: 'array', example: '[{col: val}, …]' },
      { path: 'count', type: 'integer', example: 42 },
      { path: 'columns', type: 'array', example: '["id","name"]' },
    ]
  }
  if (et === 'http') {
    return [{ path: 'result', type: 'object', example: '{…}' }]
  }
  if (et === 'python') {
    return [{ path: 'result', type: 'any', example: '__OUTPUT__ JSON' }]
  }
  if (et === 'html') {
    return [
      { path: 'html', type: 'string', example: '<html>...' },
      { path: 'title', type: 'string', example: 'Report Title' },
    ]
  }

  // 3. By module type
  if (data.moduleType === 'condition') {
    return [{ path: '_branch', type: 'string', example: 'true/false' }]
  }
  if (data.moduleType === 'trigger') {
    return [{ path: 'result', type: 'object', example: '초기 컨텍스트' }]
  }

  // fallback
  return [{ path: 'result', type: 'any' }]
}

const MIN_PANEL_W = 260
const MAX_PANEL_W = 560
const DEFAULT_PANEL_W = 288

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
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_W)
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)

  // ── Resize logic ──
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    startX.current = e.clientX
    startW.current = panelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [panelWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      // dragging left = wider panel (negative delta)
      const delta = startX.current - e.clientX
      setPanelWidth(Math.min(MAX_PANEL_W, Math.max(MIN_PANEL_W, startW.current + delta)))
    }
    const onUp = () => {
      if (!isResizing.current) return
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

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

  // Compute upstream nodes (BFS from current node) with output fields
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

        // Extract output fields from output_schema or executor type defaults
        const fields = extractOutputFields(pData)

        result.push({
          nodeId: parentId,
          nodeLabel: pData.label || parentId,
          moduleType: pData.moduleType || 'action',
          fields,
        })
      }
    }

    return result.reverse()
  })()

  if (!node || !nodeData) {
    return (
      <div
        className="flex-shrink-0 h-full flex flex-col border-l border-border bg-bg-card relative"
        style={{ width: panelWidth }}
      >
        {/* Resize handle */}
        <div
          className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize group z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors"
          onMouseDown={onResizeMouseDown}
        >
          <div className="absolute top-1/2 -translate-y-1/2 left-0 w-1 h-8 rounded-full bg-border group-hover:bg-primary/50 group-active:bg-primary transition-colors" />
        </div>
        {/* Top bar — aligned h-12 */}
        <div className="h-12 flex items-center px-4 border-b border-border flex-shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">설정</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center">
          <GitMerge className="w-10 h-10 text-text-muted mb-3 opacity-30" />
          <div className="text-[12px] text-text-muted">노드를 클릭하여 설정하세요</div>
        </div>
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
    <div
      className="flex-shrink-0 h-full flex flex-col border-l border-border bg-bg-card overflow-hidden relative"
      style={{ width: panelWidth }}
    >
      {/* Resize handle */}
      <div
        className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize group z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={onResizeMouseDown}
      >
        <div className="absolute top-1/2 -translate-y-1/2 left-0 w-1 h-8 rounded-full bg-border group-hover:bg-primary/50 group-active:bg-primary transition-colors" />
      </div>

      {/* Top bar — h-12 aligned with toolbar */}
      <div
        className="h-12 flex items-center justify-between px-4 border-b flex-shrink-0"
        style={{ borderColor: `${meta.color}30`, background: `${meta.color}06` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={16} style={{ color: meta.color, flexShrink: 0 }} />
          <div className="min-w-0">
            <div
              className="text-[9px] font-bold uppercase tracking-wider leading-none"
              style={{ color: meta.color }}
            >
              {meta.label}
            </div>
            <div className="text-[12px] font-semibold text-text-primary truncate leading-tight mt-0.5">
              {nodeData.label}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
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

            {/* HTML executor */}
            {executorType === 'html' && (
              <HtmlConfigEditor
                template={(cfg.template as string) ?? moduleInfo?.executor_code ?? ''}
                title={(cfg.title as string) ?? ''}
                onChange={handleConfigBatch}
                defaultTemplate={moduleInfo?.executor_code ?? undefined}
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
                  output_upsert_key: cfg.output_upsert_key as string,
                  output_format: cfg.output_format as 'jsonl' | 'csv',
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
            ) : (
              <>
                {/* Data flow guide */}
                <div className="mb-3 p-2.5 rounded-lg bg-primary/5 border border-primary/15">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1.5">
                    📥 이전 노드 출력 데이터
                  </div>
                  {upstreamOutputs.map((upstream) => {
                    const umeta = NODE_TYPE_META[upstream.moduleType] || NODE_TYPE_META.action
                    return (
                      <div key={upstream.nodeId} className="mb-1.5 last:mb-0">
                        <span className="text-[10px] font-semibold" style={{ color: umeta.color }}>
                          {upstream.nodeLabel}
                        </span>
                        <span className="text-[10px] text-text-muted ml-1">→</span>
                        <span className="text-[10px] font-mono text-text-secondary ml-1">
                          {upstream.fields.map(f => f.path).join(', ') || 'result'}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Mapped fields from input_schema */}
                {inputFields.length > 0 ? (
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
                  /* For modules without input_schema (python, etc.): show auto-mapped fields */
                  <>
                    <div className="text-[10px] text-text-muted mb-2">
                      이전 노드 출력이 <code className="font-mono text-primary">input_data</code> 딕셔너리로 자동 전달됩니다.
                    </div>
                    {/* Show current auto-mappings */}
                    {Object.entries(nodeData.inputMapping || {}).length > 0 ? (
                      Object.entries(nodeData.inputMapping || {}).map(([fieldName, mapping]) => (
                        <MappableInput
                          key={fieldName}
                          fieldName={fieldName}
                          label={fieldName}
                          value={mapping as InputMapping | string | undefined ?? null}
                          upstreamOutputs={upstreamOutputs}
                          onChange={(val) => handleMappingChange(fieldName, val)}
                        />
                      ))
                    ) : (
                      <div className="text-center py-3 text-[11px] text-text-muted opacity-60">
                        노드 연결 시 자동 매핑됩니다
                      </div>
                    )}
                    {/* Quick-add buttons for upstream fields not yet mapped */}
                    {upstreamOutputs.flatMap(u => u.fields.map(f => ({ ...f, nodeId: u.nodeId, nodeLabel: u.nodeLabel }))).filter(
                      f => !(nodeData.inputMapping || {})[f.path]
                    ).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                          + 매핑 추가
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {upstreamOutputs.flatMap(u =>
                            u.fields.map(f => ({ ...f, nodeId: u.nodeId, nodeLabel: u.nodeLabel }))
                          ).filter(
                            f => !(nodeData.inputMapping || {})[f.path]
                          ).map(f => (
                            <button
                              key={`${f.nodeId}-${f.path}`}
                              type="button"
                              onClick={() => handleMappingChange(f.path, {
                                type: 'node_output',
                                nodeId: f.nodeId,
                                path: f.path,
                              })}
                              className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-primary/5 hover:bg-primary/15 transition-colors"
                            >
                              + {f.path}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
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
