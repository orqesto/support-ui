import { cn } from '@/lib/utils';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

export const Label = ({ className, children, ...props }: LabelProps) => (
    <label
      className={cn(
        'mb-2 block text-sm font-medium text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
