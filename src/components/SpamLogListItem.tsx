// src/components/SpamLogListItem.tsx
import { ExternalLink, ShieldX, AlertTriangle, CheckCircle, XCircle, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListCard } from '@/components/ui/ListCard';
import { formatDate } from '@/lib/utils';
import type { SpamLog } from '@/services/spamLog.service';

type SpamLogListItemProps = {
  log: SpamLog;
  onOpen: (log: SpamLog) => void;
};


export const SpamLogListItem = ({ log, onOpen }: SpamLogListItemProps) => {
  // Add defensive check at the beginning
  if (!log) return null;

  const getStatusBadge = () => {
    const statusConfig = {
      pending: { variant: 'warning' as const, icon: AlertTriangle, label: 'Pending' },
      confirmed: { variant: 'danger' as const, icon: ShieldX, label: 'Confirmed' },
      false_positive: { variant: 'success' as const, icon: CheckCircle, label: 'False Positive' },
      whitelisted: { variant: 'default' as const, icon: CheckCircle, label: 'Whitelisted' },
      blocked: { variant: 'danger' as const, icon: ShieldX, label: 'Blocked' },
      allowed: { variant: 'success' as const, icon: CheckCircle, label: 'Allowed' },
      review: { variant: 'warning' as const, icon: AlertTriangle, label: 'Needs Review' },
      spam: { variant: 'danger' as const, icon: ShieldX, label: 'Spam' },
      ham: { variant: 'success' as const, icon: CheckCircle, label: 'Not Spam' },
      approved: { variant: 'success' as const, icon: CheckCircle, label: 'Approved' },
      rejected: { variant: 'danger' as const, icon: XCircle, label: 'Rejected' },
    } as const;

   
    const normalizedStatus = (log.status || 'unknown').toLowerCase().trim().replace(/\s+/g, '_');
    
    
    const config = statusConfig[normalizedStatus as keyof typeof statusConfig] || {
      variant: 'outline' as const,
      icon: AlertTriangle,
      label: log.status || 'Unknown',
    };

    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex gap-1 items-center">
        <Icon className="w-3 h-3" />
        {config.label}
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
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  };

  console.log('Full log object:', log);

  return (
    <ListCard
      header={
        <>
          <Mail className="w-4 h-4" />
          <Badge variant="secondary">{log.channel}</Badge>
          {getStatusBadge()}
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