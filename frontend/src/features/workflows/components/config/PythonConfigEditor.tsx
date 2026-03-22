import { useState } from 'react'
import { RotateCcw, Info } from 'lucide-react'
import MonacoEditor from '@monaco-editor/react'

interface PythonConfigEditorProps {
  code: string
  onChange: (code: string) => void
  defaultCode?: string
}

const STARTER_CODE = `# input_data 딕셔너리로 이전 노드의 출력에 접근합니다
# 예: rows = input_data.get('rows', [])

result = {
    'processed': True,
    'input_keys': list(input_data.keys()),
}

print('__OUTPUT__:' + __json.dumps(result))
`

export function PythonConfigEditor({ code, onChange, defaultCode }: PythonConfigEditorProps) {
  const [showHelp, setShowHelp] = useState(false)

  const effectiveCode = code || defaultCode || STARTER_CODE

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Python 코드
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors rounded"
            title="도움말"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
          {defaultCode && code !== defaultCode && (
            <button
              type="button"
              onClick={() => onChange(defaultCode)}
              className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors rounded"
              title="모듈 기본 코드로 초기화"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div className="bg-bg-tertiary rounded-lg p-3 border border-border text-[11px] text-text-muted space-y-1">
          <div>
            <span className="font-mono text-text-secondary">input_data</span> — 이전 노드의 출력 딕셔너리
          </div>
          <div>
            <span className="font-mono text-text-secondary">__json</span> — json 모듈 (import 불필요)
          </div>
          <div>
            출력: <span className="font-mono text-text-secondary">print('__OUTPUT__:' + __json.dumps(result))</span>
          </div>
          <div className="pt-1 border-t border-border">
            결과는 반드시 <code className="bg-bg-hover px-1 rounded">__OUTPUT__:</code> 접두사로 출력하세요
          </div>
        </div>
      )}

      {/* Monaco editor */}
      <div className="rounded-lg overflow-hidden border border-border">
        <MonacoEditor
          height="240px"
          language="python"
          theme="vs-dark"
          value={effectiveCode}
          onChange={(v) => onChange(v ?? '')}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            wordWrap: 'on',
            tabSize: 4,
          }}
        />
      </div>
    </div>
  )
}
