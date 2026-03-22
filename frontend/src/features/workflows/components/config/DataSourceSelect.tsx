import { useQuery } from '@tanstack/react-query'
import { Database, ChevronDown } from 'lucide-react'
import { getDataSources } from '../../../../api/datasources'

interface DataSourceSelectProps {
  value: string | null
  onChange: (id: string | null, name: string) => void
  placeholder?: string
  className?: string
}

export function DataSourceSelect({
  value,
  onChange,
  placeholder = '데이터소스 선택...',
  className = '',
}: DataSourceSelectProps) {
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['datasources'],
    queryFn: getDataSources,
  })

  const selected = sources.find((s) => s.id === value)

  return (
    <div className={`relative ${className}`}>
      <Database
        className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none"
      />
      <ChevronDown
        className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none"
      />
      <select
        value={value ?? ''}
        onChange={(e) => {
          const id = e.target.value || null
          const name = sources.find((s) => s.id === id)?.name || ''
          onChange(id, name)
        }}
        disabled={isLoading}
        className="w-full appearance-none bg-bg-tertiary rounded-lg pl-9 pr-9 py-1.5 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors disabled:opacity-50"
      >
        <option value="">{isLoading ? '로딩 중...' : placeholder}</option>
        {sources.map((ds) => (
          <option key={ds.id} value={ds.id}>
            {ds.name} ({ds.db_type})
          </option>
        ))}
      </select>
      {selected && (
        <span className="absolute left-9 top-1/2 -translate-y-1/2 text-[12px] text-text-primary pointer-events-none truncate max-w-[calc(100%-4.5rem)]">
          {selected.name}
        </span>
      )}
    </div>
  )
}
