import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { logger } from '@/lib/logger';
import { MESSAGE_SOURCE_TYPES } from '@/types';

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
            (MESSAGE_SOURCE_TYPES as readonly string[]).includes(integration.type)
          );
          setMessageSources(sources);
        }
      } catch (error) {
        logger.error('Failed to fetch message sources:', error);
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
        <Inbox className="inline mr-1 w-3 h-3" />
        Source:
      </span>
      <ReactSelect
        value={value ?? 'all'}
        onChange={(value) => onChange(value)}
        options={[
          { value: 'all', label: 'All Sources' },
          ...messageSources.map((source) => ({
            value: source.id.toString(),
            label: source.name,
          })),
        ]}
        className="min-w-[120px]"
      />
    </div>
  );
};
