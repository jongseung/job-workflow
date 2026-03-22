import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Play } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { getJobs, toggleJob, triggerRun } from '@/api/jobs';
import { timeAgo, cn } from '@/lib/utils';
import { Button, Input, Card, Table, TableHeader, TableHead, TableBody, TableRow, TableCell, TableSkeleton } from '@/components/ui';

export function JobListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', page, search],
    queryFn: () => getJobs({ page, page_size: 20, search: search || undefined }),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });

  const runMutation = useMutation({
    mutationFn: triggerRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['recentRuns'] });
    },
  });

  const scheduleTypeLabel: Record<string, string> = {
    manual: '수동',
    cron: '크론',
    interval: '간격',
  };

  return (
    <div>
      <Header title="Jobs" />
      <div className="p-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              type="text"
              placeholder="작업 검색..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-11"
            />
          </div>
          <Button onClick={() => navigate('/jobs/new')} icon={Plus}>
            새 작업
          </Button>
        </div>

        {/* Table */}
        {isLoading ? (
          <Card padding="none">
            <TableSkeleton rows={6} cols={6} />
          </Card>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title="작업을 찾을 수 없습니다"
            description="첫 번째 작업을 생성하여 시작하세요."
            action={
              <Button onClick={() => navigate('/jobs/new')} icon={Plus}>작업 생성</Button>
            }
          />
        ) : (
          <>
            <Card padding="none" className="overflow-hidden">
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead className="text-center w-[100px] whitespace-nowrap">활성화</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead className="text-center whitespace-nowrap">일정</TableHead>
                    <TableHead className="text-center whitespace-nowrap">상태</TableHead>
                    <TableHead className="text-center whitespace-nowrap">마지막 실행</TableHead>
                    <TableHead className="text-center w-[150px] whitespace-nowrap">액션</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {data.items.map((job) => (
                    <TableRow key={job.id} className="cursor-pointer" onClick={() => navigate(`/jobs/${job.id}`)}>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleMutation.mutate(job.id); }}
                            className={cn(
                              'w-11 h-6 rounded-full transition-all duration-300 relative',
                              job.is_active
                                ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                                : 'bg-bg-tertiary border border-border/50'
                            )}
                          >
                            <span className={cn(
                              'absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300',
                              job.is_active ? 'translate-x-5' : 'translate-x-0',
                              !job.is_active && 'bg-text-muted/50'
                            )} />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-text-primary">{job.name}</p>
                          {job.description && (
                            <p className="text-xs text-text-muted mt-0.5 truncate max-w-xs font-medium">{job.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-[11px] px-2.5 py-1 bg-bg-tertiary/50 rounded-lg text-text-secondary font-semibold whitespace-nowrap inline-block">
                          {scheduleTypeLabel[job.schedule_type] || job.schedule_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center"><StatusBadge status={job.last_run_status} /></div>
                      </TableCell>
                      <TableCell className="text-xs text-text-muted font-medium text-center whitespace-nowrap">{job.last_run_at ? timeAgo(job.last_run_at) : '없음'}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        <div className="flex justify-center">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Play}
                            onClick={(e) => { e.stopPropagation(); runMutation.mutate(job.id); }}
                            className="bg-bg-elevated/50 hover:bg-primary/20 hover:text-primary hover:border-primary/30 transition-all duration-300 shadow-sm whitespace-nowrap"
                          >
                            바로 실행
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {data.total_pages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <span className="text-sm text-text-muted font-medium">총 {data.total}개의 작업</span>
                <div className="flex gap-2 items-center">
                  <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>이전</Button>
                  <span className="px-3 py-2 text-sm text-text-secondary font-bold tabular-nums">{page} / {data.total_pages}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))} disabled={page === data.total_pages}>다음</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
