import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowsApi, type WorkflowOut } from '../../api/workflows'
import { useUIStore } from '../../stores/uiStore'

const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  draft:    { label: 'Draft',    color: '#484F58', dot: '#484F58'  },
  active:   { label: 'Active',   color: '#10B981', dot: '#10B981'  },
  archived: { label: 'Archived', color: '#6B7280', dot: '#6B7280'  },
}

const RUN_META: Record<string, { color: string }> = {
  success:  { color: '#10B981' },
  failed:   { color: '#EF4444' },
  running:  { color: '#F59E0B' },
  pending:  { color: '#818CF8' },
  cancelled:{ color: '#6B7280' },
}

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

export function WorkflowListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const addNotification = useUIStore((s) => s.addNotification)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [search, setSearch] = useState('')

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
    <div className="min-h-screen p-8" style={{ background: '#080B12' }}>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.3)' }}>
              <span className="text-xs">⬡</span>
            </div>
            <h1
              className="text-2xl font-bold text-white/90"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
            >
              WORKFLOWS
            </h1>
          </div>
          <p className="text-[12px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
            자동화 워크플로우를 설계하고 실행하세요
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 h-9 px-5 rounded-xl text-[13px] font-semibold transition-all"
          style={{
            background: 'rgba(129,140,248,0.15)',
            border: '1px solid rgba(129,140,248,0.3)',
            color: '#818CF8',
            fontFamily: "'Barlow', sans-serif",
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(129,140,248,0.25)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(129,140,248,0.15)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          새 워크플로우
        </button>
      </div>

      {/* Create modal overlay */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-96 rounded-2xl p-6 border border-white/10"
            style={{ background: '#0D1117' }}
          >
            <h2
              className="text-[15px] font-bold text-white/90 mb-1"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              새 워크플로우
            </h2>
            <p className="text-[11px] mb-4" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
              이름을 입력하고 캔버스 에디터로 이동합니다
            </p>
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              placeholder="워크플로우 이름"
              className="w-full rounded-lg px-3 py-2.5 text-[13px] text-white/80 outline-none border border-white/10 focus:border-indigo-400/40 transition-colors mb-4"
              style={{ background: 'rgba(255,255,255,0.04)', fontFamily: "'Barlow', sans-serif" }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setCreating(false); setNewName('') }}
                className="flex-1 h-9 rounded-lg text-[12px] text-white/40 border border-white/10 hover:bg-white/5 transition-all"
                style={{ fontFamily: "'Barlow', sans-serif" }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={createMut.isPending}
                className="flex-1 h-9 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-50"
                style={{
                  background: 'rgba(129,140,248,0.2)',
                  border: '1px solid rgba(129,140,248,0.4)',
                  color: '#818CF8',
                  fontFamily: "'Barlow', sans-serif",
                }}
              >
                {createMut.isPending ? '생성 중...' : '생성 및 편집'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6 max-w-xs">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
          fill="none" stroke="#484F58" strokeWidth={2} viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="워크플로우 검색..."
          className="w-full pl-9 pr-3 py-2 rounded-xl text-[12px] text-white/70 outline-none border border-white/5 focus:border-indigo-400/30 transition-colors"
          style={{ background: '#0D1117', fontFamily: "'Barlow', sans-serif" }}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-2xl animate-pulse"
              style={{ background: '#0D1117' }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="text-5xl mb-4 opacity-10">⬡</div>
          <p className="text-[13px] opacity-30" style={{ color: '#848D97', fontFamily: "'Barlow', sans-serif" }}>
            {search ? '검색 결과가 없습니다' : '워크플로우가 없습니다. 새로 만들어보세요!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onEdit={() => navigate(`/workflows/${wf.id}/edit`)}
              onRun={() => runMut.mutate(wf.id)}
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
  )
}

function WorkflowCard({
  workflow: wf,
  onEdit,
  onRun,
  onDelete,
}: {
  workflow: WorkflowOut
  onEdit: () => void
  onRun: () => void
  onDelete: () => void
}) {
  const statusMeta = STATUS_META[wf.status] || STATUS_META.draft
  const runColor = wf.last_run_status ? (RUN_META[wf.last_run_status]?.color || '#6B7280') : '#484F58'

  return (
    <div
      className="group relative rounded-2xl border border-white/5 p-5 flex flex-col gap-4 cursor-pointer transition-all duration-200 overflow-hidden"
      style={{ background: '#0D1117' }}
      onClick={onEdit}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(129,140,248,0.2)'
        ;(e.currentTarget as HTMLDivElement).style.background = '#0F1420'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.05)'
        ;(e.currentTarget as HTMLDivElement).style.background = '#0D1117'
      }}
    >
      {/* Gradient accent line at top */}
      <div
        className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(129,140,248,0.5), transparent)' }}
      />

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: statusMeta.dot, boxShadow: `0 0 6px ${statusMeta.dot}60` }}
            />
            <h3
              className="text-[14px] font-semibold text-white/85 truncate"
              style={{ fontFamily: "'Barlow', sans-serif" }}
            >
              {wf.name}
            </h3>
          </div>
          {wf.description && (
            <p
              className="text-[11px] line-clamp-1"
              style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}
            >
              {wf.description}
            </p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4">
        <Stat icon="⬡" label="노드" value={String(wf.node_count)} />
        <Stat icon="⟳" label="스케줄" value={wf.schedule_type === 'manual' ? '수동' : wf.schedule_type} />
        <div className="flex-1" />
        {wf.last_run_status && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: runColor }} />
            <span className="text-[10px] uppercase" style={{ color: runColor, fontFamily: "'Barlow Condensed', sans-serif" }}>
              {wf.last_run_status}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between pt-3 border-t border-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[10px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
          {relativeTime(wf.last_run_at || wf.updated_at || wf.created_at)}
        </span>

        <div className="flex items-center gap-1">
          {/* Run button */}
          <ActionButton
            title="실행"
            color="#10B981"
            onClick={onRun}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </ActionButton>

          {/* Edit button */}
          <ActionButton title="편집" color="#818CF8" onClick={onEdit}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </ActionButton>

          {/* Delete button */}
          <ActionButton title="삭제" color="#EF4444" onClick={onDelete}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
            </svg>
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-widest" style={{ color: '#484F58', fontFamily: "'Barlow Condensed', sans-serif" }}>
        {label}
      </span>
      <div className="flex items-center gap-1">
        <span className="text-[10px] opacity-40">{icon}</span>
        <span className="text-[12px] font-semibold text-white/60" style={{ fontFamily: "'Barlow', sans-serif" }}>
          {value}
        </span>
      </div>
    </div>
  )
}

function ActionButton({
  children,
  title,
  color,
  onClick,
}: {
  children: React.ReactNode
  title: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
      style={{ color: '#484F58' }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.color = color
        ;(e.currentTarget as HTMLButtonElement).style.background = `${color}15`
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.color = '#484F58'
        ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}
