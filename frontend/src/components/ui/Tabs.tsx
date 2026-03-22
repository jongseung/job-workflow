import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ───── TabList ───── */
interface TabListProps {
  children: ReactNode;
  className?: string;
}

function TabList({ children, className }: TabListProps) {
  return (
    <div className={cn('flex gap-1 p-1.5 bg-bg-secondary/60 rounded-2xl border border-border/40', className)}>
      {children}
    </div>
  );
}

/* ───── TabTrigger ───── */
interface TabTriggerProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

function TabTrigger({ active, onClick, children, className }: TabTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap tracking-tight',
        active
          ? 'bg-primary/15 text-primary shadow-[0_0_12px_rgba(0,212,255,0.08)]'
          : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover/40',
        className
      )}
    >
      {children}
    </button>
  );
}

/* ───── TabContent ───── */
interface TabContentProps {
  active: boolean;
  children: ReactNode;
  className?: string;
}

function TabContent({ active, children, className }: TabContentProps) {
  if (!active) return null;
  return <div className={cn('animate-fade-in', className)}>{children}</div>;
}

export { TabList, TabTrigger, TabContent };
