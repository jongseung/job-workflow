import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Upload, Database, ExternalLink, Table2, CheckCircle2, XCircle, AlertTriangle, Copy, Info } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { createJob, uploadJobFile } from '@/api/jobs';
import { analyzeCode } from '@/api/analysis';
import { getDataSources, getDataSourceTables, getTableSchema } from '@/api/datasources';
import type { AnalysisResult, TableSchema } from '@/types/api';
import { cn } from '@/lib/utils';
import { lazy, Suspense } from 'react';
import { Button, Card, CardHeader, Input, Textarea, FormField, TabList, TabTrigger, TabContent } from '@/components/ui';
import { Select } from '@/components/ui/Input';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

export function JobCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('# Write your Python code here\nprint("Hello, World!")\n');
  const [scheduleType, setScheduleType] = useState('manual');
  const [cronExpression, setCronExpression] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState('');
  const [maxRetries, setMaxRetries] = useState('0');
  const [timeoutSeconds, setTimeoutSeconds] = useState('3600');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<'code' | 'schedule' | 'datasource' | 'advanced' | 'analysis'>('code');
  const [datasourceId, setDatasourceId] = useState<string>('');
  const [saveToDataSource, setSaveToDataSource] = useState(false);
  const [targetTable, setTargetTable] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState<'jsonl' | 'csv'>('jsonl');
  const [notifyWebhookUrl, setNotifyWebhookUrl] = useState('');
  const [notifyOn, setNotifyOn] = useState<'success' | 'failure' | 'both' | 'none'>('failure');
  const [priority, setPriority] = useState('5');
  const [requirements, setRequirements] = useState('');
  const [maxConcurrent, setMaxConcurrent] = useState('1');
  const [writeMode, setWriteMode] = useState<'append' | 'replace' | 'upsert'>('append');
  const [upsertKey, setUpsertKey] = useState('');

  const { data: datasources = [] } = useQuery({
    queryKey: ['datasources'],
    queryFn: getDataSources,
  });

  const { data: tablesData } = useQuery({
    queryKey: ['datasource-tables', datasourceId],
    queryFn: () => getDataSourceTables(datasourceId),
    enabled: !!datasourceId,
  });
  const tables = tablesData?.tables ?? [];

  const { data: tableSchema } = useQuery({
    queryKey: ['table-schema', datasourceId, targetTable],
    queryFn: () => getTableSchema(datasourceId, targetTable),
    enabled: !!(datasourceId && targetTable && tables.includes(targetTable)),
    retry: false,
  });

  // Generate code template based on selected table schema
  const codeTemplate = useMemo(() => {
    if (!tableSchema?.columns) return null;
    const writableCols = tableSchema.columns.filter(
      (c) => !(c.primary_key && (c.type?.toUpperCase().includes('INTEGER') || c.type?.toLowerCase().includes('serial')))
    );
    const colNames = writableCols.map((c) => c.name);
    const sampleValues: Record<string, string> = {};
    writableCols.forEach((c) => {
      const t = c.type?.toLowerCase() || '';
      if (t.includes('int') || t.includes('serial')) sampleValues[c.name] = '0';
      else if (t.includes('float') || t.includes('double') || t.includes('decimal') || t.includes('numeric') || t.includes('real')) sampleValues[c.name] = '0.0';
      else if (t.includes('bool')) sampleValues[c.name] = 'True';
      else if (t.includes('date') || t.includes('time') || t.includes('timestamp')) sampleValues[c.name] = '"2024-01-01"';
      else sampleValues[c.name] = '"value"';
    });
    const dictEntries = colNames.map((n) => `        "${n}": ${sampleValues[n]},`).join('\n');
    return `import json

# 데이터 처리 로직 작성
results = [
    {
${dictEntries}
    },
    # ... 추가 행
]

# __DATA__ 접두사로 각 행을 출력하면 DB에 저장됩니다
for row in results:
    print("__DATA__:" + json.dumps(row))

# 일반 print()는 잡 로그에 기록됩니다
print(f"총 {len(results)}행 처리 완료")`;
  }, [tableSchema]);

  const createMutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      navigate('/jobs');
    },
  });

  const handleAnalyze = async () => {
    try {
      const result = await analyzeCode(code);
      setAnalysis(result);
      setActiveTab('analysis');
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadJobFile(file);
      setName(result.name);
      setCode(result.code);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = () => {
    createMutation.mutate({
      name,
      description: description || undefined,
      code,
      schedule_type: scheduleType as any,
      cron_expression: scheduleType === 'cron' ? cronExpression : undefined,
      interval_seconds: scheduleType === 'interval' ? parseInt(intervalSeconds) : undefined,
      max_retries: parseInt(maxRetries),
      timeout_seconds: parseInt(timeoutSeconds),
      datasource_id: datasourceId || undefined,
      save_to_datasource: saveToDataSource,
      target_table: targetTable || undefined,
      output_format: outputFormat,
      write_mode: writeMode,
      upsert_key: upsertKey || undefined,
      notify_webhook_url: notifyWebhookUrl || undefined,
      notify_on: notifyOn,
      priority: parseInt(priority),
      requirements: requirements || undefined,
      max_concurrent: parseInt(maxConcurrent),
    } as any);
  };

  return (
    <div>
      <Header title="Job 생성" />
      <div className="p-8">
        <Button variant="ghost" size="sm" onClick={() => navigate('/jobs')} icon={ArrowLeft} className="mb-8">
          목록으로 돌아가기
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left - Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader title="기본 정보" />
              <div className="space-y-5">
                <FormField label="Job 이름" required>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="나의 Python Job" />
                </FormField>
                <FormField label="설명">
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="선택 사항..." />
                </FormField>
              </div>
            </Card>

            {/* Code / Schedule / Analysis Tabs */}
            <Card padding="none" className="overflow-hidden">
              <div className="p-5 pb-0">
                <TabList>
                  <TabTrigger active={activeTab === 'code'} onClick={() => setActiveTab('code')}>Code</TabTrigger>
                  <TabTrigger active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')}>Schedule</TabTrigger>
                  <TabTrigger active={activeTab === 'datasource'} onClick={() => setActiveTab('datasource')}>
                    <span className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5" />
                      Datasource{targetTable ? ' ✓' : datasourceId ? ' ●' : ''}
                    </span>
                  </TabTrigger>
                  <TabTrigger active={activeTab === 'advanced'} onClick={() => setActiveTab('advanced')}>
                    Advanced{requirements ? ' ●' : ''}
                  </TabTrigger>
                  <TabTrigger active={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')}>
                    {analysis ? `Analysis (${analysis.warnings.length > 0 ? '⚠' : '✓'})` : 'Analysis'}
                  </TabTrigger>
                </TabList>
              </div>

              <TabContent active={activeTab === 'code'} className="pt-0">
                <div className="flex items-center justify-between px-6 py-3.5 border-b border-border/40 bg-bg-elevated/30">
                  <span className="text-[11px] text-text-muted font-bold uppercase tracking-wider">Python 3</span>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1.5 px-3.5 py-2 text-xs text-text-secondary hover:text-text-primary cursor-pointer bg-bg-hover/60 hover:bg-bg-hover rounded-xl transition-colors font-semibold">
                      <Upload className="w-3.5 h-3.5" /> .py 업로드
                      <input type="file" accept=".py" onChange={handleUpload} className="hidden" />
                    </label>
                    <Button variant="ghost" size="sm" onClick={handleAnalyze}>분석</Button>
                  </div>
                </div>
                <Suspense fallback={<div className="h-[450px] animate-pulse bg-bg-tertiary/20" />}>
                  <MonacoEditor
                    height="450px"
                    defaultLanguage="python"
                    value={code}
                    onChange={(v) => setCode(v || '')}
                    theme="vs-dark"
                    options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, padding: { top: 12 }, fontFamily: "'JetBrains Mono', monospace", fontLigatures: true }}
                  />
                </Suspense>
              </TabContent>

              <TabContent active={activeTab === 'schedule'}>
                <div className="p-7 space-y-6">
                  <FormField label="스케줄 유형">
                    <div className="flex gap-2">
                      {['manual', 'cron', 'interval'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setScheduleType(t)}
                          className={cn(
                            'px-4 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer',
                            scheduleType === t
                              ? 'bg-primary/15 text-primary shadow-[0_0_12px_rgba(0,212,255,0.08)]'
                              : 'bg-bg-tertiary/50 text-text-muted hover:text-text-secondary border border-border'
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </FormField>
                  {scheduleType === 'cron' && (
                    <FormField label="Cron 표현식" hint="형식: 분 시 일 월 요일">
                      <Input value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} className="font-mono" placeholder="*/5 * * * *  (5분마다)" />
                    </FormField>
                  )}
                  {scheduleType === 'interval' && (
                    <FormField label="반복 간격 (초)">
                      <Input type="number" value={intervalSeconds} onChange={(e) => setIntervalSeconds(e.target.value)} placeholder="300" min={1} />
                    </FormField>
                  )}
                  <div className="grid grid-cols-2 gap-5">
                    <FormField label="최대 재시도 횟수">
                      <Input type="number" value={maxRetries} onChange={(e) => setMaxRetries(e.target.value)} min={0} max={10} />
                    </FormField>
                    <FormField label="타임아웃 (초)">
                      <Input type="number" value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(e.target.value)} min={1} max={86400} />
                    </FormField>
                  </div>

                  {/* Priority */}
                  <FormField label="우선순위" hint="1 (가장 높음) ~ 10 (가장 낮음), 기본값 5">
                    <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} min={1} max={10} />
                  </FormField>

                  {/* Webhook Notification */}
                  <div className="border-t border-border/30 pt-5 mt-2">
                    <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em] mb-4">웹훅 알림</h4>
                    <div className="space-y-5">
                      <FormField label="웹훅 URL" hint="Job 완료 시 POST 요청을 보낼 URL (Slack, Discord, 커스텀 등)">
                        <Input value={notifyWebhookUrl} onChange={(e) => setNotifyWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
                      </FormField>
                      {notifyWebhookUrl && (
                        <FormField label="알림 조건" hint="어떤 상태일 때 알림을 보낼지 선택하세요">
                          <Select value={notifyOn} onChange={(e) => setNotifyOn(e.target.value as any)}>
                            <option value="failure">실패 시에만</option>
                            <option value="success">성공 시에만</option>
                            <option value="both">성공 + 실패 모두</option>
                            <option value="none">비활성화</option>
                          </Select>
                        </FormField>
                      )}
                    </div>
                  </div>
                </div>
              </TabContent>

              <TabContent active={activeTab === 'datasource'}>
                <div className="p-7 space-y-6">
                  {/* Step 1: Select Datasource */}
                  <FormField label="1. 데이터소스 선택" hint="Job 출력 데이터를 저장할 데이터베이스를 선택하세요">
                    <Select value={datasourceId} onChange={(e) => {
                      setDatasourceId(e.target.value);
                      setTargetTable('');
                      if (!e.target.value) { setSaveToDataSource(false); }
                    }}>
                      <option value="">없음</option>
                      {datasources.map((ds) => (
                        <option key={ds.id} value={ds.id}>{ds.name} ({ds.db_type})</option>
                      ))}
                    </Select>
                  </FormField>

                  {datasourceId && (
                    <>
                      {/* Step 2: Select Target Table */}
                      <FormField label="2. 대상 테이블" hint="기존 테이블을 선택하거나 새 테이블 이름을 입력하세요.">
                        <Input
                          list="tables_list"
                          value={targetTable}
                          onChange={(e) => setTargetTable(e.target.value)}
                          placeholder="js_new_table"
                          className="font-mono text-sm"
                        />
                        <datalist id="tables_list">
                          {tables.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={ExternalLink}
                            onClick={() => window.open(`/datasources/${datasourceId}`, '_blank')}
                          >
                            데이터소스 둘러보기
                          </Button>
                        </div>
                      </FormField>

                      {/* Step 3: Schema Preview or Auto-Create Notice */}
                      {targetTable && !tables.includes(targetTable) && (
                        <div className="space-y-4">
                          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-3">
                            <div className="flex items-center gap-2">
                              <Info className="w-4 h-4 text-primary" />
                              <span className="text-xs font-bold text-primary uppercase tracking-wider">자동 테이블 생성 안내</span>
                            </div>
                            <div className="text-xs text-text-secondary space-y-2">
                              <p>입력하신 <code className="px-1.5 py-0.5 rounded bg-bg-elevated font-mono font-bold text-primary">{targetTable}</code> 테이블은 아직 존재하지 않습니다.</p>
                              <p>이 Job이 처음 실행될 때 <code className="font-mono font-bold text-success">__DATA__:</code> 출력 객체의 구조를 분석하여 <strong>테이블과 인덱스를 자동으로 생성</strong>합니다.</p>
                              <ul className="space-y-1 text-text-muted ml-3 list-disc">
                                <li>Python 데이터 타입(int, float, bool, string, date) 기반 컬럼 자동 정의</li>
                                <li>Upsert 키가 있으면 자동으로 <code className="font-mono">PRIMARY KEY</code> 설정</li>
                                <li><code className="font-mono">_id</code>, <code className="font-mono">_at</code> 등으로 끝나는 컬럼명은 자동 인덱스 생성</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Step 3: Schema Preview */}
                      {targetTable && tables.includes(targetTable) && tableSchema && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Table2 className="w-4 h-4 text-primary" />
                            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em]">
                              3. 테이블 스키마 — <span className="text-primary normal-case">{targetTable}</span>
                            </h4>
                          </div>
                          <div className="overflow-hidden rounded-xl border border-border/40">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-bg-elevated/60 border-b border-border/30">
                                  <th className="text-left px-3 py-2 font-bold text-text-muted uppercase tracking-wider">컬럼</th>
                                  <th className="text-left px-3 py-2 font-bold text-text-muted uppercase tracking-wider">타입</th>
                                  <th className="text-center px-3 py-2 font-bold text-text-muted uppercase tracking-wider">Nullable</th>
                                  <th className="text-center px-3 py-2 font-bold text-text-muted uppercase tracking-wider">PK</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tableSchema.columns.map((col, i) => (
                                  <tr key={col.name} className={cn(
                                    'border-b border-border/20',
                                    i % 2 === 0 ? 'bg-bg-primary/50' : 'bg-bg-elevated/20'
                                  )}>
                                    <td className="px-3 py-1.5 font-mono font-semibold text-text-primary">{col.name}</td>
                                    <td className="px-3 py-1.5 font-mono text-text-secondary">{col.type}</td>
                                    <td className="px-3 py-1.5 text-center">
                                      {col.nullable
                                        ? <span className="text-text-muted">○</span>
                                        : <span className="text-warning font-bold">●</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                      {col.primary_key ? <span className="text-primary font-bold">PK</span> : ''}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Code Guide */}
                          <div className="p-4 rounded-xl bg-info/5 border border-info/15 space-y-3">
                            <div className="flex items-center gap-2">
                              <Info className="w-4 h-4 text-info" />
                              <span className="text-xs font-bold text-info uppercase tracking-wider">데이터 출력 방법</span>
                            </div>
                            <div className="text-xs text-text-secondary space-y-2">
                              <p>Python 코드에서 각 데이터 행을 <code className="px-1.5 py-0.5 rounded bg-bg-elevated font-mono font-bold text-primary">__DATA__:</code> 접두사와 함께 JSON 객체로 출력하세요:</p>
                              <pre className="p-3 rounded-lg bg-bg-tertiary/80 text-[11px] font-mono overflow-x-auto whitespace-pre leading-relaxed text-text-primary">
{`import json

row = {${tableSchema.columns
  .filter(c => !(c.primary_key && (c.type?.toUpperCase().includes('INTEGER') || c.type?.toLowerCase().includes('serial'))))
  .map(c => `"${c.name}": ...`)
  .join(', ')}}
print("__DATA__:" + json.dumps(row))`}
                              </pre>
                              <ul className="space-y-1 text-text-muted ml-3">
                                <li>• <code className="font-mono text-primary">__DATA__:</code> 행은 파싱되어 <span className="font-bold text-text-secondary">{targetTable}</span> 테이블에 저장됩니다</li>
                                <li>• 일반 <code className="font-mono">print()</code> 출력은 잡 로그에 기록됩니다</li>
                                <li>• PK / 자동증가 컬럼은 생략할 수 있습니다</li>
                                <li>• Nullable 컬럼은 생략하거나 <code className="font-mono">null</code>로 설정할 수 있습니다</li>
                              </ul>
                            </div>
                            {codeTemplate && (
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={Copy}
                                onClick={() => {
                                  setCode(codeTemplate);
                                  setActiveTab('code');
                                }}
                              >
                                템플릿 코드 사용
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Write Mode */}
                      {targetTable && (
                        <div className="space-y-4 pt-2 border-t border-border/20">
                          <FormField label="쓰기 모드" hint="실행 시 데이터를 대상 테이블에 어떻게 저장할지 선택하세요">
                            <div className="flex gap-2">
                              {([
                                { value: 'append', label: 'Append', desc: '새 행 추가' },
                                { value: 'replace', label: 'Replace', desc: '전체 삭제 후 삽입' },
                                { value: 'upsert', label: 'Upsert', desc: '있으면 수정, 없으면 삽입' },
                              ] as const).map((m) => (
                                <button
                                  key={m.value}
                                  type="button"
                                  onClick={() => setWriteMode(m.value)}
                                  className={cn(
                                    'flex-1 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer text-center',
                                    writeMode === m.value
                                      ? 'bg-primary/15 text-primary shadow-[0_0_12px_rgba(0,212,255,0.08)] border border-primary/30'
                                      : 'bg-bg-tertiary/50 text-text-muted hover:text-text-secondary border border-border'
                                  )}
                                >
                                  <div>{m.label}</div>
                                  <div className="text-[10px] font-normal mt-0.5 opacity-70">{m.desc}</div>
                                </button>
                              ))}
                            </div>
                          </FormField>

                          {writeMode === 'upsert' && (
                            <FormField label="Upsert 키 컬럼" hint="기존 행과 매칭할 컬럼명을 쉼표로 구분하여 입력 (예: id 또는 name,date)">
                              <Input
                                value={upsertKey}
                                onChange={(e) => setUpsertKey(e.target.value)}
                                placeholder="id"
                                className="font-mono text-xs"
                              />
                            </FormField>
                          )}

                          {writeMode === 'replace' && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/8 border border-warning/20">
                              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                              <p className="text-xs text-warning">Replace 모드는 매 실행마다 테이블의 <strong>기존 데이터를 모두 삭제</strong>한 후 새 데이터를 삽입합니다.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Additional options */}
                      <div className="space-y-3 pt-2 border-t border-border/20">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-elevated/40 border border-border/30">
                          <input
                            type="checkbox"
                            id="save_to_ds"
                            checked={saveToDataSource}
                            onChange={(e) => setSaveToDataSource(e.target.checked)}
                            className="w-4 h-4 accent-primary cursor-pointer"
                          />
                          <label htmlFor="save_to_ds" className="text-xs font-medium text-text-secondary cursor-pointer">
                            실행 로그도 <span className="font-mono font-bold">js_job_runs</span> / <span className="font-mono font-bold">js_job_logs</span> 테이블에 저장
                          </label>
                        </div>
                      </div>
                    </>
                  )}

                  {datasources.length === 0 && (
                    <div className="text-center py-8">
                      <Database className="w-8 h-8 text-text-muted mx-auto mb-3" />
                      <p className="text-sm text-text-muted mb-3">설정된 데이터소스가 없습니다</p>
                      <Button variant="secondary" size="sm" onClick={() => window.open('/datasources/new', '_blank')}>
                        데이터소스 생성
                      </Button>
                    </div>
                  )}
                </div>
              </TabContent>

              <TabContent active={activeTab === 'advanced'}>
                <div className="p-7 space-y-6">
                  <FormField label="Pip 패키지 (requirements)" hint="한 줄에 패키지 하나, pip format. 같은 패키지 조합은 자동으로 venv 캐시 재사용">
                    <Textarea
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                      rows={4}
                      placeholder={"requests==2.31.0\nbeautifulsoup4\ngoogle-cloud-bigquery"}
                      className="font-mono text-xs"
                    />
                  </FormField>

                  <FormField label="동시 실행 제한 (max_concurrent)" hint="1 = 중복 실행 방지 (기본), 0 = 무제한">
                    <Input
                      type="number"
                      value={maxConcurrent}
                      onChange={(e) => setMaxConcurrent(e.target.value)}
                      min={0}
                      max={20}
                    />
                  </FormField>
                </div>
              </TabContent>

              <TabContent active={activeTab === 'analysis'}>
                <div className="p-7">
                  {analysis ? (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <span className={cn('w-2.5 h-2.5 rounded-full', analysis.is_valid ? 'bg-success shadow-[0_0_6px_rgba(16,185,129,0.4)]' : 'bg-danger shadow-[0_0_6px_rgba(239,68,68,0.4)]')} />
                        <span className="text-sm font-bold">{analysis.is_valid ? '유효한 Python' : '구문 오류'}</span>
                        <span className="text-xs text-text-muted ml-auto font-semibold">{analysis.total_lines}줄</span>
                      </div>
                      {analysis.syntax_error && <p className="text-sm text-danger bg-danger/8 border border-danger/15 p-4 rounded-xl font-mono">{analysis.syntax_error}</p>}
                      {analysis.imports.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em] mb-3">임포트 ({analysis.imports.length})</h4>
                          <div className="flex flex-wrap gap-2">
                            {analysis.imports.map((imp, i) => (
                              <span key={i} className={cn('px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider', imp.is_stdlib ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning')}>{imp.module}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {analysis.functions.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em] mb-3">함수 ({analysis.functions.length})</h4>
                          <div className="space-y-2">
                            {analysis.functions.map((fn, i) => (
                              <div key={i} className="text-sm text-text-secondary bg-bg-elevated/40 rounded-xl px-4 py-3 font-mono">
                                <span className="text-primary">{fn.is_async ? 'async ' : ''}def {fn.name}</span>
                                <span className="text-text-muted">({fn.args.join(', ')})</span>
                                <span className="text-text-muted ml-2 text-xs">L{fn.line_number}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {analysis.warnings.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em] mb-3">경고 ({analysis.warnings.length})</h4>
                          <div className="space-y-2">
                            {analysis.warnings.map((w, i) => (
                              <p key={i} className={cn('text-xs p-3.5 rounded-xl font-medium',
                                w.severity === 'error' ? 'bg-danger/8 text-danger border border-danger/15' :
                                w.severity === 'warning' ? 'bg-warning/8 text-warning border border-warning/15' : 'bg-info/8 text-info border border-info/15')}>
                                {w.line_number && `L${w.line_number}: `}{w.message}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm text-text-muted font-medium">"분석" 버튼을 클릭하여 코드를 검사하세요</p>
                    </div>
                  )}
                </div>
              </TabContent>
            </Card>
          </div>

          {/* Right - Action Panel */}
          <div className="space-y-5">
            <Card className="sticky top-24">
              <CardHeader title="실행" />
              <Button
                onClick={handleSubmit}
                disabled={!name || !code || createMutation.isPending}
                fullWidth
                size="lg"
              >
                {createMutation.isPending ? '생성 중...' : 'Job 생성'}
              </Button>
              {createMutation.isError && (
                <p className="mt-4 text-xs text-danger font-medium bg-danger/8 border border-danger/15 px-4 py-3 rounded-xl">
                  {(createMutation.error as any)?.response?.data?.detail || 'Job 생성에 실패했습니다'}
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
