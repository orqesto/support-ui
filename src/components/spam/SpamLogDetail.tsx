import { ShieldX, Mail, AlertTriangle, Info, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import type { SpamLog } from '@/services/spamLog.service';

type SpamLogDetailProps = {
  log: SpamLog;
  onClose: () => void;
};

const getSeverityColor = (severity: number): string => {
  if (severity >= 100) return 'bg-red-600';
  if (severity >= 75) return 'bg-orange-500';
  if (severity >= 50) return 'bg-yellow-500';
  return 'bg-gray-500';
};

export const SpamLogDetail = ({ log, onClose }: SpamLogDetailProps) => (
  <div className="flex overflow-y-auto flex-col h-full">
    {/* Header */}
    <div className="p-6 border-b">
      <div className="flex justify-between items-start mb-4">
        <div className="flex gap-2 items-center">
          <ShieldX className="w-6 h-6 text-red-600" />
          <h2 className="text-xl font-bold">Spam Log Details</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{log.channel}</Badge>
        <Badge variant="default">{log.category}</Badge>
        {log.departmentRole && <Badge variant="secondary">{log.departmentRole}</Badge>}
        <Badge variant="default" className={`${getSeverityColor(log.severity)} text-white`}>
          Severity: {log.severity}
        </Badge>
        <Badge variant="default">Confidence: {(log.confidence * 100).toFixed(0)}%</Badge>
      </div>
    </div>

    {/* Content */}
    <div className="flex-1 p-6 space-y-6">
      {/* Sender Info */}
      <div>
        <h3 className="flex gap-2 items-center mb-2 text-sm font-semibold">
          <Mail className="w-4 h-4" />
          Sender Information
        </h3>
        <div className="p-4 space-y-2 rounded-lg bg-muted">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <span className="text-sm font-medium">Email:</span>
            <span className="text-sm break-all">{log.senderEmail}</span>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <span className="text-sm font-medium">Domain:</span>
            <span className="text-sm">{log.senderDomain}</span>
          </div>
          {log.messageSourceName && (
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <span className="text-sm font-medium">Source:</span>
              <span className="text-sm">{log.messageSourceName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Subject */}
      {log.subject && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Subject</h3>
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm break-all">{log.subject}</p>
          </div>
        </div>
      )}

      {/* Content */}
      {log.content && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Content</h3>
          <div className="p-4 max-h-96 overflow-y-auto rounded-lg bg-muted">
            <p className="text-sm break-all ">{log.content}</p>
          </div>
        </div>
      )}

      {/* Detection Info */}
      <div>
        <h3 className="flex gap-2 items-center mb-2 text-sm font-semibold">
          <AlertTriangle className="w-4 h-4" />
          Detection Information
        </h3>
        <div className="p-4 space-y-2 rounded-lg bg-muted">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <span className="text-sm font-medium">Rule:</span>
            <span className="text-sm">{log.ruleName}</span>
          </div>
          {log.matchedPattern && (
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <span className="text-sm font-medium">Pattern:</span>
              <span className="text-sm font-mono break-all">{log.matchedPattern}</span>
            </div>
          )}
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <span className="text-sm font-medium">Detected:</span>
            <span className="text-sm">{formatDate(log.detectedAt)}</span>
          </div>
        </div>
      </div>

      {/* Red Flags */}
      {log.redFlags && log.redFlags.length > 0 && (
        <div>
          <h3 className="flex gap-2 items-center mb-2 text-sm font-semibold text-red-600">
            <AlertTriangle className="w-4 h-4" />
            Red Flags ({log.redFlags.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {log.redFlags.map((flag) => (
              <Badge key={flag} variant="danger">
                {flag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Green Flags */}
      {log.greenFlags && log.greenFlags.length > 0 && (
        <div>
          <h3 className="flex gap-2 items-center mb-2 text-sm font-semibold text-green-600">
            <Info className="w-4 h-4" />
            Green Flags ({log.greenFlags.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {log.greenFlags.map((flag) => (
              <Badge key={flag} variant="default" className="bg-green-600 text-white">
                {flag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Metadata</h3>
        <div className="p-4 space-y-1 rounded-lg bg-muted">
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span className="font-mono">ID: {log.id}</span>
            {log.spamRuleId && (
              <>
                <span>•</span>
                <span>Rule ID: {log.spamRuleId}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);
