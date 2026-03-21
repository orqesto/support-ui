import { ShieldX, AlertTriangle, Clock, ExternalLink, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { getChannelIcon } from '@/lib/messageHelpers';
import { formatAge, formatDate } from '@/lib/utils';
import type { SpamLog } from '@/services/spamLog.service';

type SpamLogListItemProps = {
  log: SpamLog;
  onOpen: (log: SpamLog) => void;
};

const getSeverityVariant = (severity: number): 'danger' | 'warning' | 'default' | 'secondary' => {
  if (severity >= 100) return 'danger';
  if (severity >= 75) return 'warning';
  if (severity >= 50) return 'default';
  return 'secondary';
};

const getCategoryIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case 'spam':
      return <ShieldX className="w-3.5 h-3.5" />;
    case 'scam':
    case 'phishing':
      return <AlertTriangle className="w-3.5 h-3.5" />;
    default:
      return <Paperclip className="w-3.5 h-3.5" />;
  }
};

export const SpamLogListItem = ({ log, onOpen }: SpamLogListItemProps) => (
  <Card className="overflow-hidden transition-shadow hover:shadow-sm">
    <CardContent className="p-3">

      {/* Row 1: channel icon + sender + age + Open */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-muted-foreground">{getChannelIcon(log.channel)}</span>
        <span className="text-sm font-semibold truncate flex-1 min-w-0">{log.senderEmail}</span>
        <span
          className="text-xs text-muted-foreground whitespace-nowrap shrink-0"
          title={`Detected: ${formatDate(log.detectedAt)}`}
        >
          <Clock className="inline w-3 h-3 mr-0.5 -mt-0.5" />
          {formatAge(log.detectedAt)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpen(log)}
          className="shrink-0 h-7 gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </Button>
      </div>

      {/* Row 2: subject */}
      {log.subject && (
        <p className="text-xs text-muted-foreground truncate mt-0.5 pl-5">
          {log.subject}
        </p>
      )}

      {/* Row 3: content preview */}
      <p className="text-sm text-muted-foreground line-clamp-2 mt-1 pl-5 break-words">
        {log.contentSnippet ?? 'No content preview'}
      </p>

      {/* Row 4: badges + ID */}
      <div className="flex flex-wrap gap-1.5 items-center mt-2">

        {/* Category */}
        <Badge
          variant={log.category === 'spam' ? 'danger' : log.category === 'suspicious' ? 'warning' : 'default'}
          className="flex gap-1 items-center h-5 px-1.5"
        >
          {getCategoryIcon(log.category)}
          {log.category}
        </Badge>

        {/* Severity */}
        <Badge variant={getSeverityVariant(log.severity)} className="h-5 px-1.5">
          Sev {log.severity}
        </Badge>

        {/* Confidence */}
        <Badge variant="secondary" className="h-5 px-1.5">
          {(log.confidence * 100).toFixed(0)}% conf
        </Badge>

        {/* Rule */}
        {log.ruleName && (
          <Badge variant="default" className="h-5 px-1.5" title={log.ruleName}>
            {log.ruleName.replace(/^(Pattern matched:|Rule:)\s*/i, '').substring(0, 20).trim()}
            {log.ruleName.length > 20 ? '…' : ''}
          </Badge>
        )}

        {/* Red flags — first 2, short labels only */}
        {log.redFlags?.slice(0, 2).map((flag) => {
          const label = flag.replace(/^⚠️\s*/, '').replace(/^SECURITY:\s*/i, '').substring(0, 18).trim();
          return (
            <Badge key={flag} variant="danger" className="h-5 px-1.5" title={flag}>
              {label}{flag.length > 18 ? '…' : ''}
            </Badge>
          );
        })}
        {(log.redFlags?.length ?? 0) > 2 && (
          <Badge variant="secondary" className="h-5 px-1.5">
            +{log.redFlags.length - 2}
          </Badge>
        )}

        {/* Department */}
        {log.departmentRole && (
          <Badge variant="secondary" className="h-5 px-1.5">
            {log.departmentRole}
          </Badge>
        )}

        {/* Source */}
        {log.messageSourceName && (
          <Badge variant="secondary" className="h-5 px-1.5 max-w-[100px] truncate" title={log.messageSourceName}>
            {log.messageSourceName}
          </Badge>
        )}

        {/* ID */}
        <span className="ml-auto font-mono text-xs text-muted-foreground shrink-0">
          #{log.id}
        </span>
      </div>

    </CardContent>
  </Card>
);
