import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

// Convert ReactFlow nodes → canvas nodes for save
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

  // Keep a ref of latest nodes for WS handler
  const nodesRef = useRef(nodes)
  useEffect(() => { nodesRef.current = nodes }, [nodes])

  // Connect WS on mount
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
          // Clear execution highlights after 5s
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
      // Save first
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
      // Determine branch label from source handle
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

  // Drag-and-drop from sidebar
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
      // Update selected node if same
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

  return (
    <div className="flex h-screen" style={{ background: '#080B12' }}>
      {/* Module Sidebar */}
      <ModuleSidebar onDragStart={setDragModule} />

      {/* Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div
          className="h-14 flex items-center justify-between px-4 border-b border-white/5 flex-shrink-0"
          style={{ background: '#0D1117' }}
        >
          {/* Left: back + name */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/workflows')}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400/60" />
              <span
                className="text-[13px] font-semibold text-white/80"
                style={{ fontFamily: "'Barlow', sans-serif" }}
              >
                {workflowName}
              </span>
            </div>
          </div>

          {/* Center: node/edge count */}
          <div className="flex items-center gap-4">
            <span className="text-[11px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
              {nodes.length} 노드 · {edges.length} 연결
            </span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            {/* Schedule button */}
            <button
              type="button"
              onClick={() => setShowSchedule(true)}
              className="flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-medium transition-all border"
              style={{
                background: workflowData.schedule_type !== 'manual'
                  ? 'rgba(129,140,248,0.12)'
                  : 'transparent',
                borderColor: workflowData.schedule_type !== 'manual'
                  ? 'rgba(129,140,248,0.35)'
                  : 'rgba(255,255,255,0.08)',
                color: workflowData.schedule_type !== 'manual' ? '#818CF8' : '#484F58',
                fontFamily: "'Barlow', sans-serif",
              }}
              title="스케줄 설정"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {workflowData.schedule_type === 'cron'
                ? workflowData.cron_expression || 'Cron'
                : workflowData.schedule_type === 'interval'
                ? workflowData.interval_seconds
                  ? `↻ ${workflowData.interval_seconds < 60
                      ? `${workflowData.interval_seconds}s`
                      : workflowData.interval_seconds < 3600
                      ? `${Math.round(workflowData.interval_seconds / 60)}m`
                      : `${Math.round(workflowData.interval_seconds / 3600)}h`}`
                  : '인터벌'
                : '스케줄'}
            </button>

            <button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saving || saveMut.isPending}
              className="flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-medium transition-all border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 hover:bg-white/5 disabled:opacity-40"
              style={{ fontFamily: "'Barlow', sans-serif" }}
            >
              {saveMut.isPending ? (
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={2} strokeDasharray="40" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              )}
              저장
            </button>

            <button
              type="button"
              onClick={() => runMut.mutate()}
              disabled={running || runMut.isPending}
              className="flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-40"
              style={{
                background: running ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.2)',
                border: '1px solid rgba(16,185,129,0.4)',
                color: '#10B981',
                fontFamily: "'Barlow', sans-serif",
              }}
            >
              {running ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={2} strokeDasharray="40" strokeLinecap="round" />
                  </svg>
                  실행 중...
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  실행
                </>
              )}
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
              className="!bg-[#0D1117] !border !border-white/10 !rounded-xl overflow-hidden"
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
              className="!bg-[#0D1117] !border !border-white/10 !rounded-xl"
              maskColor="rgba(8,11,18,0.85)"
            />

            {/* Empty state hint */}
            {nodes.length === 0 && (
              <Panel position="top-center" style={{ marginTop: '40%' }}>
                <div className="text-center pointer-events-none">
                  <div className="text-5xl mb-4 opacity-10">⬡</div>
                  <p className="text-[13px] opacity-20" style={{ color: '#848D97', fontFamily: "'Barlow', sans-serif" }}>
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
      <div className="h-screen flex items-center justify-center" style={{ background: '#080B12' }}>
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin w-8 h-8" viewBox="0 0 24 24" fill="none" style={{ color: '#818CF8' }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={2} strokeDasharray="40" strokeLinecap="round" />
          </svg>
          <p className="text-[13px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>워크플로우 로딩 중...</p>
        </div>
      </div>
    )
  }

  if (isError || !workflow) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#080B12' }}>
        <div className="text-center">
          <div className="text-4xl mb-4">⚠</div>
          <p className="text-white/40 mb-4" style={{ fontFamily: "'Barlow', sans-serif" }}>워크플로우를 불러올 수 없습니다</p>
          <button
            type="button"
            onClick={() => navigate('/workflows')}
            className="px-4 py-2 rounded-lg text-[12px] text-white/60 border border-white/10 hover:bg-white/5 transition-all"
            style={{ fontFamily: "'Barlow', sans-serif" }}
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  // Build ReactFlow node/edge arrays from canvas_data
  const rawNodes: Node[] = (workflow.canvas_data?.nodes || []).map((n: CanvasNode) => ({
    id: n.id,
    type: n.type || 'workflowNode',
    position: n.position,
    data: n.data,
  }))

  const rawEdges: Edge[] = (workflow.canvas_data?.edges || []).map((e: CanvasEdge) => {
    const branch = e.data?.branch
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      animated: false,
      style: {
        stroke: branch === 'true' ? '#10B981' : branch === 'false' ? '#EF4444' : '#334155',
        strokeWidth: 2,
      },
      data: e.data || {},
    }
  })

  return (
    <ReactFlowProvider>
      <EditorCanvas
        workflowId={workflow.id}
        initialNodes={rawNodes}
        initialEdges={rawEdges}
        workflowName={workflow.name}
        workflowData={workflow}
      />
    </ReactFlowProvider>
  )
}
