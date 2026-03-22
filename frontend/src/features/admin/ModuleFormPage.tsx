import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import { modulesApi, type ModuleCreate } from '../../api/modules'
import { useUIStore } from '../../stores/uiStore'

const MODULE_TYPES = ['trigger', 'action', 'data', 'transform', 'condition', 'merge']
const EXECUTOR_TYPES = ['python', 'http', 'sql', 'builtin']
const CATEGORIES = ['core', 'logic', 'database', 'http', 'slack', 'email', 'code', 'other']

const TYPE_META: Record<string, { color: string; icon: string }> = {
  trigger:   { color: '#22D3EE', icon: '⚡' },
  action:    { color: '#F59E0B', icon: '⚙' },
  data:      { color: '#818CF8', icon: '🗃' },
  transform: { color: '#10B981', icon: '⟳' },
  condition: { color: '#F472B6', icon: '◇' },
  merge:     { color: '#A78BFA', icon: '⊕' },
}

const PYTHON_TEMPLATE = `# Python 모듈 코드
# input_data: dict - 입력 데이터 (inputMapping으로 주입)
# 반환: dict - 다음 노드에 전달될 출력 데이터

import json

def main(input_data: dict) -> dict:
    # 예: result = input_data.get('value', 0) * 2
    result = input_data
    return {"result": result}
`

const HTTP_CONFIG_TEMPLATE = `{
  "method": "GET",
  "url": "{{url}}",
  "headers": {
    "Content-Type": "application/json"
  },
  "body_template": null
}`

const EMPTY_SCHEMA = `{
  "type": "object",
  "properties": {
    "example_field": {
      "type": "string",
      "title": "Example Field",
      "description": "An example input field"
    }
  },
  "required": []
}`

type TabKey = 'basic' | 'code' | 'schema' | 'test'

