import { useQuery } from '@tanstack/react-query';
import { Select, type Option, type SelectSize } from '@/components/ui/Select';
import { messageService } from '@/services/message.service';

const ALL_SOURCES = 'all';
/** The rows that come from no mailbox (the KB list's `messageSourceId=none`). */
const NO_SOURCE = 'none';

interface MessageSourceFilterProps {
  /** Selected source id as a string, 'all', or (with `includeNoSource`) 'none'. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Offer "No source" (value 'none') — only where the list's endpoint understands it (KB). */
  includeNoSource?: boolean;
  /** Match the row it sits in: 'sm' beside h-8 buttons (KB), 'md' beside a 40px search box. */
  size?: SelectSize;
}

/**
 * Reusable message-source (channel) filter. Self-fetches the org's sources from the
 * VIEW_MESSAGES-scoped `/api/messages/sources` endpoint so it drops into any list view
 * (Needs Routing now; Q&A-Pairs / KB-Documents next). Soft filter — always offers an
 * "All sources" reset so results never appear to vanish.
 */
export const MessageSourceFilter = ({
  value,
  onChange,
  className,
  includeNoSource = false,
  size = 'sm',
}: MessageSourceFilterProps) => {
  const { data: sources = [] } = useQuery({
    queryKey: ['message-sources-filter'],
    queryFn: () => messageService.getMessageSourcesForFilter(),
    staleTime: 5 * 60 * 1000,
  });

  const options: Option[] = [
    { value: ALL_SOURCES, label: 'All sources' },
    ...(includeNoSource ? [{ value: NO_SOURCE, label: 'No source' }] : []),
    ...sources.map((source) => ({ value: String(source.id), label: source.name })),
  ];

  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      aria-label="Filter by message source"
      size={size}
      className={className}
    />
  );
};

export { ALL_SOURCES, NO_SOURCE };
