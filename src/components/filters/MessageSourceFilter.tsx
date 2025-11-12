import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { integrationsService, type Integration } from '@/services/integrations.service';

type MessageSourceFilterProps = {
  value: string | undefined;
  onChange: (value: string) => void;
  className?: string;
};

export const MessageSourceFilter = ({ value, onChange, className }: MessageSourceFilterProps) => {
  const [messageSources, setMessageSources] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const response = await integrationsService.getAll();
        if (response.success && response.data) {
          // Filter to only message sources (email, gmail, telegram, slack)
          const sources = response.data.filter((integration) =>
            ['email', 'gmail', 'telegram', 'slack'].includes(integration.type)
          );
          setMessageSources(sources);
        }
      } catch (error) {
        console.error('Failed to fetch message sources:', error);
      } finally {
        setLoading(false);
      }
    };
    void fetchSources();
  }, []);

  if (loading || messageSources.length === 0) {
    return null;
  }

  return (
    <div className={`flex gap-2 items-center ${className ?? ''}`}>
      <span className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
        <Inbox className="inline w-3 h-3 mr-1" />
        Source:
      </span>
      <Select
        value={value ?? 'all'}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 pr-8 h-8 text-xs"
        aria-label="Filter by message source"
      >
        <option value="all">All Sources</option>
        {messageSources.map((source) => (
          <option key={source.id} value={source.id.toString()}>
            {source.name}
          </option>
        ))}
      </Select>
    </div>
  );
};
