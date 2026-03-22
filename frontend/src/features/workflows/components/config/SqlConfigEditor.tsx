import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Play, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import MonacoEditor from '@monaco-editor/react'
import { DataSourceSelect } from './DataSourceSelect'
import { TableBrowser } from './TableBrowser'
import { datasourceWorkflowApi } from '../../../../api/workflows'

export interface SqlConfig {
  datasource_id?: string | null
  query?: string
}

interface SqlConfigEditorProps {
  config: SqlConfig
  onChange: (updates: Partial<SqlConfig>) => void
  defaultQuery?: string
}

const DEFAULT_QUERY = '-- 실행할 SQL 쿼리를 작성하세요\nSELECT * FROM table_name LIMIT 100'

export function SqlConfigEditor({ config, onChange, defaultQuery }: SqlConfigEditorProps) {
  const [showTables, setShowTables] = useState(false)
  const [previewResult, setPreviewResult] = useState<{
    rows: Record<string, unknown>[]
    columns: string[]
    count: number
  } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const previewMut = useMutation({
    mutationFn: () =>
      datasourceWorkflowApi
        .queryPreview(config.datasource_id!, config.query || defaultQuery || DEFAULT_QUERY)
        .then((r) => r.data),
    onSuccess: (data) => {
      setPreviewResult(data)
      setPreviewError(null)
    },
    onError: (err: Error) => {
      setPreviewError(err.message)
      setPreviewResult(null)
    },
  })

  return (
    <div className="space-y-3">
      {/* Datasource */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
          데이터소스 <span className="text-danger">*</span>
        </label>
        <DataSourceSelect
          value={config.datasource_id ?? null}
          onChange={(id) => onChange({ datasource_id: id })}
        />
      </div>

      {/* Table browser toggle */}
      {config.datasource_id && (
        <div>
          <button
            type="button"
            onClick={() => setShowTables((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary transition-colors mb-1.5"
          >
            {showTables ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span className="font-semibold uppercase tracking-wider">테이블 브라우저</span>
          </button>
          {showTables && (
            <div className="bg-bg-tertiary rounded-lg p-2 border border-border">
              <TableBrowser
                datasourceId={config.datasource_id}
                onSelectTable={(table) =>
                  onChange({ query: `SELECT * FROM ${table} LIMIT 100` })
                }
              />
            </div>
          )}
        </div>
      )}

      {/* SQL Editor */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
          SQL 쿼리 <span className="text-danger">*</span>
        </label>
        <div className="rounded-lg overflow-hidden border border-border">
          <MonacoEditor
            height="180px"
            language="sql"
            theme="vs-dark"
            value={config.query ?? defaultQuery ?? DEFAULT_QUERY}
            onChange={(v) => onChange({ query: v ?? '' })}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 8, bottom: 8 },
              wordWrap: 'on',
            }}
          />
        </div>
        <p className="mt-1 text-[10px] text-text-muted">
          미리보기는 LIMIT 50이 자동 적용됩니다
        </p>
      </div>

      {/* Preview button */}
      <button
        type="button"
        disabled={!config.datasource_id || previewMut.isPending}
        onClick={() => previewMut.mutate()}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary/8 text-primary border border-primary/30 hover:bg-primary/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Play className="w-3 h-3" />
        {previewMut.isPending ? '실행 중...' : '미리보기 실행'}
      </button>

      {/* Preview error */}
      {previewError && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-danger/5 border border-danger/20">
          <AlertCircle className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" />
          <span className="text-[11px] text-danger font-mono">{previewError}</span>
        </div>
      )}

      {/* Preview results */}
      {previewResult && previewResult.rows.length > 0 && (
        <div>
          <div className="text-[10px] text-text-muted mb-1">
            {previewResult.count}행 반환 (최대 50행)
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-bg-hover border-b border-border">
                  {previewResult.columns.map((col) => (
                    <th
                      key={col}
                      className="px-2 py-1 text-left font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewResult.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg-hover/50">
                    {previewResult.columns.map((col) => (
                      <td
                        key={col}
                        className="px-2 py-1 text-text-secondary font-mono whitespace-nowrap max-w-[120px] truncate"
                      >
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {previewResult.rows.length > 5 && (
              <div className="px-2 py-1 text-[10px] text-text-muted border-t border-border">
                +{previewResult.rows.length - 5}행 더 있음
              </div>
            )}
          </div>
        </div>
      )}

      {previewResult && previewResult.rows.length === 0 && (
        <div className="text-[11px] text-text-muted text-center py-2">
          결과가 없습니다 (0행)
        </div>
      )}
    </div>
  )
}
