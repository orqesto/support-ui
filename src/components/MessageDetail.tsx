import { useState } from 'react';
import type { Message } from '../types';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from './ui/Dialog';
import { formatDate } from '../lib/utils';
import { Mail, MessageSquare, Send, Check, X, Trash2, AlertTriangle, CheckCircle, Info, ExternalLink, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';

type MessageDetailProps = {
  message: Message;
  onApprove?: () => void;
  onReject?: () => void;
  onReopen?: () => void;
  onDelete?: () => void;
};

export const MessageDetail = ({ message, onApprove, onReject, onReopen, onDelete }: MessageDetailProps) => {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);

  const handleRejectClick = () => {
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    setRejectDialogOpen(false);
    onReject?.();
  };

  const handleReopenClick = () => {
    setReopenDialogOpen(true);
  };

  const handleReopenConfirm = () => {
    setReopenDialogOpen(false);
    onReopen?.();
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="h-5 w-5" />;
      case 'slack':
      case 'telegram':
        return <MessageSquare className="h-5 w-5" />;
      default:
        return <Send className="h-5 w-5" />;
    }
  };

  // Extract AI analysis from metadata (actual backend structure)
  const analysis = message.metadata?.analysis as {
    isTicketWorthy?: boolean;
    needsMoreInfo?: boolean;
    suggestedCategory?: string;
    suggestedPriority?: string;
    confidence?: number;
    summary?: string;
  } | undefined;

  const spamCheck = message.metadata?.spamCheck as {
    isSpam?: boolean;
    confidence?: number;
    category?: string;
    reason?: string;
    redFlags?: string[];
  } | undefined;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            {getChannelIcon(message.channel)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{message.channel}</Badge>
              {message.processed && <Badge variant="success">Processed</Badge>}
              {message.ticketId && <Badge variant="default">Has Ticket</Badge>}
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">From</p>
          <p className="text-lg font-semibold">{message.sender}</p>
        </div>

        {message.subject && (
          <div>
            <p className="text-sm text-muted-foreground">Subject</p>
            <p className="font-medium">{message.subject}</p>
          </div>
        )}

        <div>
          <p className="text-sm text-muted-foreground">Received</p>
          <p className="text-sm">{formatDate(message.createdAt)}</p>
        </div>

        {/* Link to Ticket */}
        {message.ticketId && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">Linked Ticket</p>
                <p className="text-xs text-blue-700">Ticket #{message.ticketId}</p>
              </div>
              <Link 
                to={`/tickets?id=${message.ticketId}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-md transition-colors"
              >
                View Ticket
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Message Content */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Message</h3>
        <div className="prose prose-sm max-w-none">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        </div>
      </div>

      {/* AI Analysis */}
      {(analysis || spamCheck) && (
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">AI Analysis</h3>
          <div className="space-y-4">
            {/* Status Indicators */}
            <div className="grid grid-cols-2 gap-3">
              {/* Spam Check */}
              {spamCheck && (
                <div className={`p-3 rounded-lg border ${
                  spamCheck.isSpam === false 
                    ? 'bg-green-50 border-green-200' 
                    : spamCheck.isSpam === true 
                    ? 'bg-red-50 border-red-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {spamCheck.isSpam === false ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : spamCheck.isSpam === true ? (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    ) : (
                      <Info className="h-4 w-4 text-gray-600" />
                    )}
                    <span className="text-xs font-semibold">Spam Check</span>
                  </div>
                  <p className="text-sm font-medium">
                    {spamCheck.isSpam === false ? 'Not Spam' : spamCheck.isSpam === true ? 'Spam Detected' : 'Unknown'}
                  </p>
                  {spamCheck.category && (
                    <p className="text-xs text-muted-foreground mt-1 capitalize">{spamCheck.category}</p>
                  )}
                </div>
              )}

              {/* Ticket Worthy */}
              {analysis && (
                <div className={`p-3 rounded-lg border ${
                  analysis.isTicketWorthy 
                    ? 'bg-blue-50 border-blue-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {analysis.isTicketWorthy ? (
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Info className="h-4 w-4 text-gray-600" />
                    )}
                    <span className="text-xs font-semibold">Ticket Worthy</span>
                  </div>
                  <p className="text-sm font-medium">
                    {analysis.isTicketWorthy ? 'Yes' : 'No'}
                  </p>
                  {analysis.confidence !== undefined && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Confidence: {Math.round(analysis.confidence * 100)}%
                    </p>
                  )}
                </div>
              )}

              {/* Needs More Info */}
              {analysis?.needsMoreInfo !== undefined && (
                <div className={`p-3 rounded-lg border ${
                  analysis.needsMoreInfo 
                    ? 'bg-yellow-50 border-yellow-200' 
                    : 'bg-green-50 border-green-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {analysis.needsMoreInfo ? (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    <span className="text-xs font-semibold">Info Complete</span>
                  </div>
                  <p className="text-sm font-medium">
                    {analysis.needsMoreInfo ? 'Needs More Info' : 'Complete'}
                  </p>
                </div>
              )}

              {/* Priority */}
              {analysis?.suggestedPriority && (
                <div className="p-3 rounded-lg border bg-purple-50 border-purple-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Info className="h-4 w-4 text-purple-600" />
                    <span className="text-xs font-semibold">Priority</span>
                  </div>
                  <p className="text-sm capitalize font-medium">{analysis.suggestedPriority}</p>
                </div>
              )}
            </div>

            {/* Category */}
            {analysis?.suggestedCategory && (
              <div className="p-3 rounded-lg border bg-indigo-50 border-indigo-200">
                <div className="flex items-center gap-2 mb-1">
                  <Info className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-semibold">Suggested Category</span>
                </div>
                <p className="text-sm font-medium">{analysis.suggestedCategory}</p>
              </div>
            )}

            {/* Summary */}
            {analysis?.summary && (
              <div className="p-3 rounded-lg border bg-blue-50 border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold">AI Summary</span>
                </div>
                <p className="text-sm text-blue-900">{analysis.summary}</p>
              </div>
            )}

            {/* Spam Reason */}
            {spamCheck?.reason && (
              <div className="p-3 rounded-lg border bg-gray-50 border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-gray-600" />
                  <span className="text-xs font-semibold">Detection Reason</span>
                </div>
                <p className="text-sm text-gray-700">{spamCheck.reason}</p>
              </div>
            )}

            {/* Red Flags */}
            {spamCheck?.redFlags && spamCheck.redFlags.length > 0 && (
              <div className="p-3 rounded-lg border bg-red-50 border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-semibold">Red Flags</span>
                </div>
                <ul className="space-y-1">
                  {spamCheck.redFlags.map((flag: string, index: number) => (
                    <li key={index} className="text-sm text-red-700 flex items-start gap-2">
                      <span className="mt-1">•</span>
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metadata */}
      {message.metadata && (() => {
        // Filter out embedding fields and already-displayed analysis/spamCheck
        const { embedding, embeddingString, analysis, spamCheck, ...displayMetadata } = message.metadata;
        return Object.keys(displayMetadata).length > 0 ? (
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Additional Information</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <pre className="text-xs overflow-auto">
                {JSON.stringify(displayMetadata, null, 2)}
              </pre>
            </div>
          </div>
        ) : null;
      })()}

      {/* Actions */}
      <div className="border-t pt-6 flex gap-2">
        {!message.processed ? (
          <>
            {onApprove && (
              <Button onClick={onApprove} className="flex-1">
                <Check className="h-4 w-4 mr-2" />
                Create Ticket
              </Button>
            )}
            {onReject && (
              <Button onClick={handleRejectClick} variant="outline" className="flex-1">
                <X className="h-4 w-4 mr-2" />
                Mark as Processed
              </Button>
            )}
          </>
        ) : (
          <>
            {!message.ticketId && onReopen && (
              <Button onClick={handleReopenClick} variant="outline" className="flex-1">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reopen Message
              </Button>
            )}
            {message.ticketId && (
              <div className="flex-1 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-900 font-medium">
                  Ticket already created - Cannot reopen
                </p>
              </div>
            )}
          </>
        )}
        {onDelete && (
          <Button onClick={onDelete} variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        )}
      </div>

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Processed?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to mark this message as processed without creating a ticket?
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRejectConfirm}>
              Mark as Processed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Confirmation Dialog */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Message?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to reopen this message? It will be marked as unprocessed and 
            will appear in your unprocessed messages list again.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReopenConfirm}>
              Reopen Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
