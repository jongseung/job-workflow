import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { modulesApi, type StepModule } from '../../api/modules'
import { useUIStore } from '../../stores/uiStore'

const TYPE_META: Record<string, { color: string; icon: string }> = {
  trigger:   { color: '#22D3EE', icon: '⚡' },
  action:    { color: '#F59E0B', icon: '⚙' },
  data:      { color: '#818CF8', icon: '🗃' },
  transform: { color: '#10B981', icon: '⟳' },
  condition: { color: '#F472B6', icon: '◇' },
  merge:     { color: '#A78BFA', icon: '⊕' },
}

const EXECUTOR_META: Record<string, { color: string; label: string }> = {
  python:  { color: '#22C55E', label: 'Python' },
  http:    { color: '#38BDF8', label: 'HTTP'   },
  sql:     { color: '#FB923C', label: 'SQL'    },
  builtin: { color: '#818CF8', label: 'Built-in' },
}

export function ModuleListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const addNotification = useUIStore((s) => s.addNotification)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn: () => modulesApi.list().then((r) => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => modulesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modules'] })
      addNotification({ type: 'success', message: '모듈이 삭제되었습니다' })
    },
    onError: () => addNotification({ type: 'error', message: '삭제 실패' }),
  })

  const types = ['all', ...Object.keys(TYPE_META)]
  const filtered = modules.filter((m) => {
    const matchSearch = !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || m.module_type === typeFilter
    return matchSearch && matchType
  })

  return (
    <div className="min-h-screen p-8" style={{ background: '#080B12' }}>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center text-xs"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              ⚙
            </div>
            <h1
              className="text-2xl font-bold text-white/90"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
            >
              MODULE LIBRARY
            </h1>
          </div>
          <p className="text-[12px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
            워크플로우에서 사용할 수 있는 모듈을 관리합니다
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/admin/modules/new')}
          className="flex items-center gap-2 h-9 px-5 rounded-xl text-[13px] font-semibold transition-all"
          style={{
            background: 'rgba(245,158,11,0.15)',
            border: '1px solid rgba(245,158,11,0.3)',
            color: '#F59E0B',
            fontFamily: "'Barlow', sans-serif",
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.25)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.15)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          새 모듈
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative">
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
            placeholder="모듈 검색..."
            className="pl-9 pr-3 py-2 rounded-xl text-[12px] text-white/70 outline-none border border-white/5 focus:border-amber-400/30 transition-colors w-60"
            style={{ background: '#0D1117', fontFamily: "'Barlow', sans-serif" }}
          />
        </div>

        <div className="flex gap-1">
          {types.map((t) => {
            const meta = TYPE_META[t]
            const isActive = typeFilter === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className="px-3 py-1 rounded-lg text-[11px] font-medium transition-all"
                style={{
                  background: isActive ? (meta ? `${meta.color}20` : 'rgba(255,255,255,0.08)') : 'transparent',
                  border: isActive ? `1px solid ${meta ? meta.color + '40' : 'rgba(255,255,255,0.2)'}` : '1px solid transparent',
                  color: isActive ? (meta?.color || '#ffffff') : '#484F58',
                  fontFamily: "'Barlow', sans-serif",
                }}
              >
                {t === 'all' ? '전체' : t}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border border-white/5 overflow-hidden"
        style={{ background: '#0D1117' }}
      >
        {/* Table header */}
        <div
          className="grid gap-4 px-5 py-3 text-[10px] font-bold uppercase tracking-widest border-b border-white/5"
          style={{
            gridTemplateColumns: '1fr 80px 90px 100px 120px 100px',
            color: '#484F58',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          <span>모듈 이름</span>
          <span>타입</span>
          <span>실행기</span>
          <span>카테고리</span>
          <span>버전</span>
          <span className="text-right">액션</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <svg className="animate-spin w-5 h-5 mx-auto" viewBox="0 0 24 24" fill="none" style={{ color: '#818CF8' }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={2} strokeDasharray="40" strokeLinecap="round" />
            </svg>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[12px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
              {search || typeFilter !== 'all' ? '검색 결과 없음' : '모듈이 없습니다'}
            </p>
          </div>
        ) : (
          filtered.map((mod, idx) => (
            <ModuleRow
              key={mod.id}
              module={mod}
              isLast={idx === filtered.length - 1}
              onEdit={() => navigate(`/admin/modules/${mod.id}/edit`)}
              onDelete={() => {
                if (mod.is_builtin) {
                  addNotification({ type: 'warning', message: '빌트인 모듈은 삭제할 수 없습니다' })
                  return
                }
                if (window.confirm(`"${mod.name}" 모듈을 삭제하시겠습니까?`)) {
                  deleteMut.mutate(mod.id)
                }
              }}
            />
          ))
        )}
      </div>

      {/* Stats footer */}
      {!isLoading && (
        <div className="mt-4 flex items-center gap-4 px-1">
          <span className="text-[11px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
            총 {filtered.length}개 모듈
          </span>
          <span className="text-[11px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
            빌트인 {filtered.filter((m) => m.is_builtin).length}개
          </span>
          <span className="text-[11px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
            커스텀 {filtered.filter((m) => !m.is_builtin).length}개
          </span>
        </div>
      )}
    </div>
  )
}

function ModuleRow({
  module: mod,
  isLast,
  onEdit,
  onDelete,
}: {
  module: StepModule
  isLast: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const typeMeta = TYPE_META[mod.module_type] || { color: '#848D97', icon: '?' }
  const execMeta = EXECUTOR_META[mod.executor_type] || { color: '#848D97', label: mod.executor_type }

  return (
    <div
      className="grid gap-4 px-5 py-3.5 items-center transition-colors group"
      style={{
        gridTemplateColumns: '1fr 80px 90px 100px 120px 100px',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
      }}
    >
      {/* Name + icon */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
          style={{ background: `${typeMeta.color}15`, border: `1px solid ${typeMeta.color}25` }}
        >
          {mod.icon || typeMeta.icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[13px] font-semibold text-white/80 truncate"
              style={{ fontFamily: "'Barlow', sans-serif" }}
            >
              {mod.name}
            </span>
            {mod.is_builtin && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0"
                style={{
                  background: 'rgba(129,140,248,0.1)',
                  color: '#818CF8',
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                Built-in
              </span>
            )}
          </div>
          {mod.description && (
            <span
              className="text-[10px] truncate block"
              style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}
            >
              {mod.description}
            </span>
          )}
        </div>
      </div>

      {/* Type */}
      <div>
        <span
          className="text-[11px] font-medium"
          style={{ color: typeMeta.color, fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          {typeMeta.icon} {mod.module_type}
        </span>
      </div>

      {/* Executor */}
      <div>
        <span
          className="px-2 py-0.5 rounded text-[10px] font-medium"
          style={{
            background: `${execMeta.color}15`,
            color: execMeta.color,
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          {execMeta.label}
        </span>
      </div>

      {/* Category */}
      <div>
        <span className="text-[12px]" style={{ color: '#848D97', fontFamily: "'Barlow', sans-serif" }}>
          {mod.category || '—'}
        </span>
      </div>

      {/* Version */}
      <div>
        <span className="text-[12px] font-mono" style={{ color: '#848D97', fontFamily: "'JetBrains Mono', monospace" }}>
          v{mod.version}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
          style={{ color: '#484F58' }}
          title="편집"
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = '#818CF8'
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(129,140,248,0.1)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = '#484F58'
            ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>

        {!mod.is_builtin && (
          <button
            type="button"
            onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
            style={{ color: '#484F58' }}
            title="삭제"
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#EF4444'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#484F58'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
