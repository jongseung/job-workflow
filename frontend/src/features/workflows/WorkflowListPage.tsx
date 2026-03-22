import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Play, Clock, Pencil, Trash2, GitMerge, X, FileText } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button, Input, Card, TableSkeleton } from '@/components/ui'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { workflowsApi, type WorkflowOut } from '../../api/workflows'
import { WorkflowScheduleModal } from './components/WorkflowScheduleModal'
import { useUIStore } from '../../stores/uiStore'

function relativeTime(iso: string | null) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}시간 전`
  return `${Math.floor(hrs / 24)}일 전`
}

function formatScheduleLabel(wf: WorkflowOut): string {
  if (wf.schedule_type === 'cron' && wf.cron_expression) return wf.cron_expression
  if (wf.schedule_type === 'interval' && wf.interval_seconds) {
    const s = wf.interval_seconds
    if (s < 60) return `${s}초마다`
    if (s < 3600) return `${Math.round(s / 60)}분마다`
    return `${Math.round(s / 3600)}시간마다`
  }
  return '수동'
}

const WORKFLOW_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:    { label: 'Draft',   className: 'bg-text-muted/8 text-text-muted' },
  active:   { label: 'Active',  className: 'bg-success/8 text-success' },
  archived: { label: 'Archived', className: 'bg-text-muted/8 text-text-muted' },
}

function WorkflowStatusBadge({ status }: { status: string }) {
  const cfg = WORKFLOW_STATUS_CONFIG[status] || WORKFLOW_STATUS_CONFIG.draft
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

export function WorkflowListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const addNotification = useUIStore((s) => s.addNotification)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [search, setSearch] = useState('')
  const [schedulingWf, setSchedulingWf] = useState<WorkflowOut | null>(null)

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list().then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: (name: string) => workflowsApi.create({ name }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      navigate(`/workflows/${res.data.id}/edit`)
    },
    onError: () => addNotification({ type: 'error', message: '워크플로우 생성 실패' }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => workflowsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      addNotification({ type: 'success', message: '삭제되었습니다' })
    },
    onError: () => addNotification({ type: 'error', message: '삭제 실패' }),
  })

  const runMut = useMutation({
    mutationFn: (id: string) => workflowsApi.run(id),
    onSuccess: () => addNotification({ type: 'success', message: '워크플로우 실행 시작' }),
    onError: () => addNotification({ type: 'error', message: '실행 실패' }),
  })

  const filtered = workflows.filter((w) =>
    !search || w.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = () => {
    const name = newName.trim() || '새 워크플로우'
    createMut.mutate(name)
  }

  return (
    <div>
      <Header title="Workflows" />
      <div className="p-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              type="text"
              placeholder="워크플로우 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11"
            />
          </div>
          <Button onClick={() => setCreating(true)} icon={Plus}>
            새 워크플로우
          </Button>
        </div>

        {/* Create modal */}
        {creating && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setCreating(false)
                setNewName('')
              }
            }}
          >
            <div className="w-96 bg-bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-text-primary">새 워크플로우</h2>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName('') }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-text-muted mb-4">이름을 입력하고 캔버스 에디터로 이동합니다</p>
              <Input
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                placeholder="워크플로우 이름"
                className="mb-4"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => { setCreating(false); setNewName('') }}
                >
                  취소
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreate}
                  disabled={createMut.isPending}
                >
                  {createMut.isPending ? '생성 중...' : '생성 및 편집'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} padding="md">
                <TableSkeleton rows={3} cols={1} />
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={GitMerge}
            title={search ? '검색 결과가 없습니다' : '워크플로우가 없습니다'}
            description={
              search
                ? '다른 검색어를 입력해보세요.'
                : '첫 번째 워크플로우를 생성하여 시작하세요.'
            }
            action={
              !search ? (
                <Button onClick={() => setCreating(true)} icon={Plus}>
                  새 워크플로우
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                onEdit={() => navigate(`/workflows/${wf.id}/edit`)}
                onRun={() => runMut.mutate(wf.id)}
                onSchedule={() => setSchedulingWf(wf)}
                onLogs={() => navigate(`/logs?tab=workflow&workflowId=${wf.id}`)}
                onDelete={() => {
                  if (window.confirm(`"${wf.name}" 워크플로우를 삭제하시겠습니까?`)) {
                    deleteMut.mutate(wf.id)
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Schedule modal */}
      {schedulingWf && (
        <WorkflowScheduleModal
          workflow={schedulingWf}
          onClose={() => {
            setSchedulingWf(null)
            qc.invalidateQueries({ queryKey: ['workflows'] })
          }}
        />
      )}
    </div>
  )
}

function WorkflowCard({
  workflow: wf,
  onEdit,
  onRun,
  onSchedule,
  onLogs,
  onDelete,
}: {
  workflow: WorkflowOut
  onEdit: () => void
  onRun: () => void
  onSchedule: () => void
  onLogs: () => void
  onDelete: () => void
}) {
  const schedLabel = formatScheduleLabel(wf)
  const isScheduled = wf.schedule_type !== 'manual'

  return (
    <Card
      padding="md"
      className="group cursor-pointer hover:border-border transition-colors"
      onClick={onEdit}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <WorkflowStatusBadge status={wf.status} />
          </div>
          <h3 className="text-sm font-semibold text-text-primary truncate">{wf.name}</h3>
          {wf.description && (
            <p className="text-xs text-text-muted mt-1 line-clamp-1">{wf.description}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <GitMerge className="w-3.5 h-3.5" />
          <span>{wf.node_count} 노드</span>
        </div>
        {isScheduled && (
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono">{schedLabel}</span>
          </div>
        )}
        {wf.last_run_status && (
          <StatusBadge status={wf.last_run_status} />
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between pt-3 border-t border-border-light"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col">
          <span className="text-xs text-text-muted">
            {relativeTime(wf.last_run_at || wf.updated_at || wf.created_at)}
          </span>
          <span className="text-[10px] text-text-muted/50 mt-0.5">
            {wf.created_by_name && <span>만든이: {wf.created_by_name}</span>}
            {wf.updated_by_name && <span className="ml-1.5">수정: {wf.updated_by_name}</span>}
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            title="실행"
            onClick={onRun}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-success hover:bg-success/10 transition-all"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="스케줄"
            onClick={onSchedule}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-all"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="로그"
            onClick={onLogs}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-amber-400 hover:bg-amber-400/10 transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="편집"
            onClick={onEdit}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="삭제"
            onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Card>
  )
}