export function ModuleFormPage({ mode = 'create' }: { mode?: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const addNotification = useUIStore((s) => s.addNotification)

  const [activeTab, setActiveTab] = useState<TabKey>('basic')
  const [testInput, setTestInput] = useState('{}')
  const [testOutput, setTestOutput] = useState<string | null>(null)
  const [testRunning, setTestRunning] = useState(false)

  // Form state
  const [form, setForm] = useState<ModuleCreate>({
    name: '',
    description: '',
    module_type: 'action',
    executor_type: 'python',
    category: 'core',
    icon: '',
    color: '',
    version: '1.0.0',
    input_schema: JSON.parse(EMPTY_SCHEMA),
    output_schema: { type: 'object', properties: { result: { type: 'any' } } },
    config_schema: {},
    executor_config: { code: PYTHON_TEMPLATE },
    is_active: true,
  })

  // JSON editor states (string versions for Monaco)
  const [inputSchemaStr, setInputSchemaStr] = useState(EMPTY_SCHEMA)
  const [outputSchemaStr, setOutputSchemaStr] = useState(
    JSON.stringify({ type: 'object', properties: { result: { type: 'any' } } }, null, 2)
  )
  const [executorConfigStr, setExecutorConfigStr] = useState(
    JSON.stringify({ code: PYTHON_TEMPLATE }, null, 2)
  )

  // Fetch existing module for edit mode
  const { data: existingModule } = useQuery({
    queryKey: ['module', id],
    queryFn: () => modulesApi.get(id!).then((r) => r.data),
    enabled: mode === 'edit' && !!id,
  })

  useEffect(() => {
    if (existingModule) {
      setForm({
        name: existingModule.name,
        description: existingModule.description || '',
        module_type: existingModule.module_type,
        executor_type: existingModule.executor_type,
        category: existingModule.category || 'core',
        icon: existingModule.icon || '',
        color: existingModule.color || '',
        version: existingModule.version,
        input_schema: existingModule.input_schema || {},
        output_schema: existingModule.output_schema || {},
        config_schema: existingModule.config_schema || {},
        executor_config: existingModule.executor_config || {},
        is_active: existingModule.is_active ?? true,
      })
      setInputSchemaStr(JSON.stringify(existingModule.input_schema || {}, null, 2))
      setOutputSchemaStr(JSON.stringify(existingModule.output_schema || {}, null, 2))
      setExecutorConfigStr(JSON.stringify(existingModule.executor_config || {}, null, 2))
    }
  }, [existingModule])

  // Update executor config template when executor type changes
  useEffect(() => {
    if (mode === 'create') {
      const defaults: Record<string, string> = {
        python: JSON.stringify({ code: PYTHON_TEMPLATE }, null, 2),
        http:   HTTP_CONFIG_TEMPLATE,
        sql:    JSON.stringify({ datasource_id: '', query: 'SELECT 1' }, null, 2),
        builtin: JSON.stringify({ action: 'passthrough' }, null, 2),
      }
      setExecutorConfigStr(defaults[form.executor_type] || '{}')
    }
  }, [form.executor_type])

  const saveMut = useMutation({
    mutationFn: (data: ModuleCreate) =>
      mode === 'create'
        ? modulesApi.create(data)
        : modulesApi.update(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modules'] })
      addNotification({
        type: 'success',
        message: mode === 'create' ? '모듈이 생성되었습니다' : '모듈이 업데이트되었습니다',
      })
      navigate('/admin/modules')
    },
    onError: () =>
      addNotification({ type: 'error', message: '저장 실패. JSON 형식을 확인해주세요.' }),
  })

  const handleSave = () => {
    try {
      const finalForm = {
        ...form,
        input_schema: JSON.parse(inputSchemaStr),
        output_schema: JSON.parse(outputSchemaStr),
        executor_config: JSON.parse(executorConfigStr),
      }
      saveMut.mutate(finalForm)
    } catch {
      addNotification({ type: 'error', message: 'JSON 파싱 오류. 스키마/설정을 확인해주세요.' })
    }
  }

  const handleTest = async () => {
    if (!id) return
    setTestRunning(true)
    setTestOutput(null)
    try {
      const inputData = JSON.parse(testInput)
      const res = await modulesApi.test(id, inputData)
      setTestOutput(JSON.stringify(res.data, null, 2))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setTestOutput(`Error: ${err.response?.data?.detail || '실행 실패'}`)
    } finally {
      setTestRunning(false)
    }
  }

  const typeMeta = TYPE_META[form.module_type] || TYPE_META.action

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'basic',  label: '기본 정보' },
    { key: 'code',   label: '실행 설정' },
    { key: 'schema', label: '스키마'    },
    { key: 'test',   label: '테스트'    },
  ]

  return (
    <div className="min-h-screen p-8" style={{ background: '#080B12' }}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/modules')}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
            style={{ color: '#484F58', border: '1px solid rgba(255,255,255,0.06)' }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#848D97'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#484F58'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1
              className="text-xl font-bold text-white/90"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}
            >
              {mode === 'create' ? '새 모듈 생성' : '모듈 편집'}
            </h1>
            <p className="text-[11px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
              {form.name || '모듈 이름 없음'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/modules')}
            className="h-9 px-4 rounded-xl text-[12px] transition-all border border-white/10 text-white/40 hover:bg-white/5"
            style={{ fontFamily: "'Barlow', sans-serif" }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="h-9 px-5 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-50"
            style={{
              background: `${typeMeta.color}20`,
              border: `1px solid ${typeMeta.color}40`,
              color: typeMeta.color,
              fontFamily: "'Barlow', sans-serif",
            }}
          >
            {saveMut.isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/5 pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2.5 text-[12px] font-medium transition-all -mb-px"
            style={{
              color: activeTab === tab.key ? typeMeta.color : '#484F58',
              borderBottom: activeTab === tab.key ? `2px solid ${typeMeta.color}` : '2px solid transparent',
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: '0.05em',
            }}
          >
            {tab.label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Basic info tab */}
      {activeTab === 'basic' && (
        <div
          className="rounded-2xl border border-white/5 p-6"
          style={{ background: '#0D1117' }}
        >
          <div className="grid grid-cols-2 gap-6">
            {/* Name */}
            <FormField label="모듈 이름" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="예: HTTP Request"
                className="field-input"
              />
            </FormField>

            {/* Version */}
            <FormField label="버전">
              <input
                type="text"
                value={form.version}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                placeholder="1.0.0"
                className="field-input"
              />
            </FormField>

            {/* Description */}
            <div className="col-span-2">
              <FormField label="설명">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="모듈 설명"
                  className="field-input resize-none"
                />
              </FormField>
            </div>

            {/* Module type */}
            <FormField label="모듈 타입" required>
              <div className="flex flex-wrap gap-2">
                {MODULE_TYPES.map((t) => {
                  const meta = TYPE_META[t]
                  const isActive = form.module_type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, module_type: t }))}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-all"
                      style={{
                        background: isActive ? `${meta.color}15` : 'rgba(255,255,255,0.03)',
                        border: isActive ? `1px solid ${meta.color}40` : '1px solid rgba(255,255,255,0.05)',
                        color: isActive ? meta.color : '#484F58',
                        fontFamily: "'Barlow', sans-serif",
                      }}
                    >
                      <span>{meta.icon}</span>
                      {t}
                    </button>
                  )
                })}
              </div>
            </FormField>

            {/* Executor type */}
            <FormField label="실행기 타입" required>
              <div className="flex flex-wrap gap-2">
                {EXECUTOR_TYPES.map((t) => {
                  const colors: Record<string, string> = {
                    python: '#22C55E', http: '#38BDF8', sql: '#FB923C', builtin: '#818CF8'
                  }
                  const c = colors[t] || '#848D97'
                  const isActive = form.executor_type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, executor_type: t }))}
                      className="px-3 py-1.5 rounded-lg text-[12px] transition-all"
                      style={{
                        background: isActive ? `${c}15` : 'rgba(255,255,255,0.03)',
                        border: isActive ? `1px solid ${c}40` : '1px solid rgba(255,255,255,0.05)',
                        color: isActive ? c : '#484F58',
                        fontFamily: "'Barlow', sans-serif",
                      }}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            </FormField>

            {/* Category */}
            <FormField label="카테고리">
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="field-input"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>

            {/* Icon & Color */}
            <FormField label="아이콘 (이모지)">
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="예: 🌐"
                className="field-input"
              />
            </FormField>
          </div>
        </div>
      )}

      {/* Code / executor config tab */}
      {activeTab === 'code' && (
        <div
          className="rounded-2xl border border-white/5 overflow-hidden"
          style={{ background: '#0D1117' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: '#484F58', fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              executor_config JSON
            </span>
            <span className="text-[10px]" style={{ color: '#484F58', fontFamily: "'JetBrains Mono', monospace" }}>
              {form.executor_type}
            </span>
          </div>
          <div style={{ height: 500 }}>
            <Editor
              language="json"
              value={executorConfigStr}
              onChange={(v) => setExecutorConfigStr(v || '{}')}
              theme="vs-dark"
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                padding: { top: 16, bottom: 16 },
              }}
            />
          </div>
          {form.executor_type === 'python' && (
            <div className="px-4 py-3 border-t border-white/5">
              <p className="text-[10px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
                💡 <code className="text-[10px]" style={{ color: '#22D3EE', fontFamily: "'JetBrains Mono', monospace" }}>{"executor_config.code"}</code>에 Python 코드를 작성하세요.
                입력은 <code style={{ color: '#22D3EE', fontFamily: "'JetBrains Mono', monospace" }}>input_data</code> 변수로 주입됩니다.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Schema tab */}
      {activeTab === 'schema' && (
        <div className="grid grid-cols-2 gap-4">
          {/* Input schema */}
          <div
            className="rounded-2xl border border-white/5 overflow-hidden"
            style={{ background: '#0D1117' }}
          >
            <div className="px-4 py-3 border-b border-white/5">
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: '#818CF8', fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                Input Schema
              </span>
            </div>
            <div style={{ height: 420 }}>
              <Editor
                language="json"
                value={inputSchemaStr}
                onChange={(v) => setInputSchemaStr(v || '{}')}
                theme="vs-dark"
                options={{
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                }}
              />
            </div>
          </div>

          {/* Output schema */}
          <div
            className="rounded-2xl border border-white/5 overflow-hidden"
            style={{ background: '#0D1117' }}
          >
            <div className="px-4 py-3 border-b border-white/5">
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: '#10B981', fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                Output Schema
              </span>
            </div>
            <div style={{ height: 420 }}>
              <Editor
                language="json"
                value={outputSchemaStr}
                onChange={(v) => setOutputSchemaStr(v || '{}')}
                theme="vs-dark"
                options={{
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Test tab */}
      {activeTab === 'test' && (
        <div className="grid grid-cols-2 gap-4">
          {/* Input */}
          <div
            className="rounded-2xl border border-white/5 overflow-hidden"
            style={{ background: '#0D1117' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: '#484F58', fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                테스트 입력 (JSON)
              </span>
              <button
                type="button"
                onClick={handleTest}
                disabled={!id || testRunning}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40"
                style={{
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  color: '#10B981',
                  fontFamily: "'Barlow', sans-serif",
                }}
              >
                {testRunning ? (
                  <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={2} strokeDasharray="40" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
                실행
              </button>
            </div>
            <div style={{ height: 420 }}>
              <Editor
                language="json"
                value={testInput}
                onChange={(v) => setTestInput(v || '{}')}
                theme="vs-dark"
                options={{
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                }}
              />
            </div>
            {!id && (
              <div className="px-4 py-3 border-t border-white/5">
                <p className="text-[10px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
                  ⚠ 먼저 모듈을 저장한 후 테스트할 수 있습니다
                </p>
              </div>
            )}
          </div>

          {/* Output */}
          <div
            className="rounded-2xl border border-white/5 overflow-hidden"
            style={{ background: '#0D1117' }}
          >
            <div className="px-4 py-3 border-b border-white/5">
              <span
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: '#484F58', fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                실행 결과
              </span>
            </div>
            <div style={{ height: 420 }}>
              {testOutput ? (
                <Editor
                  language="json"
                  value={testOutput}
                  theme="vs-dark"
                  options={{
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    minimap: { enabled: false },
                    readOnly: true,
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-[12px]" style={{ color: '#484F58', fontFamily: "'Barlow', sans-serif" }}>
                    {testRunning ? '실행 중...' : '실행 버튼을 누르면 결과가 표시됩니다'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global styles for form fields */}
      <style>{`
        .field-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 13px;
          color: rgba(255,255,255,0.75);
          outline: none;
          transition: border-color 0.2s;
          font-family: 'Barlow', sans-serif;
        }
        .field-input:focus {
          border-color: rgba(129,140,248,0.4);
        }
        .field-input option {
          background: #0D1117;
        }
      `}</style>
    </div>
  )
}

function FormField({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        className="block text-[10px] font-bold uppercase tracking-widest mb-2"
        style={{ color: '#484F58', fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}
