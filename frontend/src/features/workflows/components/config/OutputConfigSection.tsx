import { Save } from 'lucide-react'
import { DataSourceSelect } from './DataSourceSelect'

export interface OutputConfig {
  save_output?: boolean
  output_datasource_id?: string | null
  output_table?: string
  output_write_mode?: 'append' | 'replace' | 'upsert'
}

interface OutputConfigSectionProps {
  config: OutputConfig
  onChange: (updates: Partial<OutputConfig>) => void
}

const WRITE_MODES = [
  { value: 'append', label: 'Append — 기존 데이터에 추가' },
  { value: 'replace', label: 'Replace — 전체 교체' },
  { value: 'upsert', label: 'Upsert — 키 기준 업데이트' },
]

export function OutputConfigSection({ config, onChange }: OutputConfigSectionProps) {
  const enabled = config.save_output ?? false

  return (
    <div className="border-t border-border pt-4 mt-2">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => onChange({ save_output: !enabled })}
        className="w-full flex items-center gap-2 mb-3 group"
      >
        <div
          className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 relative ${
            enabled ? 'bg-primary' : 'bg-bg-hover border border-border'
          }`}
        >
          <div
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Save className="w-3 h-3 text-text-muted" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted group-hover:text-text-secondary transition-colors">
            실행 결과 DB 저장
          </span>
        </div>
      </button>

      {enabled && (
        <div className="space-y-3 pl-1">
          {/* Datasource */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-text-muted mb-1">
              데이터소스
            </label>
            <DataSourceSelect
              value={config.output_datasource_id ?? null}
              onChange={(id) => onChange({ output_datasource_id: id })}
              placeholder="저장할 데이터소스 선택..."
            />
          </div>

          {/* Table name */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-text-muted mb-1">
              테이블명
            </label>
            <input
              type="text"
              value={config.output_table ?? ''}
              onChange={(e) => onChange({ output_table: e.target.value })}
              placeholder="예: workflow_output"
              className="w-full bg-bg-tertiary rounded-lg px-3 py-1.5 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors font-mono"
            />
            <p className="mt-1 text-[10px] text-text-muted">
              테이블이 없으면 자동으로 생성됩니다
            </p>
          </div>

          {/* Write mode */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-text-muted mb-1">
              저장 방식
            </label>
            <select
              value={config.output_write_mode ?? 'append'}
              onChange={(e) =>
                onChange({ output_write_mode: e.target.value as OutputConfig['output_write_mode'] })
              }
              className="w-full appearance-none bg-bg-tertiary rounded-lg px-3 py-1.5 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors"
            >
              {WRITE_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
