import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Pencil, Trash2, Boxes } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button, Input, Card, Table, TableHeader, TableHead, TableBody, TableRow, TableCell, TableSkeleton } from '@/components/ui'
import { EmptyState } from '@/components/shared/EmptyState'
import { modulesApi, type StepModule } from '../../api/modules'
import { NODE_TYPE_META } from '../workflows/components/nodes/WorkflowNode'
import { useUIStore } from '../../stores/uiStore'

const EXECUTOR_COLORS: Record<string, string> = {
  python:  '#22C55E',
  http:    '#38BDF8',
  sql:     '#FB923C',
  builtin: '#818CF8',
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

  const types = ['all', ...Object.keys(NODE_TYPE_META)]
  const filtered = modules.filter((m) => {
    const matchSearch =
      !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || m.module_type === typeFilter
    return matchSearch && matchType
  })

  return (
    <div>
      <Header title="Module Library" />
      <div className="p-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="모듈 검색..."
                className="pl-11"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {types.map((t) => {
                const meta = NODE_TYPE_META[t]
                const active = typeFilter === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? 'bg-primary/8 border-primary/30 text-primary'
                        : 'border-border text-text-muted hover:text-text-secondary'
                    }`}
                    style={active && meta ? { borderColor: `${meta.color}40`, color: meta.color, background: `${meta.color}10` } : undefined}
                  >
                    {t === 'all' ? '전체' : t}
                  </button>
                )
              })}
            </div>
          </div>
          <Button onClick={() => navigate('/admin/modules/new')} icon={Plus}>
            새 모듈
          </Button>
        </div>

        {/* Table */}
        {isLoading ? (
          <Card padding="none">
            <TableSkeleton rows={5} cols={6} />
          </Card>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={search || typeFilter !== 'all' ? '검색 결과가 없습니다' : '모듈이 없습니다'}
            description="새 모듈을 생성하여 워크플로우에서 사용해보세요."
            action={
              <Button onClick={() => navigate('/admin/modules/new')} icon={Plus}>
                새 모듈
              </Button>
            }
          />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>모듈 이름</TableHead>
                  <TableHead>타입</TableHead>
                  <TableHead>실행기</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>버전</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((mod) => (
                  <ModuleRow
                    key={mod.id}
                    module={mod}
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
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Stats footer */}
        {!isLoading && filtered.length > 0 && (
          <div className="mt-4 flex items-center gap-4 text-xs text-text-muted">
            <span>총 {filtered.length}개 모듈</span>
            <span>빌트인 {filtered.filter((m) => m.is_builtin).length}개</span>
            <span>커스텀 {filtered.filter((m) => !m.is_builtin).length}개</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ModuleRow({
  module: mod,
  onEdit,
  onDelete,
}: {
  module: StepModule
  onEdit: () => void
  onDelete: () => void
}) {
  const typeMeta = NODE_TYPE_META[mod.module_type] || NODE_TYPE_META.action
  const { Icon } = typeMeta
  const execColor = EXECUTOR_COLORS[mod.executor_type] || '#848D97'

  return (
    <TableRow>
      {/* Name */}
      <TableCell>
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${typeMeta.color}15`, border: `1px solid ${typeMeta.color}25` }}
          >
            <Icon size={13} style={{ color: typeMeta.color }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary truncate">
                {mod.name}
              </span>
              {mod.is_builtin && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary/8 text-primary flex-shrink-0">
                  Built-in
                </span>
              )}
            </div>
            {mod.description && (
              <span className="text-xs text-text-muted truncate block">{mod.description}</span>
            )}
          </div>
        </div>
      </TableCell>

      {/* Type */}
      <TableCell>
        <span className="text-xs font-medium" style={{ color: typeMeta.color }}>
          {mod.module_type}
        </span>
      </TableCell>

      {/* Executor */}
      <TableCell>
        <span
          className="px-2 py-0.5 rounded text-[10px] font-medium"
          style={{ background: `${execColor}15`, color: execColor }}
        >
          {mod.executor_type}
        </span>
      </TableCell>

      {/* Category */}
      <TableCell>
        <span className="text-sm text-text-muted">{mod.category || '—'}</span>
      </TableCell>

      {/* Version */}
      <TableCell>
        <span className="text-sm text-text-muted font-mono">v{mod.version}</span>
      </TableCell>

      {/* Actions */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
            title="편집"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {!mod.is_builtin && (
            <button
              type="button"
              onClick={onDelete}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-all"
              title="삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
