import { Button } from '@/components/ui/Button';

type Option = {
  value: string;
  label: string;
};

type SegmentedFilterProps = {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  options: Option[];
  mobileRows: number[]; 
  className?: string;
};

export const SegmentedFilter = ({
  label,
  value,
  onChange,
  options,
  mobileRows,
  className,
}: SegmentedFilterProps) => (
  <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-1 ${className || ''}`}>
    <span className="text-xs font-semibold text-muted-foreground sm:whitespace-nowrap sm:mr-2">
      {label}:
    </span>

    <div className="flex flex-col gap-2 sm:hidden">
      {mobileRows.reduce<{ start: number; count: number }[]>(
        (acc, count, i) => {
          const start = i === 0 ? 0 : acc[i - 1].start + acc[i - 1].count;
          acc.push({ start, count });
          return acc;
        },
        []
      ).map(({ start, count }) => (
        <div key={start} className="flex gap-2">
          {options.slice(start, start + count).map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={
                (value ?? '') === opt.value || (!value && opt.value === '')
                  ? 'primary'
                  : 'outline'
              }
              onClick={() => onChange(opt.value)}
              className="h-8 text-xs flex-1"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      ))}
    </div>

    <div className="hidden gap-1 sm:flex">
      {options.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant={
            (value ?? '') === opt.value || (!value && opt.value === '')
              ? 'primary'
              : 'outline'
          }
          onClick={() => onChange(opt.value)}
          className="h-8 text-xs"
        >
          {opt.label}
        </Button>
      ))}
    </div>
  </div>
);
