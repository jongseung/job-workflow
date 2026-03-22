import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, Pencil, Trash2, Power } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { getJob, triggerRun, deleteJob, toggleJob } from '@/api/jobs';
import { getJobRuns } from '@/api/runs';
import { getRunLogs } from '@/api/logs';
import { analyzeCode } from '@/api/analysis';
import { useLogStream } from '@/hooks/useWebSocket';
import { formatDuration, formatDate, cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import type { AnalysisResult, JobRun } from '@/types/api';
import { lazy, Suspense } from 'react';
import { Button, Card, CardHeader, TabList, TabTrigger, TabContent, Table, TableHeader, TableHead, TableBody, TableRow, TableCell, Select, CardSkeleton } from '@/components/ui';

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'code' | 'runs' | 'logs'>('overview');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => getJob(id!),
    enabled: !!id,
  });

  const { data: runs } = useQuery({
    queryKey: ['jobRuns', id],
    queryFn: () => getJobRuns(id!, { page_size: 20 }),
    enabled: !!id,
    refetchInterval: 3000,
  });

  const { data: logData } = useQuery({
    queryKey: ['logs', selectedRunId],
    queryFn: () => getRunLogs(selectedRunId!, { page_size: 500 }),
    enabled: !!selectedRunId,
    refetchInterval: selectedRunId ? 2000 : false,
  });

  const activeRun = runs?.items?.find((r: JobRun) => r.status === 'running');
  const { logs: streamLogs, connected } = useLogStream(activeRun?.id || null);

  const notify = useUIStore((s) => s.addNotification);

  const runMutation = useMutation({
    mutationFn: () => triggerRun(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobRuns', id] });
      notify({ type: 'success', message: 'Job execution started' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteJob(id!),
    onSuccess: () => {
      notify({ type: 'success', message: 'Job deleted' });
      navigate('/jobs');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: () => toggleJob(id!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      notify({ type: 'info', message: `Job ${data.is_active ? 'activated' : 'deactivated'}` });
    },
  });

  if (isLoading || !job) return (
    <div>
      <Header title="로딩 중..." />
      <div className="p-8"><CardSkeleton /></div>
    </div>
  );

  const handleAnalyze = async () => {
    const result = await analyzeCode(job.code);
    setAnalysis(result);
  };

  return (
    <div>
      <Header title={job.name} />
      <div className="p-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/jobs')} icon={ArrowLeft}>
            작업 목록으로
          </Button>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              variant={job.is_active ? 'success' : 'secondary'}
              size="sm"
              onClick={() => toggleMutation.mutate()}
              icon={Power}
            >
              {job.is_active ? '활성' : '비활성'}
            </Button>
            <Button size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending} icon={Play}>
              지금 실행
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/jobs/${id}/edit`)} icon={Pencil}>
              수정
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => { if (confirm('이 작업을 삭제하시겠습니까?')) deleteMutation.mutate(); }}
              icon={Trash2}
            >
              삭제
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <TabList>
            {([
              { key: 'overview' as const, label: 'Overview' },
              { key: 'code' as const, label: 'Code' },
              { key: 'runs' as const, label: `Runs (${runs?.total ?? 0})` },
              { key: 'logs' as const, label: 'Logs' },
            ]).map((tab) => (
              <TabTrigger key={tab.key} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
                {tab.label}
              </TabTrigger>
            ))}
          </TabList>
        </div>

        {/* Overview */}
        <TabContent active={activeTab === 'overview'}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader title="작업 정보" />
              <div className="space-y-1 divide-y divide-border/20">
                {[
                  ['일정', `${job.schedule_type}${job.cron_expression ? ` · ${job.cron_expression}` : ''}${job.interval_seconds ? ` · 매 ${job.interval_seconds}초` : ''}`],
                  ['타임아웃', `${job.timeout_seconds}초`],
                  ['최대 재시도 횟수', `${job.max_retries}`],
                  ['우선순위', `${job.priority || 5}`],
                  ['최대 동시 실행', `${job.max_concurrent ?? 1}`],
                  ['쓰기 모드', `${job.write_mode || 'append'}${job.write_mode === 'upsert' && job.upsert_key ? ` (키: ${job.upsert_key})` : ''}`],
                  ['요구사항', job.requirements ? `${job.requirements.trim().split('\n').length}개 패키지` : '없음'],
                  ['상태', job.is_active ? '활성' : '비활성'],
                  ['웹훅', job.notify_webhook_url ? `${job.notify_on} → ${job.notify_webhook_url.slice(0, 40)}...` : '없음'],
                  ['생성일', formatDate(job.created_at)],
                  ['마지막 실행', job.last_run_status || '없음'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center py-3.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-text-muted font-medium">{label}</span>
                    <span className="text-sm text-text-primary font-semibold">{value}</span>
                  </div>
                ))}
              </div>
            </Card>
            {job.tags && job.tags.length > 0 && (
              <Card>
                <CardHeader title="태그" />
                <div className="flex flex-wrap gap-2">
                  {job.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1.5 bg-primary/10 text-primary text-xs rounded-lg font-bold uppercase tracking-wider">{tag}</span>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </TabContent>

        {/* Code */}
        <TabContent active={activeTab === 'code'}>
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-border/40 bg-bg-elevated/30">
              <span className="text-[11px] text-text-muted font-bold uppercase tracking-wider">
                {job.code_filename || 'inline'} · <span className="text-text-secondary">{job.code.split('\n').length}줄</span>
              </span>
              <Button variant="ghost" size="sm" onClick={handleAnalyze}>코드 분석</Button>
            </div>
            <Suspense fallback={<div className="h-[500px] animate-pulse bg-bg-tertiary/20" />}>
              <MonacoEditor height="500px" defaultLanguage="python" value={job.code} theme="vs-dark"
                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, padding: { top: 12 }, fontFamily: "'JetBrains Mono', monospace", fontLigatures: true }} />
            </Suspense>
            {analysis && (
              <div className="border-t border-border/40 p-6 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {analysis.imports.map((imp, i) => (
                    <span key={i} className={cn('px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider', imp.is_stdlib ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning')}>{imp.module}</span>
                  ))}
                </div>
                {analysis.warnings.map((w, i) => (
                  <p key={i} className={cn('text-xs p-3.5 rounded-xl font-medium', w.severity === 'error' ? 'bg-danger/8 text-danger border border-danger/15' : 'bg-warning/8 text-warning border border-warning/15')}>{w.message}</p>
                ))}
              </div>
            )}
          </Card>
        </TabContent>

        {/* Runs */}
        <TabContent active={activeTab === 'runs'}>
          <Card padding="none" className="overflow-hidden">
            <Table>
              <TableHeader>
                <tr>
                  <TableHead className="text-center whitespace-nowrap">상태</TableHead>
                  <TableHead className="text-center whitespace-nowrap">트리거</TableHead>
                  <TableHead className="text-center whitespace-nowrap">시도</TableHead>
                  <TableHead className="text-center whitespace-nowrap">소요 시간</TableHead>
                  <TableHead className="text-center whitespace-nowrap">시작</TableHead>
                  <TableHead className="text-center w-[150px] whitespace-nowrap">액션</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {runs?.items?.map((run: JobRun) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <StatusBadge status={run.status} />
                        {run.status === 'failed' && run.error_message && (
                          <p className="mt-1.5 text-[11px] text-danger/80 leading-snug max-w-[280px] truncate" title={run.error_message}>
                            {run.error_message}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-text-secondary capitalize font-medium text-center whitespace-nowrap">{run.trigger_type}</TableCell>
                    <TableCell className="text-text-secondary font-mono text-xs tabular-nums text-center whitespace-nowrap">#{run.attempt_number}</TableCell>
                    <TableCell className="text-text-secondary font-mono text-xs tabular-nums text-center whitespace-nowrap">{formatDuration(run.duration_ms)}</TableCell>
                    <TableCell className="text-xs text-text-muted font-medium text-center whitespace-nowrap">{run.started_at ? formatDate(run.started_at) : 'Pending'}</TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      <div className="flex justify-center">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => { setSelectedRunId(run.id); setActiveTab('logs'); }}
                          className="bg-bg-elevated/50 hover:bg-primary/20 hover:text-primary hover:border-primary/30 transition-all duration-300 whitespace-nowrap"
                        >
                          로그 보기
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!runs?.items?.length) && (
                  <tr><td colSpan={6} className="py-12 text-center text-sm text-text-muted font-medium">실행 기록 없음</td></tr>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabContent>

        {/* Logs */}
        <TabContent active={activeTab === 'logs'}>
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-border/40 bg-bg-elevated/30">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-text-muted font-bold uppercase tracking-wider">
                  {selectedRunId ? `실행: ${selectedRunId.slice(0, 8)}…` : activeRun ? `Live: ${activeRun.id.slice(0, 8)}…` : '실행을 선택하세요'}
                </span>
                {(activeRun || connected) && (
                  <span className="flex items-center gap-1.5 text-[10px] text-success font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              {runs?.items && (
                <Select
                  value={selectedRunId || ''}
                  onChange={(e) => setSelectedRunId(e.target.value || null)}
                  className="w-auto text-xs py-2"
                >
                  <option value="">실행 선택…</option>
                  {runs.items.map((r: JobRun) => (
                    <option key={r.id} value={r.id}>{r.id.slice(0, 8)} — {r.status}</option>
                  ))}
                </Select>
              )}
            </div>
            <div className="max-h-[70vh] overflow-y-auto font-mono text-xs p-6 bg-[#0d0d0f]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {logData?.items?.map((log) => (
                <div key={log.id} className={cn('py-1.5 flex leading-6',
                  log.stream === 'stderr' ? 'text-danger' : log.stream === 'system' ? 'text-info' : 'text-text-primary/90')}>
                  <span className="text-text-muted/50 w-10 shrink-0 text-right mr-5 select-none tabular-nums">{log.line_number}</span>
                  <span className="text-text-muted/50 mr-4 select-none">[{log.stream}]</span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))}
              {streamLogs.map((log, i) => (
                <div key={`stream-${i}`} className={cn('py-1.5 flex leading-6',
                  log.stream === 'stderr' ? 'text-danger' : log.stream === 'system' ? 'text-info' : 'text-text-primary/90')}>
                  <span className="text-text-muted/50 w-10 shrink-0 text-right mr-5 select-none tabular-nums">{log.line_number}</span>
                  <span className="text-text-muted/50 mr-4 select-none">[{log.stream}]</span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))}
              {/* Show error_message banner when the selected run has failed */}
              {selectedRunId && runs?.items?.find((r: JobRun) => r.id === selectedRunId && r.status === 'failed' && r.error_message) && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-danger/8 border border-danger/20 text-danger text-xs font-medium">
                  <span className="font-bold uppercase tracking-wider mr-2">Error:</span>
                  {runs.items.find((r: JobRun) => r.id === selectedRunId)!.error_message}
                </div>
              )}
              {!logData?.items?.length && !streamLogs.length && (
                <p className="text-text-muted text-center py-12 font-sans font-medium">로그가 없습니다. 실행을 선택하거나 새 실행을 트리거하세요.</p>
              )}
            </div>
          </Card>
        </TabContent>
      </div>
    </div>
  );
}
