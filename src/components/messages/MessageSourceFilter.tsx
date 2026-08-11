import { useQuery } from '@tanstack/react-query';
import { ReactSelect, type Option } from '@/components/ui/ReactSelect';
import { messageService } from '@/services/message.service';

const ALL_SOURCES = 'all';

interface MessageSourceFilterProps {
  /** Selected source id as a string, or 'all'. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Reusable message-source (channel) filter. Self-fetches the org's sources from the
 * VIEW_MESSAGES-scoped `/api/messages/sources` endpoint so it drops into any list view
 * (Needs Routing now; Q&A-Pairs / KB-Documents next). Soft filter — always offers an
 * "All sources" reset so results never appear to vanish.
 */
export const MessageSourceFilter = ({ value, onChange, className }: MessageSourceFilterProps) => {
  const { data: sources = [] } = useQuery({
    queryKey: ['message-sources-filter'],
    queryFn: () => messageService.getMessageSourcesForFilter(),
    staleTime: 5 * 60 * 1000,
  });

  const options: Option[] = [
    { value: ALL_SOURCES, label: 'All sources' },
    ...sources.map((source) => ({ value: String(source.id), label: source.name })),
  ];

  return (
    <ReactSelect
      value={value}
      onChange={onChange}
      options={options}
      aria-label="Filter by message source"
      className={className}
    />
  );
};

export { ALL_SOURCES };
