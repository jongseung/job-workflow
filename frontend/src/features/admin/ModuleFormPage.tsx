import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import { ArrowLeft, Play, Loader2, Info } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button, Input, Card } from '@/components/ui'
import { modulesApi, type ModuleCreate } from '../../api/modules'
import { NODE_TYPE_META } from '../workflows/components/nodes/WorkflowNode'
import { useUIStore } from '../../stores/uiStore'

const MODULE_TYPES = ['trigger', 'action', 'data', 'transform', 'condition', 'merge']
const EXECUTOR_TYPES = ['python', 'http', 'sql', 'builtin']
const CATEGORIES = ['core', 'logic', 'database', 'http', 'slack', 'email', 'code', 'other']

const EXECUTOR_COLORS: Record<string, string> = {
  python:  '#22C55E',
  http:    '#38BDF8',
  sql:     '#FB923C',
  builtin: '#818CF8',
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

  const [inputSchemaStr, setInputSchemaStr] = useState(EMPTY_SCHEMA)
  const [outputSchemaStr, setOutputSchemaStr] = useState(
    JSON.stringify({ type: 'object', properties: { result: { type: 'any' } } }, null, 2)
  )
  const [executorConfigStr, setExecutorConfigStr] = useState(
    JSON.stringify({ code: PYTHON_TEMPLATE }, null, 2)
  )

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

  useEffect(() => {
    if (mode === 'create') {
      const defaults: Record<string, string> = {
        python:  JSON.stringify({ code: PYTHON_TEMPLATE }, null, 2),
        http:    HTTP_CONFIG_TEMPLATE,
        sql:     JSON.stringify({ datasource_id: '', query: 'SELECT 1' }, null, 2),
        builtin: JSON.stringify({ action: 'passthrough' }, null, 2),
      }
      setExecutorConfigStr(defaults[form.executor_type] || '{}')
    }
  }, [form.executor_type])

  const saveMut = useMutation({
    mutationFn: (data: ModuleCreate) =>
      mode === 'create' ? modulesApi.create(data) : modulesApi.update(id!, data),
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

  const typeMeta = NODE_TYPE_META[form.module_type] || NODE_TYPE_META.action
  const { Icon: TypeIcon } = typeMeta

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'basic',  label: '기본 정보' },
    { key: 'code',   label: '실행 설정' },
    { key: 'schema', label: '스키마'    },
    { key: 'test',   label: '테스트'    },
  ]

  return (
    <div>
      <Header title={mode === 'create' ? '새 모듈 생성' : '모듈 편집'} />
      <div className="p-8">
        {/* Back + actions bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/modules')}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover border border-border transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-xs text-text-muted">{form.name || '모듈 이름 없음'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/admin/modules')}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className="px-4 py-2.5 text-xs font-medium tracking-wide transition-all -mb-px border-b-2 uppercase"
              style={{
                color: activeTab === tab.key ? typeMeta.color : undefined,
                borderColor: activeTab === tab.key ? typeMeta.color : 'transparent',
              }}
              {...(activeTab !== tab.key && { className: 'px-4 py-2.5 text-xs font-medium tracking-wide transition-all -mb-px border-b-2 uppercase text-text-muted hover:text-text-secondary border-transparent' })}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Basic info tab */}
        {activeTab === 'basic' && (
          <Card padding="md">
            <div className="grid grid-cols-2 gap-6">
              {/* Name */}
              <FormField label="모듈 이름" required>
                <Input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="예: HTTP Request"
                />
              </FormField>

              {/* Version */}
              <FormField label="버전">
                <Input
                  type="text"
                  value={form.version}
                  onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                  placeholder="1.0.0"
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
                    className="w-full bg-bg-tertiary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50 transition-colors resize-none"
                  />
                </FormField>
              </div>

              {/* Module type */}
              <FormField label="모듈 타입" required>
                <div className="flex flex-wrap gap-2">
                  {MODULE_TYPES.map((t) => {
                    const meta = NODE_TYPE_META[t] || NODE_TYPE_META.action
                    const { Icon } = meta
                    const isActive = form.module_type === t
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, module_type: t }))}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all"
                        style={{
                          background: isActive ? `${meta.color}15` : undefined,
                          borderColor: isActive ? `${meta.color}40` : undefined,
                          color: isActive ? meta.color : undefined,
                        }}
                        {...(!isActive && { className: 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-text-muted hover:text-text-secondary transition-all' })}
                      >
                        <Icon size={12} style={isActive ? { color: meta.color } : undefined} />
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
                    const c = EXECUTOR_COLORS[t] || '#848D97'
                    const isActive = form.executor_type === t
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, executor_type: t }))}
                        className="px-3 py-1.5 rounded-lg text-xs border transition-all"
                        style={{
                          background: isActive ? `${c}15` : undefined,
                          borderColor: isActive ? `${c}40` : undefined,
                          color: isActive ? c : undefined,
                        }}
                        {...(!isActive && { className: 'px-3 py-1.5 rounded-lg text-xs border border-border text-text-muted hover:text-text-secondary transition-all' })}
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
                  className="w-full bg-bg-tertiary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary/50 transition-colors"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-bg-card">
                      {c}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* Icon */}
              <FormField label="아이콘 (선택)">
                <Input
                  type="text"
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  placeholder="예: 🌐 또는 생략"
                />
              </FormField>
            </div>
          </Card>
        )}

        {/* Code / executor config tab */}
        {activeTab === 'code' && (
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                executor_config JSON
              </span>
              <span className="text-xs font-mono text-text-muted">{form.executor_type}</span>
            </div>
            <div style={{ height: 500 }}>
              <Editor
                language="json"
                value={executorConfigStr}
                onChange={(v) => setExecutorConfigStr(v || '{}')}
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  padding: { top: 16, bottom: 16 },
                }}
              />
            </div>
            {form.executor_type === 'python' && (
              <div className="px-4 py-3 border-t border-border flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-text-muted mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-text-muted">
                  <code className="font-mono text-primary">executor_config.code</code>에 Python 코드를 작성하세요.
                  입력은 <code className="font-mono text-info">input_data</code> 변수로 주입됩니다.
                </p>
              </div>
            )}
          </Card>
        )}

        {/* Schema tab */}
        {activeTab === 'schema' && (
          <div className="grid grid-cols-2 gap-4">
            <Card padding="none" className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
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
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                  }}
                />
              </div>
            </Card>

            <Card padding="none" className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <span className="text-xs font-bold uppercase tracking-wider text-success">
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
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                  }}
                />
              </div>
            </Card>
          </div>
        )}

        {/* Test tab */}
        {activeTab === 'test' && (
          <div className="grid grid-cols-2 gap-4">
            <Card padding="none" className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  테스트 입력 (JSON)
                </span>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={!id || testRunning}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold border border-success/30 bg-success/10 text-success hover:bg-success/20 transition-all disabled:opacity-40"
                >
                  {testRunning ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
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
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                  }}
                />
              </div>
              {!id && (
                <div className="px-4 py-3 border-t border-border flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                  <p className="text-[10px] text-text-muted">
                    먼저 모듈을 저장한 후 테스트할 수 있습니다
                  </p>
                </div>
              )}
            </Card>

            <Card padding="none" className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
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
                      minimap: { enabled: false },
                      readOnly: true,
                      scrollBeyondLastLine: false,
                      padding: { top: 12 },
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-sm text-text-muted">
                      {testRunning ? '실행 중...' : '실행 버튼을 누르면 결과가 표시됩니다'}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}
