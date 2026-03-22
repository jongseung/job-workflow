import { useQuery } from '@tanstack/react-query';
import { Activity, Briefcase, CheckCircle2, XCircle, PlayCircle, TrendingUp, Server, Database, GitMerge } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Header } from '@/components/layout/Header';
import { getStats, getRunHistory } from '@/api/system';
import { getRecentRuns } from '@/api/runs';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardHeader, Table, TableHeader, TableHead, TableBody, TableRow, TableCell, Button, StatCardSkeleton, TableSkeleton } from '@/components/ui';
import { formatDuration, timeAgo, formatBytes } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const CHART_COLORS = {
  success: '#10b981',
  failed: '#ef4444',
  cancelled: '#f59e0b',
  running: '#00d4ff',
  pending: '#5a5a65',
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
    refetchInterval: 5000,
  });

  const { data: recentRuns, isLoading: runsLoading } = useQuery({
    queryKey: ['recentRuns'],
    queryFn: () => getRecentRuns(10),
    refetchInterval: 5000,
  });

  const { data: runHistory } = useQuery({
    queryKey: ['runHistory'],
    queryFn: () => getRunHistory(14),
    refetchInterval: 30000,
  });

  if (statsLoading) return (
    <div>
      <Header title="Dashboard" />
      <div className="p-8 space-y-8">
        <StatCardSkeleton />
      </div>
    </div>
  );

  const jobCards = [
    { label: '전체 작업', value: stats?.total_jobs ?? 0, icon: Briefcase, color: 'text-primary', bg: 'bg-primary/8', glow: 'shadow-[0_0_20px_rgba(0,212,255,0.06)]' },
    { label: '현재 실행 중', value: stats?.running_now ?? 0, icon: PlayCircle, color: 'text-info', bg: 'bg-info/8', glow: 'shadow-[0_0_20px_rgba(56,189,248,0.06)]' },
    { label: '작업 성공률', value: `${stats?.success_rate ?? 0}%`, icon: TrendingUp, color: 'text-success', bg: 'bg-success/8', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.06)]' },
    { label: '작업 실패', value: stats?.failed_runs ?? 0, icon: XCircle, color: 'text-danger', bg: 'bg-danger/8', glow: 'shadow-[0_0_20px_rgba(239,68,68,0.06)]' },
  ];

  const wfCards = [
    { label: '전체 워크플로우', value: stats?.total_workflows ?? 0, icon: GitMerge, color: 'text-[#9B8AFB]', bg: 'bg-[#9B8AFB]/8', glow: 'shadow-[0_0_20px_rgba(155,138,251,0.06)]' },
    { label: 'WF 실행 중', value: stats?.wf_running_now ?? 0, icon: PlayCircle, color: 'text-info', bg: 'bg-info/8', glow: 'shadow-[0_0_20px_rgba(56,189,248,0.06)]' },
    { label: 'WF 성공률', value: `${stats?.wf_success_rate ?? 0}%`, icon: TrendingUp, color: 'text-success', bg: 'bg-success/8', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.06)]' },
    { label: 'WF 실패', value: stats?.wf_failed_runs ?? 0, icon: XCircle, color: 'text-danger', bg: 'bg-danger/8', glow: 'shadow-[0_0_20px_rgba(239,68,68,0.06)]' },
  ];

  const pieData = [
    { name: '성공', value: (stats?.success_runs ?? 0) + (stats?.wf_success_runs ?? 0), color: CHART_COLORS.success },
    { name: '실패', value: (stats?.failed_runs ?? 0) + (stats?.wf_failed_runs ?? 0), color: CHART_COLORS.failed },
    { name: '실행 중', value: (stats?.running_now ?? 0) + (stats?.wf_running_now ?? 0), color: CHART_COLORS.running },
  ].filter(d => d.value > 0);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-bg-card border border-border rounded-xl px-4 py-3 shadow-2xl shadow-black/40">
        <p className="text-[11px] text-text-muted mb-2 font-bold uppercase tracking-wider">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.name} className="text-xs font-semibold" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-8 space-y-8">
        {/* Job Stats Cards */}
        <div>
          <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em] mb-4 flex items-center gap-2">
            <Briefcase className="w-3.5 h-3.5" /> 작업 (Jobs)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {jobCards.map((card, i) => (
              <Card key={card.label} className={`group ${card.glow}`} style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em]">{card.label}</span>
                  <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center transition-transform group-hover:scale-110`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </div>
                <p className="text-3xl font-extrabold text-text-primary tracking-tight">{card.value}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Workflow Stats Cards */}
        <div>
          <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em] mb-4 flex items-center gap-2">
            <GitMerge className="w-3.5 h-3.5" /> 워크플로우 (Workflows)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {wfCards.map((card, i) => (
              <Card key={card.label} className={`group ${card.glow}`} style={{ animationDelay: `${(i + 4) * 80}ms` }}>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-[0.12em]">{card.label}</span>
                  <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center transition-transform group-hover:scale-110`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </div>
                <p className="text-3xl font-extrabold text-text-primary tracking-tight">{card.value}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card padding="md" className="lg:col-span-2">
            <CardHeader
              title="실행 기록 (14일)"
              action={<Activity className="w-4 h-4 text-text-muted" />}
            />
            <div className="h-[280px]">
              {runHistory && runHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={runHistory} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <XAxis dataKey="date" tick={{ fill: '#5a5a65', fontSize: 10, fontWeight: 600 }} tickFormatter={(v) => v.slice(5)} axisLine={{ stroke: '#1f1f24' }} tickLine={false} />
                    <YAxis tick={{ fill: '#5a5a65', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="success" stackId="a" fill={CHART_COLORS.success} radius={[0, 0, 0, 0]} name="성공" />
                    <Bar dataKey="failed" stackId="a" fill={CHART_COLORS.failed} radius={[0, 0, 0, 0]} name="실패" />
                    <Bar dataKey="cancelled" stackId="a" fill={CHART_COLORS.cancelled} radius={[2, 2, 0, 0]} name="취소됨" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted text-sm font-medium">실행 데이터가 없습니다. 기록을 보려면 작업을 실행하세요.</div>
              )}
            </div>
          </Card>

          <Card padding="md">
            <CardHeader title="실행 분포" />
            <div className="h-[280px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                      {pieData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#111113', border: '1px solid #1f1f24', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }} />
                    <Legend verticalAlign="bottom" formatter={(value) => <span className="text-text-secondary text-xs font-semibold">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted text-sm font-medium">실행 기록 없음</div>
              )}
            </div>
          </Card>
        </div>

        {/* System Health + Recent Runs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card padding="md">
            <CardHeader title="시스템 상태" />
            <div className="space-y-1 divide-y divide-border/20">
              {[
                { icon: Server, label: '스케줄러', value: <StatusBadge status={stats?.scheduler_running ? 'running' : 'failed'} /> },
                { icon: Briefcase, label: '예약된 작업', value: stats?.scheduled_jobs ?? 0 },
                { icon: GitMerge, label: '활성 워크플로우', value: stats?.active_workflows ?? 0 },
                { icon: Database, label: 'DB 크기', value: formatBytes(stats?.db_size_bytes ?? 0) },
                { icon: Activity, label: '가동 시간', value: formatDuration((stats?.uptime_seconds ?? 0) * 1000) },
                { icon: CheckCircle2, label: '총 실행 (잡+WF)', value: (stats?.total_runs ?? 0) + (stats?.wf_total_runs ?? 0) },
                { icon: Briefcase, label: '활성 작업', value: stats?.active_jobs ?? 0 },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <item.icon className="w-4 h-4 text-text-muted" />
                    <span className="text-sm text-text-secondary font-medium">{item.label}</span>
                  </div>
                  {typeof item.value === 'object' ? item.value : (
                    <span className="text-sm text-text-primary font-bold tabular-nums">{item.value}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card padding="none" className="lg:col-span-2">
            <div className="px-7 pt-7 pb-5">
              <CardHeader
                title="최근 실행"
                action={<Button variant="ghost" size="sm" onClick={() => navigate('/logs')}>전체 보기</Button>}
              />
            </div>
            {runsLoading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <tr>
                      <TableHead className="w-[50px] text-center">유형</TableHead>
                      <TableHead>이름</TableHead>
                      <TableHead className="text-center whitespace-nowrap">상태</TableHead>
                      <TableHead className="text-center whitespace-nowrap">트리거</TableHead>
                      <TableHead className="text-center whitespace-nowrap">소요 시간</TableHead>
                      <TableHead className="text-center whitespace-nowrap w-[150px]">실행 일시</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {recentRuns?.map((run) => {
                      const isWorkflow = run.run_type === 'workflow';
                      const name = isWorkflow
                        ? (run.workflow_name || run.workflow_id?.slice(0, 8) || '-')
                        : (run.job_name || run.job_id?.slice(0, 8) || '-');
                      const link = isWorkflow
                        ? `/workflows/${run.workflow_id}/edit`
                        : `/jobs/${run.job_id}`;
                      return (
                        <TableRow key={run.id} className="cursor-pointer" onClick={() => navigate(link)}>
                          <TableCell className="text-center">
                            {isWorkflow ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#9B8AFB]/10 text-[#9B8AFB]">
                                <GitMerge className="w-3 h-3" />
                                WF
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                                <Briefcase className="w-3 h-3" />
                                JOB
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold text-text-primary">{name}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center"><StatusBadge status={run.status} /></div>
                          </TableCell>
                          <TableCell className="text-xs text-text-secondary capitalize font-medium text-center whitespace-nowrap">{run.trigger_type}</TableCell>
                          <TableCell className="text-text-secondary font-mono text-xs tabular-nums text-center whitespace-nowrap">{formatDuration(run.duration_ms)}</TableCell>
                          <TableCell className="text-xs text-text-muted font-medium text-center whitespace-nowrap">{run.created_at ? timeAgo(run.created_at) : '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                    {(!recentRuns || recentRuns.length === 0) && (
                      <tr><td colSpan={6} className="py-12 text-center text-sm text-text-muted font-medium">실행 기록 없음</td></tr>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
