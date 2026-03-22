import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { getSchedulerStatus } from '@/api/system';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardHeader } from '@/components/ui';
import { User, Activity } from 'lucide-react';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  const { data: scheduler } = useQuery({
    queryKey: ['schedulerStatus'],
    queryFn: getSchedulerStatus,
    refetchInterval: 5000,
  });

  return (
    <div>
      <Header title="Settings" />
      <div className="p-8 max-w-2xl space-y-6">
        {/* Profile */}
        <Card>
          <CardHeader
            title="프로필"
            action={<User className="w-4 h-4 text-text-muted" />}
          />
          <div className="space-y-1 divide-y divide-border/20">
            {[
              { label: '사용자명', value: <span className="font-bold text-text-primary">{user?.username}</span> },
              { label: '이메일', value: <span className="font-medium text-text-primary">{user?.email || '—'}</span> },
              { label: '역할', value: <span className="px-3 py-1.5 bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wider rounded-lg capitalize">{user?.role}</span> },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center py-4 first:pt-0 last:pb-0">
                <span className="text-sm text-text-muted font-medium">{item.label}</span>
                <span className="text-sm">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Scheduler */}
        <Card>
          <CardHeader
            title="스케줄러"
            action={<Activity className="w-4 h-4 text-text-muted" />}
          />
          <div className="space-y-1 divide-y divide-border/20">
            <div className="flex justify-between items-center pb-4">
              <span className="text-sm text-text-muted font-medium">상태</span>
              <StatusBadge status={scheduler?.running ? 'running' : 'failed'} />
            </div>
            <div className="flex justify-between items-center pt-4">
              <span className="text-sm text-text-muted font-medium">예약된 작업</span>
              <span className="text-sm text-text-primary font-bold tabular-nums">{scheduler?.job_count ?? 0}</span>
            </div>
          </div>

          {scheduler?.jobs?.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border/30">
              <h4 className="text-[11px] text-text-muted font-bold uppercase tracking-[0.15em] mb-4">예정된 트리거</h4>
              <div className="space-y-2">
                {scheduler.jobs.map((j: any) => (
                  <div key={j.id} className="flex justify-between items-center text-xs py-2.5 px-4 bg-bg-elevated/40 rounded-xl">
                    <span className="text-text-secondary font-mono font-medium">{j.id}</span>
                    <span className="text-text-muted font-medium">{j.next_run_time || '일시 정지됨'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
