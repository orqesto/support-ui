import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const STEP_LABELS = [
  'Departments',
  'AI setup',
  'Storage',
  'Channels',
  'Routing',
  'Team',
] as const;

type Props = {
  activeStep: number; // 1-based
};

export const StepIndicator = ({ activeStep }: Props) => (
  <div className="space-y-2">
    <ol className="flex items-center justify-center gap-2 sm:gap-3">
      {STEP_LABELS.map((label, index) => {
        const step = index + 1;
        const done = step < activeStep;
        const current = step === activeStep;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            {index > 0 && <div className="h-px w-4 sm:w-6 bg-border" aria-hidden />}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                  done && 'border-primary bg-primary text-primary-foreground',
                  current && 'border-primary text-primary',
                  !done && !current && 'border-border text-muted-foreground'
                )}
                aria-current={current ? 'step' : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : step}
              </span>
              {/* Only the active step shows its label inline, so 6 steps never
                  overflow the container; the others are dots. */}
              {current && (
                <span className="hidden text-sm font-medium text-foreground sm:inline">
                  {label}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
    {/* Text cue for narrow screens where inline labels are hidden. */}
    <p className="text-center text-xs text-muted-foreground">
      {`Step ${activeStep} of ${STEP_LABELS.length} — ${STEP_LABELS[activeStep - 1]}`}
    </p>
  </div>
);
