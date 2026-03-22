import { Save, Key, FileOutput } from 'lucide-react'
import { DataSourceSelect } from './DataSourceSelect'

export interface OutputConfig {
  save_output?: boolean
  output_datasource_id?: string | null
  output_table?: string
  output_write_mode?: 'append' | 'replace' | 'upsert'
  output_upsert_key?: string
  output_format?: 'jsonl' | 'csv'
}

interface OutputConfigSectionProps {
  config: OutputConfig
  onChange: (updates: Partial<OutputConfig>) => void
}

const WRITE_MODES = [
  { value: 'append',  label: 'Append',  desc: '기존 데이터에 추가' },
  { value: 'replace', label: 'Replace', desc: '전체 교체' },
  { value: 'upsert',  label: 'Upsert',  desc: '키 기준 업데이트/삽입' },
]

const OUTPUT_FORMATS = [
  { value: 'jsonl', label: 'JSONL', desc: 'JSON Lines (기본)' },
  { value: 'csv',   label: 'CSV',   desc: 'Comma-Separated Values' },
]

export function OutputConfigSection({ config, onChange }: OutputConfigSectionProps) {
  const enabled = config.save_output ?? false
  const writeMode = config.output_write_mode ?? 'append'

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

          {/* Write mode — card-style selector */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
              저장 방식
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {WRITE_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onChange({ output_write_mode: m.value as OutputConfig['output_write_mode'] })}
                  className={`
                    flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border text-center transition-all
                    ${writeMode === m.value
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'bg-bg-tertiary border-border text-text-muted hover:text-text-secondary hover:border-border-light'}
                  `}
                >
                  <span className="text-[11px] font-bold">{m.label}</span>
                  <span className="text-[9px] opacity-70 leading-tight">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Upsert key — only shown when write_mode is 'upsert' */}
          {writeMode === 'upsert' && (
            <div>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-text-muted mb-1">
                <Key className="w-3 h-3" />
                Upsert 키
              </label>
              <input
                type="text"
                value={config.output_upsert_key ?? ''}
                onChange={(e) => onChange({ output_upsert_key: e.target.value })}
                placeholder="예: id 또는 email"
                className="w-full bg-bg-tertiary rounded-lg px-3 py-1.5 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors font-mono"
              />
              <p className="mt-1 text-[10px] text-text-muted">
                이 컬럼 값을 기준으로 기존 행을 업데이트하거나 새 행을 삽입합니다
              </p>
            </div>
          )}

          {/* Output format */}
          <div>
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
              <FileOutput className="w-3 h-3" />
              출력 형식
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {OUTPUT_FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => onChange({ output_format: f.value as OutputConfig['output_format'] })}
                  className={`
                    flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border text-center transition-all
                    ${(config.output_format ?? 'jsonl') === f.value
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'bg-bg-tertiary border-border text-text-muted hover:text-text-secondary hover:border-border-light'}
                  `}
                >
                  <span className="text-[11px] font-bold font-mono">{f.label}</span>
                  <span className="text-[9px] opacity-70 leading-tight">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
