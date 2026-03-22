import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ───── Input ───── */
const inputBase =
  'w-full px-4 py-3 bg-bg-input border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 focus:bg-bg-secondary transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed font-medium';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(inputBase, error && 'border-danger/50 focus:border-danger focus:ring-danger/10', className)}
      {...props}
    />
  )
);
Input.displayName = 'Input';

/* ───── Textarea ───── */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(inputBase, 'resize-none', error && 'border-danger/50 focus:border-danger focus:ring-danger/10', className)}
      rows={4}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

/* ───── Select ───── */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        inputBase,
        'appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%235a5a65%22%20stroke-width%3D%222%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-11',
        error && 'border-danger/50 focus:border-danger focus:ring-danger/10',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

/* ───── FormField ───── */
interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

function FormField({ label, htmlFor, required, hint, error, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-2.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export { Input, Textarea, Select, FormField };
