import { type HTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva('rounded-2xl transition-all duration-300', {
  variants: {
    variant: {
      default: 'bg-bg-card/80 border border-border hover:border-border-light',
      elevated: 'bg-bg-card/90 border border-border shadow-2xl shadow-black/30 hover:border-border-light',
      glass: 'glass hover:border-border-light',
    },
    padding: {
      none: '',
      sm: 'p-5',
      md: 'p-7',
      lg: 'p-9',
    },
  },
  defaultVariants: {
    variant: 'default',
    padding: 'md',
  },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

function Card({ className, variant, padding, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, padding, className }))} {...props} />;
}

/* ───── CardHeader ───── */
interface CardHeaderProps {
  title: string;
  action?: ReactNode;
  className?: string;
}

function CardHeader({ title, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between pb-5 mb-6 border-b border-border/50', className)}>
      <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-[0.15em]">{title}</h3>
      {action}
    </div>
  );
}

export { Card, CardHeader, cardVariants };
