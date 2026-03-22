import { cn } from '@/lib/utils';

const statusConfig: Record<string, { bg: string; text: string; dot: string; glow?: string }> = {
  success: { bg: 'bg-success/8', text: 'text-success', dot: 'bg-success', glow: 'shadow-[0_0_6px_rgba(16,185,129,0.3)]' },
  running: { bg: 'bg-primary/8', text: 'text-primary', dot: 'bg-primary', glow: 'shadow-[0_0_6px_rgba(0,212,255,0.3)]' },
  failed: { bg: 'bg-danger/8', text: 'text-danger', dot: 'bg-danger', glow: 'shadow-[0_0_6px_rgba(239,68,68,0.3)]' },
  pending: { bg: 'bg-warning/8', text: 'text-warning', dot: 'bg-warning' },
  cancelled: { bg: 'bg-text-muted/8', text: 'text-text-muted', dot: 'bg-text-muted' },
  retrying: { bg: 'bg-warning/8', text: 'text-warning', dot: 'bg-warning' },
  queued: { bg: 'bg-purple-500/8', text: 'text-purple-400', dot: 'bg-purple-400', glow: 'shadow-[0_0_6px_rgba(168,85,247,0.3)]' },
  skipped: { bg: 'bg-text-muted/8', text: 'text-text-muted', dot: 'bg-text-muted' },
};

const statusLabels: Record<string, string> = {
  success: '성공',
  running: '실행 중',
  failed: '실패',
  pending: '대기 중',
  cancelled: '취소됨',
  retrying: '재시도 중',
  queued: '대기 중',
  skipped: '건너뜀'
};

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-text-muted text-xs">--</span>;
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider', config.bg, config.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot, config.glow, status === 'running' && 'animate-pulse')} />
      {status ? (statusLabels[status] || status) : ''}
    </span>
  );
}
