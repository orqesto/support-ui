// src/components/SpamLogDetail.tsx
import { useState } from 'react';
import {
  CheckCircle,
  Mail,
  Calendar,
  Flag,
  MessageSquare,
  Download,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import type { SpamLog } from '@/services/spamLog.service';

type SpamLogDetailProps = {
  log: SpamLog;
  onUpdateStatus?: (status: SpamLog['status'], notes?: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onReanalyze?: () => Promise<void>;
  onExport?: () => void;
  onClose?: () => void;
};

export const SpamLogDetail = ({
  log,
  onDelete,
  onReanalyze,
  onExport,
  onClose,
}: SpamLogDetailProps) => {
  const [deleting, setDeleting] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const handleReanalyze = async () => {
    if (!onReanalyze) return;
    
    setReanalyzing(true);
    try {
      await onReanalyze();
    } finally {
      setReanalyzing(false);
    }
  };

  const handleExport = () => {
    if (onExport) {
      onExport();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex flex-col gap-4 justify-between items-start sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-semibold">Spam Log Details</h3>
          <p className="text-sm text-muted-foreground">ID: {log.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onExport && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 w-4 h-4" />
              Export
            </Button>
          )}
          {onReanalyze && (
            <Button variant="outline" size="sm" onClick={handleReanalyze} disabled={reanalyzing}>
              <RefreshCw className={`mr-2 w-4 h-4 ${reanalyzing ? 'animate-spin' : ''}`} />
              Reanalyze
            </Button>
          )}
          {onDelete && (
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="mr-2 w-4 h-4" />
              Delete
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Status update buttons */}
     
      

      {/* Main content */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Left column - Info */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">x
              <h4 className="font-semibold flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Sender Information
              </h4>
              <div className="space-y-1 text-sm">
                <p><strong>From:</strong> {log.senderEmail}</p>
                <p><strong>Channel:</strong> {log.channel}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Flag className="w-4 h-4" />
                Classification
              </h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Score: {log.severity ? log.severity.toFixed(2) : '0.00'}</Badge>
                <Badge className="capitalize">{log.category.replace('_', ' ')}</Badge>
                
              </div>
              <p className="text-sm"><strong>Reason:</strong> {log.reason}</p>
            </div>

            {/* Red Flags */}
            {log.redFlags && log.redFlags.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-red-600 flex items-center gap-2">
                  <Flag className="w-4 h-4" />
                  Red Flags
                </h4>
                <div className="space-y-1">
                  {log.redFlags.map((flag) => (
                    <p key={flag} className="text-sm text-red-600 flex items-start gap-2">
                      <span className="text-red-600 mt-1">•</span>
                      <span>{flag}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Green Flags */}
            {log.greenFlags && log.greenFlags.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-green-600 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Green Flags
                </h4>
                <div className="space-y-1">
                  {log.greenFlags.map((flag) => (
                    <p key={flag} className="text-sm text-green-600 flex items-start gap-2">
                      <span className="text-green-600 mt-1">•</span>
                      <span>{flag}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Timeline
              </h4>
              <div className="space-y-1 text-sm">
                <p><strong>Detected:</strong> {formatDateTime(log.detectedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right column - Message content */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Message Content
              </h4>
              {log.subject && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Subject:</p>
                  <p className="text-sm p-2 rounded bg-muted">{log.subject}</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium">Content:</p>
                <div className="p-3 rounded bg-muted max-h-60 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{log.content}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Related message link */}
      {log.messageSourceId && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Related Message</h4>
                  <p className="text-sm text-muted-foreground">
                    This spam log is associated with message #{log.messageSourceId}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  window.open(`/messages?id=${log.messageSourceId}`, '_blank');
                }}>
                  View Message
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
};