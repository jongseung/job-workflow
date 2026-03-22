import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Info, GripVertical } from 'lucide-react'
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

const MIN_WIDTH = 200
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 256

interface ModuleSidebarProps {
  onDragStart: (module: StepModule) => void
}

export function ModuleSidebar({ onDragStart }: ModuleSidebarProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const { data: modules = [] } = useQuery({
    queryKey: ['modules'],
    queryFn: () => modulesApi.list().then((r) => r.data),
  })

  const filtered = modules.filter((m) => {
    const matchSearch =
      !search ||
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

  // Resize handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
      setWidth(newWidth)
    }
    const onMouseUp = () => {
      if (!isResizing.current) return
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return (
    <div
      className="flex-shrink-0 h-full flex border-r border-border bg-bg-card relative"
      style={{ width }}
    >
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-3 border-b border-border">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted mb-3">
            모듈 라이브러리
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="모듈 검색..."
              className="w-full bg-bg-tertiary rounded-lg pl-8 pr-3 py-2 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 placeholder:text-text-muted transition-colors"
            />
          </div>
        </div>

        {/* Category filter */}
        <div className="px-3 py-2 flex gap-1 flex-wrap border-b border-border">
          {CATEGORIES.filter(
            (c) => c.key === 'all' || modules.some((m) => m.category === c.key)
          ).map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setCategory(cat.key)}
              className={`
                px-2 py-0.5 rounded text-[10px] font-medium transition-all border
                ${category === cat.key
                  ? 'bg-primary/8 text-primary border-primary/30'
                  : 'text-text-muted border-transparent hover:text-text-secondary'}
              `}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Module list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {Object.entries(grouped).map(([type, mods]) => {
            const meta = NODE_TYPE_META[type] || NODE_TYPE_META.action
            const { Icon } = meta
            return (
              <div key={type}>
                <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
                  <Icon size={11} style={{ color: meta.color, flexShrink: 0 }} />
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: meta.color }}
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
              <Search className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
              <div className="text-[12px] text-text-muted">모듈을 찾을 수 없습니다</div>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="p-3 border-t border-border text-[10px] text-text-muted flex items-center gap-1.5">
          <Info className="w-3 h-3" />
          드래그하여 캔버스에 추가
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize group z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={onMouseDown}
      >
        <div className="absolute top-1/2 -translate-y-1/2 right-0 w-1 h-8 rounded-full bg-border group-hover:bg-primary/50 group-active:bg-primary transition-colors" />
      </div>
    </div>
  )
}

function ModuleCard({
  module: mod,
  onDragStart,
}: {
  module: StepModule
  onDragStart: (m: StepModule) => void
}) {
  const meta = NODE_TYPE_META[mod.module_type] || NODE_TYPE_META.action
  const { Icon } = meta
  const color = mod.color || meta.color

  return (
    <div
      draggable
      onDragStart={() => onDragStart(mod)}
      className="group flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing border border-transparent hover:border-border hover:bg-bg-hover transition-all duration-150 mb-0.5"
    >
      {/* Icon */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: `${color}18`, border: `1px solid ${color}30` }}
      >
        <Icon size={14} style={{ color }} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-text-secondary truncate group-hover:text-text-primary transition-colors">
          {mod.name}
        </div>
        {mod.description && (
          <div className="text-[10px] text-text-muted leading-tight mt-0.5 line-clamp-1">
            {mod.description}
          </div>
        )}
      </div>

      {/* Drag handle */}
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity self-center">
        <GripVertical className="w-3.5 h-3.5 text-text-muted" />
      </div>
    </div>
  )
}
