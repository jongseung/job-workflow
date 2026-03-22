import MonacoEditor from '@monaco-editor/react'
import { Globe } from 'lucide-react'
import { KeyValueEditor } from './KeyValueEditor'

export interface HttpConfig {
  url?: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body_template?: string
}

interface HttpConfigEditorProps {
  config: HttpConfig
  onChange: (updates: Partial<HttpConfig>) => void
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-[#22C55E]',
  POST: 'text-primary',
  PUT: 'text-[#F59E0B]',
  DELETE: 'text-danger',
  PATCH: 'text-[#A78BFA]',
}

export function HttpConfigEditor({ config, onChange }: HttpConfigEditorProps) {
  const method = config.method ?? 'POST'

  return (
    <div className="space-y-3">
      {/* Method + URL */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
          요청 <span className="text-danger">*</span>
        </label>
        <div className="flex gap-2">
          <select
            value={method}
            onChange={(e) => onChange({ method: e.target.value as HttpConfig['method'] })}
            className={`appearance-none bg-bg-tertiary rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase outline-none border border-border focus:border-primary/50 transition-colors flex-shrink-0 ${METHOD_COLORS[method] ?? 'text-text-primary'}`}
          >
            {METHODS.map((m) => (
              <option key={m} value={m} className="text-text-primary">
                {m}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-0">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={config.url ?? ''}
              onChange={(e) => onChange({ url: e.target.value })}
              placeholder="https://api.example.com/endpoint"
              className="w-full bg-bg-tertiary rounded-lg pl-9 pr-3 py-1.5 text-[12px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors"
            />
          </div>
        </div>
        <p className="mt-1 text-[10px] text-text-muted">
          URL에서 <code className="font-mono bg-bg-hover px-1 rounded">{'{field}'}</code> 형식으로 이전 노드 출력 참조 가능
        </p>
      </div>

      {/* Headers */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
          헤더
        </label>
        <KeyValueEditor
          value={config.headers ?? {}}
          onChange={(v) => onChange({ headers: v })}
          keyPlaceholder="Authorization"
          valuePlaceholder="Bearer token..."
        />
      </div>

      {/* Body (POST/PUT/PATCH only) */}
      {['POST', 'PUT', 'PATCH'].includes(method) && (
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            요청 바디 (JSON)
          </label>
          <div className="rounded-lg overflow-hidden border border-border">
            <MonacoEditor
              height="140px"
              language="json"
              theme="vs-dark"
              value={
                typeof config.body_template === 'string'
                  ? config.body_template
                  : config.body_template
                  ? JSON.stringify(config.body_template, null, 2)
                  : ''
              }
              onChange={(v) => onChange({ body_template: v ?? '' })}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'off',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-text-muted">
            비워두면 이전 노드의 전체 출력이 바디로 사용됩니다
          </p>
        </div>
      )}
    </div>
  )
}
