import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock, Save, Play, GitMerge, RefreshCw, Loader2, AlertTriangle } from 'lucide-react'
import { WorkflowScheduleModal } from './components/WorkflowScheduleModal'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  ReactFlowProvider,
  useReactFlow,
  BackgroundVariant,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { workflowsApi, type CanvasNode, type CanvasEdge } from '../../api/workflows'
import { type StepModule } from '../../api/modules'
import { WorkflowNode, nodeTypes } from './components/nodes/WorkflowNode'
import { ModuleSidebar } from './components/ModuleSidebar'
import { NodeConfigPanel } from './components/NodeConfigPanel'
import type { WorkflowNodeData } from './components/nodes/WorkflowNode'
import { useUIStore } from '../../stores/uiStore'

// ---------- helpers ----------

function makeNodeId() {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function moduleToNodeData(mod: StepModule): WorkflowNodeData {
  return {
    label: mod.name,
    moduleType: mod.module_type,
    moduleId: mod.id,
    config: {},
    inputMapping: {},
    icon: mod.icon || undefined,
    color: mod.color || undefined,
    category: mod.category || undefined,
  }
}

function toCanvasNodes(nodes: Node[]): CanvasNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type || 'workflowNode',
    position: n.position,
    data: n.data as CanvasNode['data'],
  }))
}

function toCanvasEdges(edges: Edge[]): CanvasEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    data: (e.data as CanvasEdge['data']) || {},
  }))
}

function formatScheduleLabel(
  scheduleType: string,
  cronExpr: string | null,
  intervalSecs: number | null
): string {
  if (scheduleType === 'cron' && cronExpr) return cronExpr
  if (scheduleType === 'interval' && intervalSecs) {
    if (intervalSecs < 60) return `${intervalSecs}s`
    if (intervalSecs < 3600) return `${Math.round(intervalSecs / 60)}m`
    return `${Math.round(intervalSecs / 3600)}h`
  }
  return '스케줄'
}

// ---------- inner component (needs ReactFlowProvider context) ----------

