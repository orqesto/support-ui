import { ShieldX, ExternalLink, AlertTriangle, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListCard } from '@/components/ui/ListCard';
import { formatDate } from '@/lib/utils';
import type { SpamLog } from '@/services/spamLog.service';

type SpamLogListItemProps = {
  log: SpamLog;
  onOpen: (log: SpamLog) => void;
};

const getSeverityColor = (severity: number) => {
  if (severity >= 100) return 'danger';
  if (severity >= 75) return 'warning';
  if (severity >= 50) return 'default';
  return 'secondary';
};

const getCategoryIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case 'spam':
      return <ShieldX className="w-4 h-4" />;
    case 'scam':
    case 'phishing':
      return <AlertTriangle className="w-4 h-4" />;
    default:
      return <Mail className="w-4 h-4" />;
  }
};

export const SpamLogListItem = ({ log, onOpen }: SpamLogListItemProps) => (
  <ListCard
    header={
      <>
        {getCategoryIcon(log.category)}
        <Badge variant="secondary">{log.channel}</Badge>
        <Badge variant={getSeverityColor(log.severity)}>Severity: {log.severity}</Badge>
        <Badge variant="default" title={`Confidence: ${(log.confidence * 100).toFixed(0)}%`}>
          {(log.confidence * 100).toFixed(0)}% Confidence
        </Badge>
        {log.departmentRole && <Badge variant="secondary">{log.departmentRole}</Badge>}
      </>
    }
    content={
      <>
        <div className="space-y-1">
          <p className="text-sm font-semibold break-all">{log.senderEmail}</p>
          {log.subject && (
            <p className="text-xs break-all text-muted-foreground">Subject: {log.subject}</p>
          )}
        </div>
        <p className="text-sm break-all text-muted-foreground line-clamp-2">
          {log.contentSnippet ?? 'No content preview'}
        </p>
        {log.redFlags && log.redFlags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {log.redFlags.slice(0, 3).map((flag) => (
              <Badge key={flag} variant="danger" className="text-xs">
                {flag}
              </Badge>
            ))}
            {log.redFlags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{log.redFlags.length - 3} more
              </Badge>
            )}
          </div>
        )}
      </>
    }
    metadata={
      <>
        <span className="font-mono text-xs">ID: {log.id}</span>
        <span className="break-all">• {log.senderDomain}</span>
        <span>• {log.category}</span>
        <span>• Rule: {log.ruleName}</span>
        {log.messageSourceName && <span>• Source: {log.messageSourceName}</span>}
        <span className="whitespace-nowrap" title={formatDate(log.detectedAt)}>
          • {formatDate(log.detectedAt)}
        </span>
      </>
    }
    actions={
      <Button size="sm" variant="outline" onClick={() => onOpen(log)}>
        <ExternalLink className="mr-1 w-3 h-3" />
        View Details
      </Button>
    }
  />
);
