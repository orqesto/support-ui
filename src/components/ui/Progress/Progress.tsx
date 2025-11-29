import { cn } from '@/lib/utils';
import { getProgressContainerClasses, getProgressBarClasses } from './progress.styles';
import type { ProgressProps } from './progress.types';

export const Progress = ({
  value,
  max = 100,
  className,
  showLabel = false,
  variant = 'default',
  size = 'md',
  rounded = 'full',
}: ProgressProps) => {
  const percentage = Math.min(Math.max(value, 0), max);
  const progressPercent = (percentage / max) * 100;

  return (
    <div className="relative w-full">
      <div className={cn(getProgressContainerClasses(size, rounded), className)}>
        <div
          className={getProgressBarClasses(variant, rounded)}
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
      {showLabel && (
        <span className="absolute right-0 top-0 -mt-6 text-xs text-muted-foreground">
          {value}/{max}
        </span>
      )}
    </div>
  );
};