function EditorCanvas({
  workflowId,
  initialNodes,
  initialEdges,
  workflowName,
  workflowData,
}: {
  workflowId: string
  initialNodes: Node[]
  initialEdges: Edge[]
  workflowName: string
  workflowData: import('../../api/workflows').WorkflowOut
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const addNotification = useUIStore((s) => s.addNotification)
  const rf = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [dragModule, setDragModule] = useState<StepModule | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // WebSocket for live execution updates
  const wsRef = useRef<WebSocket | null>(null)
  const nodesRef = useRef(nodes)
  useEffect(() => { nodesRef.current = nodes }, [nodes])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.hostname}:8000/ws/workflow/${workflowId}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.event === 'node_update' && msg.node_id && msg.status) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === msg.node_id
                ? { ...n, data: { ...n.data, executionStatus: msg.status } }
                : n
            )
          )
        }
        if (msg.event === 'workflow_complete') {
          setRunning(false)
          if (msg.status === 'success') {
            addNotification({ type: 'success', message: '워크플로우 실행 완료!' })
          } else {
            addNotification({ type: 'error', message: `실행 실패: ${msg.error || '알 수 없는 오류'}` })
          }
          setTimeout(() => {
            setNodes((nds) =>
              nds.map((n) => ({ ...n, data: { ...n.data, executionStatus: undefined } }))
            )
          }, 5000)
        }
      } catch {}
    }
    return () => ws.close()
  }, [workflowId])

  // Save mutation
  const saveMut = useMutation({
    mutationFn: () =>
      workflowsApi.update(workflowId, {
        canvas_data: {
          nodes: toCanvasNodes(nodes),
          edges: toCanvasEdges(edges),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', workflowId] })
      addNotification({ type: 'success', message: '저장되었습니다' })
    },
    onError: () => addNotification({ type: 'error', message: '저장 실패' }),
  })

  // Run mutation
  const runMut = useMutation({
    mutationFn: async () => {
      await workflowsApi.update(workflowId, {
        canvas_data: {
          nodes: toCanvasNodes(nodes),
          edges: toCanvasEdges(edges),
        },
      })
      return workflowsApi.run(workflowId)
    },
    onMutate: () => setRunning(true),
    onSuccess: () => {
      addNotification({ type: 'info', message: '워크플로우 실행 중...' })
    },
    onError: () => {
      setRunning(false)
      addNotification({ type: 'error', message: '실행 실패' })
    },
  })

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      const branch = params.sourceHandle === 'true'
        ? 'true'
        : params.sourceHandle === 'false'
        ? 'false'
        : null

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: false,
            style: {
              stroke: branch === 'true' ? '#10B981' : branch === 'false' ? '#EF4444' : '#334155',
              strokeWidth: 2,
            },
            data: { branch },
          },
          eds
        )
      )
    },
    [setEdges]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!dragModule || !wrapperRef.current) return

      const bounds = wrapperRef.current.getBoundingClientRect()
      const position = rf.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      })

      const newNode: Node = {
        id: makeNodeId(),
        type: 'workflowNode',
        position,
        data: moduleToNodeData(dragModule),
      }
      setNodes((nds) => [...nds, newNode])
      setSelectedNode(newNode)
      setDragModule(null)
    },
    [dragModule, rf, setNodes]
  )

  const onUpdateNode = useCallback(
    (nodeId: string, data: Partial<WorkflowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
        )
      )
      setSelectedNode((prev) =>
        prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev
      )
    },
    [setNodes]
  )

  const onDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      setSelectedNode(null)
    },
    [setNodes, setEdges]
  )

  const isScheduled = workflowData.schedule_type !== 'manual'

  return (
    <div className="flex h-screen bg-bg-primary">
      {/* Module Sidebar */}
      <ModuleSidebar onDragStart={setDragModule} />

      {/* Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-bg-card flex-shrink-0">
          {/* Left: back + name */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/workflows')}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <GitMerge className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold text-text-primary">
                {workflowName}
              </span>
            </div>
          </div>

          {/* Center: counts */}
          <div className="flex items-center gap-4">
            <span className="text-xs text-text-muted">
              {nodes.length} 노드 · {edges.length} 연결
            </span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            {/* Schedule button */}
            <button
              type="button"
              onClick={() => setShowSchedule(true)}
              className={`flex items-center gap-2 h-8 px-3 rounded-lg text-[12px] font-medium transition-all border ${
                isScheduled
                  ? 'bg-primary/8 border-primary/30 text-primary'
                  : 'border-border text-text-muted hover:text-text-secondary hover:border-border'
              }`}
              title="스케줄 설정"
            >
              {isScheduled ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <Clock className="w-3.5 h-3.5" />
              )}
              {isScheduled
                ? formatScheduleLabel(
                    workflowData.schedule_type,
                    workflowData.cron_expression,
                    workflowData.interval_seconds
                  )
                : '스케줄'}
            </button>

            {/* Save button */}
            <button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saving || saveMut.isPending}
              className="flex items-center gap-2 h-8 px-3 rounded-lg text-[12px] font-medium border border-border text-text-muted hover:text-text-primary hover:border-border hover:bg-bg-hover transition-all disabled:opacity-40"
            >
              {saveMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              저장
            </button>

            {/* Run button */}
            <button
              type="button"
              onClick={() => runMut.mutate()}
              disabled={running || runMut.isPending}
              className="flex items-center gap-2 h-8 px-3 rounded-lg text-[12px] font-semibold border border-success/40 bg-success/10 text-success hover:bg-success/20 transition-all disabled:opacity-40"
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {running ? '실행 중...' : '실행'}
            </button>
          </div>
        </div>

        {/* React Flow canvas */}
        <div ref={wrapperRef} className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={2.5}
            deleteKeyCode="Delete"
            style={{ background: '#080B12' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(255,255,255,0.04)"
            />
            <Controls
              className="!bg-bg-card !border !border-border !rounded-xl overflow-hidden"
              style={{ boxShadow: 'none' }}
            />
            <MiniMap
              nodeColor={(n) => {
                const d = n.data as WorkflowNodeData
                const colors: Record<string, string> = {
                  trigger: '#22D3EE', action: '#F59E0B', data: '#818CF8',
                  transform: '#10B981', condition: '#F472B6', merge: '#A78BFA'
                }
                return colors[d?.moduleType] || '#F59E0B'
              }}
              className="!bg-bg-card !border !border-border !rounded-xl"
              maskColor="rgba(8,11,18,0.85)"
            />

            {/* Empty state hint */}
            {nodes.length === 0 && (
              <Panel position="top-center" style={{ marginTop: '40%' }}>
                <div className="text-center pointer-events-none">
                  <GitMerge className="w-12 h-12 text-text-muted opacity-10 mx-auto mb-3" />
                  <p className="text-[13px] text-text-muted opacity-20">
                    왼쪽에서 모듈을 드래그하여 캔버스에 추가하세요
                  </p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
      </div>

      {/* Config panel */}
      <NodeConfigPanel
        node={selectedNode}
        allNodes={nodes}
        allEdges={edges.map((e) => ({ source: e.source, target: e.target }))}
        onUpdateNode={onUpdateNode}
        onDeleteNode={onDeleteNode}
        onClose={() => setSelectedNode(null)}
        workflowId={workflowId}
      />

      {/* Schedule modal */}
      {showSchedule && (
        <WorkflowScheduleModal
          workflow={workflowData}
          onClose={() => setShowSchedule(false)}
        />
      )}
    </div>
  )
}

// ---------- outer page wrapper ----------

export function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: workflow, isLoading, isError } = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => workflowsApi.get(id!).then((r) => r.data),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-text-muted">워크플로우 로딩 중...</p>
        </div>
      </div>
    )
  }

  if (isError || !workflow) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-4 opacity-60" />
          <p className="text-text-muted mb-4">워크플로우를 불러올 수 없습니다</p>
          <button
            type="button"
            onClick={() => navigate('/workflows')}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary border border-border hover:bg-bg-hover transition-all"
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  const initialNodes: Node[] = (workflow.canvas_data?.nodes || []).map((n) => ({
    id: n.id,
    type: n.type || 'workflowNode',
    position: n.position,
    data: n.data,
  }))

  const initialEdges: Edge[] = (workflow.canvas_data?.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    animated: false,
    style: {
      stroke: e.data?.branch === 'true'
        ? '#10B981'
        : e.data?.branch === 'false'
        ? '#EF4444'
        : '#334155',
      strokeWidth: 2,
    },
    data: e.data || {},
  }))

  return (
    <ReactFlowProvider>
      <EditorCanvas
        workflowId={workflow.id}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        workflowName={workflow.name}
        workflowData={workflow}
      />
    </ReactFlowProvider>
  )
}
