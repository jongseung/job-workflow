import { useEffect, useRef, useState } from 'react'
import { X, CheckCircle2, XCircle, Loader2, SkipForward, Clock, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RunLogEntry {
  id: string
  ts: string            // ISO timestamp
  kind: 'run_start' | 'run_end' | 'node_running' | 'node_success' | 'node_failed' | 'node_skipped'
  nodeId?: string
  nodeLabel?: string
  nodeType?: string
  durationMs?: number
  outputSummary?: string
  outputHtml?: string   // rendered HTML from html nodes
  error?: string
  runStatus?: string    // for run_end
}

interface Props {
  workflowId: string
  workflowName: string
  runId: string | null   // null = drawer is closed
  onClose: () => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(ms: number | undefined): string {
  if (!ms && ms !== 0) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const NODE_TYPE_LABEL: Record<string, string> = {
  trigger: 'TRIGGER',
  condition: 'COND',
  merge: 'MERGE',
  transform: 'TRANSFORM',
  action: 'ACTION',
}

// ─── Component ─────────────────────────────────────────────────────────────

export function WorkflowRunDrawer({ workflowId, workflowName, runId, onClose }: Props) {
  const [logs, setLogs] = useState<RunLogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [finalStatus, setFinalStatus] = useState<'success' | 'failed' | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<number>(0)
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const token = useAuthStore((s) => s.token)

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, collapsed])

  // Reset state when a new run starts
  useEffect(() => {
    if (!runId) return
    setLogs([])
    setFinalStatus(null)
    setElapsedMs(0)
    setIsRunning(true)
    setCollapsed(false)
    startTimeRef.current = Date.now()

    // Start elapsed timer
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current)
    }, 200)

    // Add initial log entry
    setLogs([{
      id: 'run_start',
      ts: new Date().toISOString(),
      kind: 'run_start',
    }])
  }, [runId])

  // WebSocket connection to /ws/events
  useEffect(() => {
    if (!token) return
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.hostname}:8000/ws/events?token=${token}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        const type = msg.type as string
        const data = msg.data || {}

        // Filter by current run
        if (data.workflow_run_id && data.workflow_run_id !== runId) return

        if (type === 'workflow_run_update') {
          const status = data.status as string
          if (status === 'running') {
            // Already handled by initial state
          } else if (status === 'success' || status === 'failed') {
            setIsRunning(false)
            setFinalStatus(status as 'success' | 'failed')
            if (timerRef.current) {
              clearInterval(timerRef.current)
              timerRef.current = null
            }
            setLogs((prev) => [
              ...prev,
              {
                id: `run_end_${Date.now()}`,
                ts: data.timestamp || new Date().toISOString(),
                kind: 'run_end',
                runStatus: status,
                durationMs: Date.now() - startTimeRef.current,
              },
            ])
          }
        }

        if (type === 'workflow_node_update') {
          const status = data.status as string
          const entry: RunLogEntry = {
            id: `${data.node_id}_${status}_${Date.now()}`,
            ts: data.timestamp || new Date().toISOString(),
            kind:
              status === 'running'  ? 'node_running'  :
              status === 'success'  ? 'node_success'  :
              status === 'failed'   ? 'node_failed'   :
              status === 'skipped'  ? 'node_skipped'  : 'node_running',
            nodeId: data.node_id,
            nodeLabel: data.node_label || data.node_id,
            nodeType: data.node_type,
            durationMs: data.duration_ms,
            outputSummary: data.output_summary,
            outputHtml: data.output_html,
            error: data.error,
          }
          setLogs((prev) => {
            // If transitioning from running → success/failed, replace the running entry
            if (status !== 'running') {
              const withoutRunning = prev.filter(
                (l) => !(l.nodeId === data.node_id && l.kind === 'node_running')
              )
              return [...withoutRunning, entry]
            }
            return [...prev, entry]
          })
        }
      } catch {}
    }

    return () => {
      ws.close()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [token, runId])

  if (!runId) return null

  const drawerHeight = collapsed ? 48 : 360

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-border shadow-2xl transition-all duration-300"
      style={{ height: drawerHeight, background: 'var(--color-bg-secondary, #0d1117)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-12 flex-shrink-0 border-b border-border">
        {/* Status indicator */}
        {isRunning && (
          <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
        )}
        {finalStatus === 'success' && (
          <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
        )}
        {finalStatus === 'failed' && (
          <XCircle className="w-4 h-4 text-danger flex-shrink-0" />
        )}

        {/* Title */}
        <span className="text-[12px] font-semibold text-text-primary truncate flex-1">
          실행 로그
          <span className="text-text-muted font-normal ml-1.5">— {workflowName}</span>
        </span>

        {/* Elapsed */}
        {(isRunning || finalStatus) && (
          <span className="flex items-center gap-1 text-[11px] font-mono text-text-muted">
            <Clock className="w-3 h-3" />
            {formatDuration(elapsedMs)}
          </span>
        )}

        {/* Final badge */}
        {finalStatus === 'success' && (
          <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-success/10 text-success">완료</span>
        )}
        {finalStatus === 'failed' && (
          <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-danger/10 text-danger">실패</span>
        )}
        {isRunning && (
          <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-primary/10 text-primary animate-pulse">실행 중</span>
        )}

        {/* Run ID */}
        <span className="text-[10px] font-mono text-text-muted hidden sm:block">
          {runId.slice(0, 8)}…
        </span>

        {/* Collapse / Close */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Log body */}
      {!collapsed && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[12px] leading-6"
        >
          {logs.map((entry) => (
            <LogLine key={entry.id} entry={entry} />
          ))}

          {isRunning && (
            <div className="flex items-center gap-2 text-text-muted mt-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>실행 중...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── LogLine ───────────────────────────────────────────────────────────────

function LogLine({ entry }: { entry: RunLogEntry }) {
  const [expanded, setExpanded] = useState(false)

  if (entry.kind === 'run_start') {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-text-muted text-[10px]">{formatTime(entry.ts)}</span>
        <span className="text-primary font-semibold">▶ 워크플로우 실행 시작</span>
      </div>
    )
  }

  if (entry.kind === 'run_end') {
    const ok = entry.runStatus === 'success'
    return (
      <div className="flex items-center gap-2 py-0.5 mt-1 pt-1 border-t border-border/50">
        <span className="text-text-muted text-[10px]">{formatTime(entry.ts)}</span>
        {ok ? (
          <span className="text-success font-semibold">✅ 워크플로우 완료</span>
        ) : (
          <span className="text-danger font-semibold">❌ 워크플로우 실패</span>
        )}
        {entry.durationMs !== undefined && (
          <span className="text-text-muted text-[11px]">({formatDuration(entry.durationMs)})</span>
        )}
      </div>
    )
  }

  const typeLabel = entry.nodeType ? NODE_TYPE_LABEL[entry.nodeType] || entry.nodeType.toUpperCase() : ''

  if (entry.kind === 'node_running') {
    return (
      <div className="flex items-center gap-2 py-0.5 text-text-muted">
        <span className="text-[10px]">{formatTime(entry.ts)}</span>
        <Loader2 className="w-3 h-3 animate-spin text-primary flex-shrink-0" />
        {typeLabel && (
          <span className="text-[10px] px-1 rounded bg-bg-tertiary text-text-muted">{typeLabel}</span>
        )}
        <span className="text-text-primary">{entry.nodeLabel}</span>
        <span className="text-text-muted">실행 중...</span>
      </div>
    )
  }

  if (entry.kind === 'node_success') {
    return (
      <div className="py-0.5">
        <div className="flex items-start gap-2">
          <span className="text-text-muted text-[10px] mt-0.5">{formatTime(entry.ts)}</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
          {typeLabel && (
            <span className="text-[10px] px-1 rounded bg-bg-tertiary text-text-muted mt-0.5">{typeLabel}</span>
          )}
          <div className="flex-1 min-w-0">
            <span className="text-text-primary">{entry.nodeLabel}</span>
            {entry.durationMs !== undefined && (
              <span className="text-text-muted ml-1.5 text-[11px]">({formatDuration(entry.durationMs)})</span>
            )}
            {entry.outputSummary && (
              <span className="text-text-muted ml-1.5 text-[11px]">→ {entry.outputSummary}</span>
            )}
            {entry.outputHtml && (
              <button
                type="button"
                onClick={() => setExpanded((x) => !x)}
                className="ml-2 text-[11px] text-emerald-400/80 hover:text-emerald-400 underline"
              >
                {expanded ? 'HTML 접기' : 'HTML 보기'}
              </button>
            )}
          </div>
        </div>
        {expanded && entry.outputHtml && (
          <div className="ml-10 mt-1.5 rounded-lg overflow-hidden border border-emerald-500/20">
            <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20">
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">HTML Report Preview</span>
              <button
                type="button"
                onClick={() => {
                  const win = window.open('', '_blank')
                  if (win) { win.document.write(entry.outputHtml!); win.document.close() }
                }}
                className="text-[10px] text-emerald-400/70 hover:text-emerald-400 transition-colors"
              >
                새 탭에서 열기 ↗
              </button>
            </div>
            <iframe
              srcDoc={entry.outputHtml}
              title="HTML Report"
              className="w-full border-0 bg-white"
              style={{ height: 320 }}
              sandbox="allow-same-origin"
            />
          </div>
        )}
      </div>
    )
  }

  if (entry.kind === 'node_failed') {
    return (
      <div className="py-0.5">
        <div className="flex items-start gap-2">
          <span className="text-text-muted text-[10px] mt-0.5">{formatTime(entry.ts)}</span>
          <XCircle className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" />
          {typeLabel && (
            <span className="text-[10px] px-1 rounded bg-bg-tertiary text-text-muted mt-0.5">{typeLabel}</span>
          )}
          <div className="flex-1 min-w-0">
            <span className="text-danger">{entry.nodeLabel}</span>
            {entry.durationMs !== undefined && (
              <span className="text-text-muted ml-1.5 text-[11px]">({formatDuration(entry.durationMs)})</span>
            )}
            {entry.error && (
              <button
                type="button"
                onClick={() => setExpanded((x) => !x)}
                className="ml-2 text-[11px] text-danger/70 hover:text-danger underline"
              >
                {expanded ? '접기' : '오류 보기'}
              </button>
            )}
          </div>
        </div>
        {expanded && entry.error && (
          <div className="ml-10 mt-1 px-3 py-2 rounded bg-danger/10 border border-danger/20 text-danger/80 text-[11px] whitespace-pre-wrap break-all">
            <AlertCircle className="w-3 h-3 inline mr-1.5 mb-0.5" />
            {entry.error}
          </div>
        )}
      </div>
    )
  }

  if (entry.kind === 'node_skipped') {
    return (
      <div className="flex items-center gap-2 py-0.5 text-text-muted">
        <span className="text-[10px]">{formatTime(entry.ts)}</span>
        <SkipForward className="w-3.5 h-3.5 flex-shrink-0" />
        {typeLabel && (
          <span className="text-[10px] px-1 rounded bg-bg-tertiary text-text-muted">{typeLabel}</span>
        )}
        <span className="line-through opacity-60">{entry.nodeLabel}</span>
        <span className="text-[11px]">건너뜀</span>
      </div>
    )
  }

  return null
}
