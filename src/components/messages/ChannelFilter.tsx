import { ReactSelect } from '@/components/ui/ReactSelect';

type ChannelFilterProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export const ChannelFilter = ({ value, onChange, className }: ChannelFilterProps) => (
  <div className={`flex gap-2 items-center min-w-[140px] sm:pr-4 ${className || ''}`}>
    <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
      Channel:
    </span>
    <ReactSelect
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: 'All' },
        { value: 'email', label: 'Email' },
        { value: 'telegram', label: 'Telegram' },
        { value: 'slack', label: 'Slack' },
      ]}
      className="flex-1 sm:min-w-[120px] sm:flex-initial"
    />
  </div>
);
