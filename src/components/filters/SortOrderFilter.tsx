import { ReactSelect } from '@/components/ui/ReactSelect';

type SortOrderFilterProps = {
  value: 'asc' | 'desc';
  onChange: (sortOrder: 'asc' | 'desc') => void;
  className?: string;
};

export const SortOrderFilter = ({ value, onChange, className }: SortOrderFilterProps) => (
  <div className={`flex gap-2 items-center min-w-[140px] ${className || ''}`}>
    <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
      Sort:
    </span>
    <ReactSelect
      value={value}
      onChange={(v) => onChange(v as 'asc' | 'desc')}
      options={[
        { value: 'desc', label: 'Newest First' },
        { value: 'asc', label: 'Oldest First' },
      ]}
      className="flex-1 sm:min-w-[120px] sm:flex-initial"
    />
  </div>
);
