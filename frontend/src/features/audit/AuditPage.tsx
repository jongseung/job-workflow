import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { getAuditLogs } from '@/api/audit';
import { formatDate, cn } from '@/lib/utils';
import type { AuditEntry } from '@/types/api';
import { Card, Select, Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui';

const ACTION_CONFIG: Record<string, { bg: string; text: string }> = {
  login: { bg: 'bg-success/8', text: 'text-success' },
  login_failed: { bg: 'bg-danger/8', text: 'text-danger' },
  create_job: { bg: 'bg-primary/8', text: 'text-primary' },
  update_job: { bg: 'bg-info/8', text: 'text-info' },
  delete_job: { bg: 'bg-danger/8', text: 'text-danger' },
  trigger_run: { bg: 'bg-warning/8', text: 'text-warning' },
  cancel_run: { bg: 'bg-warning/8', text: 'text-warning' },
  toggle_job: { bg: 'bg-info/8', text: 'text-info' },
};

const RESOURCE_TYPES = ['', 'auth', 'job', 'job_run', 'user'];
const ACTIONS = ['', 'login', 'login_failed', 'create_job', 'update_job', 'delete_job', 'trigger_run', 'cancel_run'];

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, actionFilter, resourceFilter],
    queryFn: () => getAuditLogs({
      page,
      page_size: 30,
      action: actionFilter || undefined,
      resource_type: resourceFilter || undefined,
    }),
  });

  const totalPages = data ? Math.ceil(data.total / 30) : 0;

  return (
    <div>
      <Header title="Audit Log" />
      <div className="p-8">
        {/* Filters */}
        <div className="flex items-center gap-4 mb-7 flex-wrap">
          <div className="flex items-center gap-2 text-text-muted">
            <Filter className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-[0.15em]">필터</span>
          </div>
          <Select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="w-auto text-sm py-2.5"
          >
            <option value="">모든 액션</option>
            {ACTIONS.filter(Boolean).map(a => (
              <option key={a} value={a}>{a.replace('_', ' ')}</option>
            ))}
          </Select>
          <Select
            value={resourceFilter}
            onChange={(e) => { setResourceFilter(e.target.value); setPage(1); }}
            className="w-auto text-sm py-2.5"
          >
            <option value="">모든 리소스</option>
            {RESOURCE_TYPES.filter(Boolean).map(r => (
              <option key={r} value={r}>{r.replace('_', ' ')}</option>
            ))}
          </Select>
          <span className="text-xs text-text-muted ml-auto font-semibold tabular-nums">총 {data?.total ?? 0}개 항목</span>
        </div>

        {/* Table */}
        <Card padding="none" className="overflow-hidden">
          <Table>
            <TableHeader>
              <tr>
                <TableHead className="w-[160px]">시간</TableHead>
                <TableHead>액션</TableHead>
                <TableHead>리소스</TableHead>
                <TableHead>사용자 ID</TableHead>
                <TableHead>IP 주소</TableHead>
                <TableHead className="w-[100px] text-center">상세정보</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-text-muted font-medium">로딩 중…</td>
                </tr>
              ) : data?.items?.length ? (
                data.items.map((entry: AuditEntry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <TableCell className="text-xs text-text-secondary whitespace-nowrap font-mono tabular-nums">
                      {entry.created_at ? formatDate(entry.created_at) : '-'}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const cfg = ACTION_CONFIG[entry.action] || { bg: 'bg-bg-hover', text: 'text-text-secondary' };
                        return (
                          <span className={cn('px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider', cfg.bg, cfg.text)}>
                            {entry.action.replace(/_/g, ' ')}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-xs text-text-secondary font-medium">
                      {entry.resource_type}
                      {entry.resource_id && (
                        <span className="text-text-muted ml-1.5 font-mono">·{entry.resource_id.slice(0, 8)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-text-muted font-mono tabular-nums">
                      {entry.user_id?.slice(0, 8) || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-text-muted font-mono tabular-nums">
                      {entry.ip_address || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-text-muted text-center">
                      {entry.details ? (
                        expandedId === entry.id ? (
                          <pre className="text-xs text-left text-text-secondary bg-bg-secondary/60 border border-border/40 rounded-xl p-3 max-w-xs overflow-auto font-mono inline-block">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-primary hover:underline font-semibold cursor-pointer">보기</span>
                        )
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <Shield className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-40" />
                    <p className="text-sm text-text-muted font-medium">감사 기록을 찾을 수 없습니다</p>
                  </td>
                </tr>
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <span className="text-xs text-text-muted font-semibold">
              페이지 {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2.5 rounded-xl border border-border text-text-secondary hover:bg-bg-hover hover:border-border-light disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2.5 rounded-xl border border-border text-text-secondary hover:bg-bg-hover hover:border-border-light disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
