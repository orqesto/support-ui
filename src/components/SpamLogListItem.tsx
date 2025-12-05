// src/components/SpamLogListItem.tsx
import { ExternalLink, CheckCircle, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListCard } from '@/components/ui/ListCard';
import type { SpamLog } from '@/services/spamLog.service';

type SpamLogListItemProps = {
  log: SpamLog;
  onOpen: (log: SpamLog) => void;
};


export const SpamLogListItem = ({ log, onOpen }: SpamLogListItemProps) => {
  // Add defensive check at the beginning
  if (!log) return null;

  const getConfidenceBadge = () => {
    const confidence = log.confidence ?? 0;
    const percentage = Math.round(confidence * 100);
    
    // Choose variant based on confidence level
    let variant: 'success' | 'warning' | 'danger' | 'default' = 'default';
    if (percentage >= 80) {
      variant = 'success';
    } else if (percentage >= 50) {
      variant = 'warning';
    } else {
      variant = 'danger';
    }

    return (
      <Badge variant={variant} className="flex gap-1 items-center">
        <CheckCircle className="w-3 h-3" />
        {percentage}%
      </Badge>
    );
  };

  const getCategoryBadge = () => {
    const categoryColors: Record<SpamLog['category'], string> = {
      spam: 'bg-red-500 text-white',
      promotional: 'bg-yellow-500 text-white',
      transactional: 'bg-blue-500 text-white',
      invalid_response: 'bg-purple-500 text-white',
      other: 'bg-gray-500 text-white',
    };

    return (
      <Badge className={`${categoryColors[log.category]} capitalize`}>
        {log.category.replace('_', ' ')}
      </Badge>
    );
  };


  const spamScore = log.severity;
  
  // Format date to be human-readable
  const getRelativeTime = (dateString: string) => {
    try {
      const d = new Date(dateString);
      if (Number.isNaN(d.getTime())) return dateString;
      const pad = (n: number) => n.toString().padStart(2, '0');
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const year = d.getFullYear();
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
    } catch (e) {
      return dateString;
    }
  };

  console.log('Full log object:', log);

  return (
    <ListCard
      header={
        <>
          <Mail className="w-4 h-4" />
          <Badge variant="secondary">{log.channel}</Badge>
          {getConfidenceBadge()}
          {getCategoryBadge()}
          <Badge className="font-mono">
            Score: {spamScore ? spamScore.toFixed(2) : '0'} {/* Safe fallback */}
          </Badge>
        </>
      }
      content={
        <>
          <div className="space-y-1">
            <p className="text-sm font-semibold break-all">From: {log.senderEmail}</p>
            {log.subject && (
              <p className="text-xs break-all text-muted-foreground">Subject: {log.subject}</p>
            )}
            <p className="text-sm text-muted-foreground">{log.reason}</p>
          </div>
          <p className="text-sm break-all text-muted-foreground line-clamp-2">{log.content}</p>
        </>
      }
      metadata={
        <>
          <span className="font-mono text-xs">ID: {log.id}</span>
          <span className="break-all">• From: {log.senderEmail}</span>
          <span>• Channel: {log.channel}</span>
          <span>• Score: {spamScore ? spamScore.toFixed(2) : '0.00'}</span> {/* Safe fallback */}
          {log.messageSourceId && (
            <span className="font-mono">• Message ID: {log.messageSourceId}</span>
          )}
          <span className="whitespace-nowrap">• Detected: {getRelativeTime(log.detectedAt)}</span>
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
};