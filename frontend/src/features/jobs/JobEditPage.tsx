import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { getJob, updateJob } from '@/api/jobs';
import { getDataSources, getDataSourceTables, getTableSchema } from '@/api/datasources';
import { cn } from '@/lib/utils';
import { lazy, Suspense } from 'react';
import { Button, Card, CardHeader, Input, Textarea, FormField, CardSkeleton } from '@/components/ui';
import { Select } from '@/components/ui/Input';
import { Database, ExternalLink, Table2, Copy, Info } from 'lucide-react';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

export function JobEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => getJob(id!),
    enabled: !!id,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [scheduleType, setScheduleType] = useState('manual');
  const [cronExpression, setCronExpression] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState('');
  const [maxRetries, setMaxRetries] = useState('0');
  const [timeoutSeconds, setTimeoutSeconds] = useState('3600');
  const [notifyWebhookUrl, setNotifyWebhookUrl] = useState('');
  const [notifyOn, setNotifyOn] = useState<'success' | 'failure' | 'both' | 'none'>('failure');
  const [priority, setPriority] = useState('5');
  const [requirements, setRequirements] = useState('');
  const [maxConcurrent, setMaxConcurrent] = useState('1');
  const [datasourceId, setDatasourceId] = useState<string>('');
  const [saveToDataSource, setSaveToDataSource] = useState(false);
  const [targetTable, setTargetTable] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState<'jsonl' | 'csv'>('jsonl');
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

  useEffect(() => {
    if (job) {
      setName(job.name);
      setDescription(job.description || '');
      setCode(job.code);
      setScheduleType(job.schedule_type);
      setCronExpression(job.cron_expression || '');
      setIntervalSeconds(job.interval_seconds?.toString() || '');
      setMaxRetries(job.max_retries.toString());
      setTimeoutSeconds(job.timeout_seconds.toString());
      setNotifyWebhookUrl(job.notify_webhook_url || '');
      setNotifyOn(job.notify_on || 'failure');
      setPriority((job.priority || 5).toString());
      setRequirements(job.requirements || '');
      setMaxConcurrent((job.max_concurrent ?? 1).toString());
      setDatasourceId(job.datasource_id || '');
      setSaveToDataSource(job.save_to_datasource || false);
      setTargetTable(job.target_table || '');
      setOutputFormat((job.output_format as any) || 'jsonl');
      setWriteMode((job.write_mode as any) || 'append');
      setUpsertKey(job.upsert_key || '');
    }
  }, [job]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateJob(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      navigate(`/jobs/${id}`);
    },
  });

  const handleSubmit = () => {
    updateMutation.mutate({
      name, description: description || undefined, code,
      schedule_type: scheduleType,
      cron_expression: scheduleType === 'cron' ? cronExpression : undefined,
      interval_seconds: scheduleType === 'interval' ? parseInt(intervalSeconds) : undefined,
      max_retries: parseInt(maxRetries), timeout_seconds: parseInt(timeoutSeconds),
      notify_webhook_url: notifyWebhookUrl || undefined,
      notify_on: notifyOn,
      priority: parseInt(priority),
      requirements: requirements || undefined,
      max_concurrent: parseInt(maxConcurrent),
      datasource_id: datasourceId || undefined,
      save_to_datasource: saveToDataSource,
      target_table: targetTable || undefined,
      output_format: outputFormat,
      write_mode: writeMode,
      upsert_key: upsertKey || undefined,
    });
  };

  if (isLoading) return (
    <div>
      <Header title="Loading..." />
      <div className="p-8"><CardSkeleton /></div>
    </div>
  );

  return (
    <div>
      <Header title={`수정: ${job?.name}`} />
      <div className="p-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${id}`)} icon={ArrowLeft} className="mb-8">
          작업으로 돌아가기
        </Button>

        <div className="space-y-6 max-w-4xl">
          <Card>
            <CardHeader title="기본 정보" />
            <div className="space-y-5">
              <FormField label="작업 이름" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label="설명">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </FormField>
            </div>
          </Card>

          <Card padding="none" className="overflow-hidden">
            <div className="px-6 py-3.5 border-b border-border/40 bg-bg-elevated/30">
              <span className="text-[11px] text-text-muted font-bold uppercase tracking-wider">Python 코드</span>
            </div>
            <Suspense fallback={<div className="h-[450px] animate-pulse bg-bg-tertiary/20" />}>
              <MonacoEditor height="450px" defaultLanguage="python" value={code} onChange={(v) => setCode(v || '')}
                theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, padding: { top: 12 }, fontFamily: "'JetBrains Mono', monospace", fontLigatures: true }} />
            </Suspense>
          </Card>

          <Card>
            <CardHeader title="스케줄" />
            <div className="space-y-5">
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
                <FormField label="Cron 표현식">
                  <Input value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} className="font-mono" placeholder="*/5 * * * *" />
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
                  <Input type="number" value={timeoutSeconds} onChange={(e) => setTimeoutSeconds(e.target.value)} min={1} />
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
                  <FormField label="Webhook URL" hint="Job 완료 시 POST 요청을 보낼 URL (Slack, Discord, 커스텀 등)">
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
          </Card>

          <Card>
            <CardHeader title="고급" />
            <div className="space-y-5">
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

  <Card>
            <CardHeader title="데이터소스 연동" />
            <div className="space-y-6">
              <FormField label="1. 데이터소스 선택" hint="Job 출력 데이터를 저장할 데이터베이스를 선택하세요">
                <Select value={datasourceId} onChange={(e) => {
                  setDatasourceId(e.target.value);
                  setTargetTable('');
                  if (!e.target.value) { setSaveToDataSource(false); }
                }}>
                  <option value="">없음</option>
                  {datasources.map((ds: any) => (
                    <option key={ds.id} value={ds.id}>{ds.name} ({ds.db_type})</option>
                  ))}
                </Select>
              </FormField>

              {datasourceId && (
                <>
                  <FormField label="2. 대상 테이블" hint="기존 테이블을 선택하거나 새 테이블 이름을 입력하세요">
                    <Input
                      list="edit_tables_list"
                      value={targetTable}
                      onChange={(e) => setTargetTable(e.target.value)}
                      placeholder="js_new_table"
                      className="font-mono text-sm"
                    />
                    <datalist id="edit_tables_list">
                      {tables.map((t: string) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </FormField>

                  {targetTable && !tables.includes(targetTable) && (
                    <div className="space-y-4 pt-2 border-t border-border/20">
                      <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-3">
                        <div className="flex items-center gap-2">
                          <Info className="w-4 h-4 text-primary" />
                          <span className="text-xs font-bold text-primary uppercase tracking-wider">자동 테이블 생성 안내</span>
                        </div>
                        <div className="text-xs text-text-secondary space-y-2">
                          <p>입력하신 <code className="px-1.5 py-0.5 rounded bg-bg-elevated font-mono font-bold text-primary">{targetTable}</code> 테이블은 아직 존재하지 않습니다.</p>
                          <p>저장 시 테이블과 인덱스가 <strong>자동으로 생성</strong>됩니다.</p>
                        </div>
                      </div>
                    </div>
                  )}

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
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
            </div>
          </Card>

          <Button onClick={handleSubmit} disabled={!name || !code || updateMutation.isPending} size="lg">
            {updateMutation.isPending ? '저장 중...' : '변경사항 저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
