import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const STEP_LABELS = ['AI setup', 'Departments', 'Mailbox', 'Routing', 'Team'] as const;

type Props = {
  activeStep: number; // 1-based
};

export const StepIndicator = ({ activeStep }: Props) => (
  <ol className="flex items-center justify-center gap-2 sm:gap-4">
    {STEP_LABELS.map((label, index) => {
      const step = index + 1;
      const done = step < activeStep;
      const current = step === activeStep;
      return (
        <li key={label} className="flex items-center gap-2 sm:gap-4">
          {index > 0 && <div className="h-px w-4 sm:w-8 bg-border" aria-hidden />}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium',
                done && 'border-primary bg-primary text-primary-foreground',
                current && 'border-primary text-primary',
                !done && !current && 'border-border text-muted-foreground'
              )}
              aria-current={current ? 'step' : undefined}
            >
              {done ? <Check className="h-4 w-4" /> : step}
            </span>
            <span
              className={cn(
                'hidden text-sm sm:inline',
                current ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {label}
            </span>
          </div>
        </li>
      );
    })}
  </ol>
);
