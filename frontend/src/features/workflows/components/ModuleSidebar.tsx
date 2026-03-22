import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { modulesApi, type StepModule } from '../../../api/modules'
import { NODE_TYPE_META } from './nodes/WorkflowNode'

const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'core', label: '코어' },
  { key: 'logic', label: '로직' },
  { key: 'database', label: '데이터베이스' },
  { key: 'http', label: 'HTTP' },
  { key: 'slack', label: 'Slack' },
  { key: 'email', label: 'Email' },
  { key: 'code', label: '코드' },
]

interface ModuleSidebarProps {
  onDragStart: (module: StepModule) => void
}

export function ModuleSidebar({ onDragStart }: ModuleSidebarProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  const { data: modules = [] } = useQuery({
    queryKey: ['modules'],
    queryFn: () => modulesApi.list().then((r) => r.data),
  })

  const filtered = modules.filter((m) => {
    const matchSearch = !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(search.toLowerCase())
    const matchCat = category === 'all' || m.category === category
    return matchSearch && matchCat
  })

  const grouped = filtered.reduce<Record<string, StepModule[]>>((acc, m) => {
    const key = m.module_type
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  return (
    <div
      className="w-64 flex-shrink-0 h-full flex flex-col border-r border-white/5"
      style={{ background: '#0D1117' }}
    >
      {/* Header */}
      <div className="p-3 border-b border-white/5">
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.15em] mb-3"
          style={{ color: '#848D97', fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          모듈 라이브러리
        </h2>
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
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
            className="w-full bg-white/5 rounded-lg pl-8 pr-3 py-2 text-[12px] text-white/70 outline-none border border-white/5 focus:border-indigo-400/40 placeholder:text-white/20 transition-colors"
            style={{ fontFamily: "'Barlow', sans-serif" }}
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="px-3 py-2 flex gap-1 flex-wrap border-b border-white/5">
        {CATEGORIES.filter((c) => c.key === 'all' || modules.some((m) => m.category === c.key)).map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setCategory(cat.key)}
            className={`
              px-2 py-0.5 rounded text-[10px] font-medium transition-all
              ${category === cat.key
                ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
                : 'text-white/30 hover:text-white/60 border border-transparent'}
            `}
            style={{ fontFamily: "'Barlow', sans-serif" }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Module list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {Object.entries(grouped).map(([type, mods]) => {
          const meta = NODE_TYPE_META[type] || NODE_TYPE_META.action
          return (
            <div key={type}>
              <div
                className="flex items-center gap-1.5 px-2 py-1 mb-1"
              >
                <span className="text-xs">{meta.icon}</span>
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: meta.color, fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {meta.label}
                </span>
              </div>
              {mods.map((mod) => (
                <ModuleCard key={mod.id} module={mod} onDragStart={onDragStart} />
              ))}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8">
            <div className="text-2xl mb-2">🔍</div>
            <div
              className="text-[12px]"
              style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}
            >
              모듈을 찾을 수 없습니다
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div
        className="p-3 border-t border-white/5 text-[10px] flex items-center gap-1.5"
        style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        드래그하여 캔버스에 추가
      </div>
    </div>
  )
}

function ModuleCard({ module: mod, onDragStart }: { module: StepModule; onDragStart: (m: StepModule) => void }) {
  const meta = NODE_TYPE_META[mod.module_type] || NODE_TYPE_META.action
  const icon = mod.icon || meta.icon
  const color = mod.color || meta.color

  return (
    <div
      draggable
      onDragStart={() => onDragStart(mod)}
      className="
        group flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing
        border border-transparent hover:border-white/10 transition-all duration-150 mb-0.5
      "
      style={{
        background: 'transparent',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = `${color}08`
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
      }}
    >
      {/* Icon */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm mt-0.5"
        style={{ background: `${color}18`, border: `1px solid ${color}30` }}
      >
        {icon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div
          className="text-[12px] font-semibold text-white/80 truncate group-hover:text-white/95 transition-colors"
          style={{ fontFamily: "'Barlow', sans-serif" }}
        >
          {mod.name}
        </div>
        {mod.description && (
          <div
            className="text-[10px] leading-tight mt-0.5 line-clamp-1"
            style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}
          >
            {mod.description}
          </div>
        )}
      </div>

      {/* Drag handle indicator */}
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity self-center">
        <svg width="8" height="14" viewBox="0 0 8 14" fill="#848D97">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="6" cy="2" r="1.5" />
          <circle cx="2" cy="7" r="1.5" />
          <circle cx="6" cy="7" r="1.5" />
          <circle cx="2" cy="12" r="1.5" />
          <circle cx="6" cy="12" r="1.5" />
        </svg>
      </div>
    </div>
  )
}
