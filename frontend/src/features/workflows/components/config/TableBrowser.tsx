import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, Table2, Columns } from 'lucide-react'
import { getDataSourceTables, getTableSchema } from '../../../../api/datasources'

interface TableBrowserProps {
  datasourceId: string | null
  onSelectTable?: (tableName: string) => void
}

export function TableBrowser({ datasourceId, onSelectTable }: TableBrowserProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: tablesData, isLoading } = useQuery({
    queryKey: ['ds-tables', datasourceId],
    queryFn: () => getDataSourceTables(datasourceId!),
    enabled: !!datasourceId,
  })

  const { data: schemaData } = useQuery({
    queryKey: ['ds-schema', datasourceId, expanded],
    queryFn: () => getTableSchema(datasourceId!, expanded!),
    enabled: !!datasourceId && !!expanded,
  })

  if (!datasourceId) {
    return (
      <div className="text-[11px] text-text-muted py-2 text-center">
        데이터소스를 먼저 선택하세요
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-6 rounded bg-bg-hover animate-pulse" />
        ))}
      </div>
    )
  }

  const tables = tablesData?.tables ?? []

  if (tables.length === 0) {
    return (
      <div className="text-[11px] text-text-muted py-2 text-center">테이블이 없습니다</div>
    )
  }

  return (
    <div className="space-y-0.5 max-h-40 overflow-y-auto">
      {tables.map((table) => {
        const isOpen = expanded === table
        return (
          <div key={table}>
            <button
              type="button"
              onClick={() => {
                setExpanded(isOpen ? null : table)
                onSelectTable?.(table)
              }}
              className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover transition-colors text-left group"
            >
              {isOpen ? (
                <ChevronDown className="w-3 h-3 text-text-muted flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
              )}
              <Table2 className="w-3 h-3 text-primary flex-shrink-0" />
              <span className="text-[12px] text-text-secondary group-hover:text-text-primary transition-colors truncate">
                {table}
              </span>
            </button>
            {isOpen && schemaData && (
              <div className="ml-6 mb-1 space-y-0.5">
                {schemaData.columns?.map((col: { name: string; type: string; primary_key?: boolean }) => (
                  <div
                    key={col.name}
                    className="flex items-center gap-1.5 px-2 py-0.5"
                  >
                    <Columns className="w-2.5 h-2.5 text-text-muted flex-shrink-0" />
                    <span className="text-[11px] font-mono text-text-secondary truncate">
                      {col.name}
                    </span>
                    <span className="text-[10px] text-text-muted ml-auto flex-shrink-0">
                      {col.type}
                    </span>
                    {col.primary_key && (
                      <span className="text-[9px] text-primary bg-primary/10 px-1 rounded">PK</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
