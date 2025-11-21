import { cn } from '@/lib/utils';

type ProgressProps = {
  value: number;
  max?: number;
  className?: string;
};

export const Progress = ({ value, max = 100, className }: ProgressProps) => {
  const percentage = Math.min(Math.max(value, 0), max);

  return (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-300', className)}
        style={{ width: `${(percentage / max) * 100}%` }}
      />
    </div>
  );
};
