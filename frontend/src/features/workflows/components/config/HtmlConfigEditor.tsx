import { useState } from 'react'
import { RotateCcw, Info, Eye, Code2 } from 'lucide-react'
import MonacoEditor from '@monaco-editor/react'

interface HtmlConfigEditorProps {
  template: string
  title: string
  onChange: (updates: Record<string, unknown>) => void
  defaultTemplate?: string
}

const STARTER_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{{ title or "Report" }}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f8fafc; color: #1e293b; padding: 32px; }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 24px; }
    .card { background: white; border-radius: 12px; padding: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 16px; }
    .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px;
               padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 10px 12px; background: #f1f5f9;
         font-size: 12px; font-weight: 600; color: #475569;
         text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    tr:hover td { background: #f8fafc; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
    .stat { background: white; border-radius: 12px; padding: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat-value { font-size: 28px; font-weight: 700; color: #0f172a; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 4px;
                  text-transform: uppercase; letter-spacing: 0.05em; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px;
             font-size: 12px; font-weight: 500; }
    .badge-green { background: #dcfce7; color: #16a34a; }
    .badge-red { background: #fee2e2; color: #dc2626; }
    .badge-blue { background: #dbeafe; color: #2563eb; }
    .badge-yellow { background: #fef9c3; color: #ca8a04; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px;
              margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>{{ title or "Report" }}</h1>
    <p class="subtitle">Generated from workflow data</p>

    {% if rows is defined %}
    <div class="card">
      <h2>Data ({{ rows|length }} rows)</h2>
      {% if rows|length > 0 %}
      <table>
        <thead>
          <tr>
            {% for key in rows[0].keys() %}
            <th>{{ key }}</th>
            {% endfor %}
          </tr>
        </thead>
        <tbody>
          {% for row in rows %}
          <tr>
            {% for val in row.values() %}
            <td>{{ val }}</td>
            {% endfor %}
          </tr>
          {% endfor %}
        </tbody>
      </table>
      {% endif %}
    </div>
    {% endif %}

    <div class="footer">
      Auto-generated report &middot; {{ now or "" }}
    </div>
  </div>
</body>
</html>`

export function HtmlConfigEditor({ template, title, onChange, defaultTemplate }: HtmlConfigEditorProps) {
  const [showHelp, setShowHelp] = useState(false)
  const [mode, setMode] = useState<'code' | 'preview'>('code')

  const effectiveTemplate = template || defaultTemplate || STARTER_TEMPLATE

  return (
    <div className="space-y-2">
      {/* Title input */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
          리포트 제목
        </label>
        <input
          type="text"
          value={title || ''}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Report Title"
          className="w-full bg-bg-tertiary rounded-lg px-3 py-1.5 text-[13px] text-text-primary outline-none border border-border focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          HTML 템플릿
        </label>
        <div className="flex items-center gap-1">
          {/* Toggle code/preview */}
          <button
            type="button"
            onClick={() => setMode(mode === 'code' ? 'preview' : 'code')}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
              mode === 'preview'
                ? 'text-emerald-400 bg-emerald-400/10'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            title={mode === 'code' ? '미리보기' : '코드 편집'}
          >
            {mode === 'code' ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors rounded"
            title="도움말"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
          {defaultTemplate && template !== defaultTemplate && (
            <button
              type="button"
              onClick={() => onChange({ template: defaultTemplate })}
              className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors rounded"
              title="기본 템플릿으로 초기화"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div className="bg-bg-tertiary rounded-lg p-3 border border-border text-[11px] text-text-muted space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
            Jinja2 템플릿 문법
          </div>
          <div>
            <span className="font-mono text-text-secondary">{'{{ variable }}'}</span> — 변수 출력
          </div>
          <div>
            <span className="font-mono text-text-secondary">{'{% for item in rows %}'}</span> — 반복문
          </div>
          <div>
            <span className="font-mono text-text-secondary">{'{% if condition %}'}</span> — 조건문
          </div>
          <div>
            <span className="font-mono text-text-secondary">{'{{ value|number(2) }}'}</span> — 숫자 포맷 (소수점 2자리)
          </div>
          <div>
            <span className="font-mono text-text-secondary">{'{{ value|percent }}'}</span> — 퍼센트 포맷
          </div>
          <div className="pt-1.5 border-t border-border">
            이전 노드 출력이 <code className="bg-bg-hover px-1 rounded">data</code> 와 개별 키로 접근 가능합니다.
            <br />
            예: SQL 출력 → <code className="bg-bg-hover px-1 rounded">rows</code>, <code className="bg-bg-hover px-1 rounded">count</code>
          </div>
        </div>
      )}

      {/* Code editor or Preview */}
      {mode === 'code' ? (
        <div className="rounded-lg overflow-hidden border border-border">
          <MonacoEditor
            height="320px"
            language="html"
            theme="vs-dark"
            value={effectiveTemplate}
            onChange={(v) => onChange({ template: v ?? '' })}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 8, bottom: 8 },
              wordWrap: 'on',
              tabSize: 2,
            }}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden bg-white">
          <iframe
            srcDoc={effectiveTemplate}
            title="HTML Preview"
            className="w-full border-0"
            style={{ height: 320 }}
            sandbox="allow-same-origin"
          />
        </div>
      )}
    </div>
  )
}
