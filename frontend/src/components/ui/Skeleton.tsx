import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-bg-tertiary/50 rounded-xl animate-pulse',
        className
      )}
    />
  );
}

function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-4 p-7">
      <div className="flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3.5 flex-1 rounded-lg" />
        ))}
      </div>
      <div className="border-t border-border/20 my-2" />
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-6 items-center py-1.5">
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton
              key={`${row}-${col}`}
              className={cn('h-5 flex-1 rounded-lg', col === 0 && 'max-w-[200px]')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-bg-card/80 border border-border rounded-2xl p-7 space-y-5">
      <Skeleton className="h-3.5 w-32 rounded-lg" />
      <div className="border-t border-border/30" />
      <div className="space-y-3.5">
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-3/4 rounded-lg" />
        <Skeleton className="h-4 w-1/2 rounded-lg" />
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-bg-card/80 border border-border rounded-2xl p-7">
          <div className="flex items-center justify-between mb-5">
            <Skeleton className="h-3.5 w-24 rounded-lg" />
            <Skeleton className="h-11 w-11 rounded-xl" />
          </div>
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export { Skeleton, TableSkeleton, CardSkeleton, StatCardSkeleton };
