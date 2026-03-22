import { forwardRef, type ButtonHTMLAttributes, type ElementType } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:opacity-40 disabled:pointer-events-none cursor-pointer tracking-tight',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-bg-primary hover:bg-primary-hover shadow-[0_0_20px_rgba(0,212,255,0.15)] hover:shadow-[0_0_30px_rgba(0,212,255,0.25)] active:scale-[0.97]',
        secondary:
          'bg-bg-tertiary/80 border border-border-light text-text-primary hover:bg-bg-hover hover:border-primary/30 active:scale-[0.97]',
        ghost:
          'text-text-secondary hover:text-text-primary hover:bg-bg-hover/80',
        danger:
          'bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 hover:border-danger/40 active:scale-[0.97]',
        success:
          'bg-success/10 border border-success/20 text-success hover:bg-success/20 hover:border-success/40 active:scale-[0.97]',
      },
      size: {
        sm: 'px-3.5 py-1.5 text-xs gap-1.5',
        md: 'px-5 py-2.5 text-sm gap-2',
        lg: 'px-7 py-3.5 text-sm gap-2.5',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  icon?: ElementType;
  iconRight?: ElementType;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, icon: Icon, iconRight: IconRight, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        {...props}
      >
        {Icon && <Icon className={cn(size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4')} />}
        {children}
        {IconRight && <IconRight className={cn(size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4')} />}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
