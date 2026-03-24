import { useState, useRef, useEffect } from 'react';
import {
  Check,
  Send,
  RefreshCw,
  X,
  Trash2,
  RotateCcw,
  LinkIcon,
  CheckCircle,
  Maximize2,
  BookOpen,
  Paperclip,
  File,
  ExternalLink,
  AlertTriangle,
  Search,
  Info,
  Reply,
  XCircle,
  Tag,
  Plus,
  Target,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import { ContradictionAlert } from './ContradictionAlert';
import { MessageAIAnalysis } from './MessageAIAnalysis';
import { MessageAttachments } from './MessageAttachments';
import { MessageBadges } from './MessageBadges';
import { MessageKBReferences } from './MessageKBReferences';
import { MessageThread } from './MessageThread';
import type { ContradictionCheckMetadata } from '@/types/ai';
import RichTextEditor, { type RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { ScrollButtons } from '@/components/shared/ScrollButtons';
import { SimilarMessagesDialog } from '@/components/modals/SimilarMessagesDialog';
import { SimilarTickets } from '@/components/tickets/SimilarTickets';
import { LeadQualificationPanel } from '@/components/tickets/LeadQualificationPanel';
import { TranslateButton } from '@/components/shared/TranslateButton';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useResolveMessageToKB } from '@/hooks/useResolveMessageToKB';
import { usePermissions } from '@/hooks/usePermissions';
import { LinkifiedText } from '@/lib/linkify';
import { formatDate } from '@/lib/utils';
import { stripHtml } from '@/lib/stripHtml';
import { messageService } from '@/services/message.service';
import { categoryService } from '@/services/category.service';
import { labelService, type Label } from '@/services/settings.service';
import {
  organizationService,
  type LeadQualificationFieldConfig,
} from '@/services/organization.service';
import { MessageNotes } from './MessageNotes';
import type { Message, Category, TicketPriority, MessageStatus } from '@/types';
import { Permission } from '@/types/roles';

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'text-green-700 bg-green-500/25 border-green-500/60 font-semibold',
  medium: 'text-yellow-700 bg-yellow-500/25 border-yellow-500/60 font-semibold',
  high: 'text-orange-700 bg-orange-500/25 border-orange-500/60 font-semibold',
  critical: 'text-red-700 bg-red-500/25 border-red-500/60 font-semibold',
};

const STATUS_LABELS: Record<MessageStatus, string> = {
  new: 'Open',
  in_progress: 'In Progress',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
  filtered: 'Filtered',
};

type MessageDetailProps = {
  message: Message;
  onApprove?: () => void;
  onReject?: () => void;
  onReopen?: () => void;
  onDelete?: () => void;
  onResolve?: () => Promise<void>;
  onRefresh?: () => void;
  onMessageNavigate?: (messageId: number) => void;
  onClassify?: (action: 'approve' | 'mark_suspicious') => Promise<void>;
  showFullPageButton?: boolean;
};

export const MessageDetail = ({
  message,
  onApprove,
  onReject,
  onReopen,
  onDelete,
  onResolve,
  onRefresh,
  onMessageNavigate,
  onClassify,
  showFullPageButton = true,
}: MessageDetailProps) => {
  const location = useLocation();
  const isFullPage = location.pathname.startsWith('/messages/');
  const { hasPermission } = usePermissions();
  const hasManageLabels = hasPermission(Permission.MANAGE_LABELS);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [similarMessagesOpen, setSimilarMessagesOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const { resolving, resolveMessage: resolveToKB } = useResolveMessageToKB();
  const [checkingContradiction, setCheckingContradiction] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [closing, setClosing] = useState(false);
  const [togglingLead, setTogglingLead] = useState(false);
  const [classifying, setClassifying] = useState(false);

  const isFiltered = message.status === 'filtered';
  const isSuspicious =
    !isFiltered &&
    (message.metadata?.spamCheck as Record<string, unknown> | undefined)?.category === 'suspicious';
  const isActive =
    !message.resolved &&
    !isFiltered &&
    !isSuspicious &&
    message.status !== 'closed' &&
    message.status !== 'resolved';

  const handleClassify = async (action: 'approve' | 'mark_suspicious') => {
    if (!onClassify) return;
    setClassifying(true);
    try {
      await onClassify(action);
    } finally {
      setClassifying(false);
    }
  };
  const [messageLabels, setMessageLabels] = useState<Label[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [leadState, setLeadState] = useState<
    Parameters<typeof LeadQualificationPanel>[0]['leadState'] | null
  >(null);
  const [leadFieldDefs, setLeadFieldDefs] = useState<LeadQualificationFieldConfig[]>([]);
  const labelPickerRef = useRef<HTMLDivElement>(null);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant?: 'error' | 'success' | 'warning' | 'info';
    onClose?: () => void | Promise<void>;
  }>({ open: false, title: '', description: '' });

  useEffect(() => {
    categoryService
      .getAll()
      .then((res) => {
        if (res?.success && res.data) setCategories(res.data);
      })
      .catch(() => {});
    organizationService
      .getLeadConfig()
      .then((cfg) => {
        if (cfg.qualificationFields?.length) setLeadFieldDefs(cfg.qualificationFields);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!message.isLead) {
      setLeadState(null);
      return;
    }
    // Fetch all thread messages and pick the latest leadState across the thread
    messageService
      .getThreadMessages(message.id)
      .then((res) => {
        const threadMessages = res.data ?? [];
        // Sort descending by id so we check the latest first
        const sorted = [...threadMessages].sort((a, b) => b.id - a.id);
        for (const msg of sorted) {
          const state = msg.metadata?.leadState;
          if (state) {
            setLeadState(state as Parameters<typeof LeadQualificationPanel>[0]['leadState']);
            return;
          }
        }
        // Fallback: try the message itself
        const ownState = message.metadata?.leadState;
        setLeadState(
          ownState ? (ownState as Parameters<typeof LeadQualificationPanel>[0]['leadState']) : null
        );
      })
      .catch(() => {
        const ownState = message.metadata?.leadState;
        setLeadState(
          ownState ? (ownState as Parameters<typeof LeadQualificationPanel>[0]['leadState']) : null
        );
      });
  }, [message.id, message.isLead, message.metadata]);

  useEffect(() => {
    Promise.all([labelService.getMessageLabels(message.id), labelService.getLabels()])
      .then(([ml, al]) => {
        setMessageLabels(ml);
        setAllLabels(al);
      })
      .catch(() => {});
  }, [message.id]);

  useEffect(() => {
    if (!showLabelPicker) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (labelPickerRef.current && !labelPickerRef.current.contains(e.target as Node)) {
        setShowLabelPicker(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showLabelPicker]);

  const handleToggleLabel = async (label: Label) => {
    const assigned = messageLabels.some((l) => l.id === label.id);
    try {
      if (assigned) {
        await labelService.removeLabelFromMessage(message.id, label.id);
        setMessageLabels((prev) => prev.filter((l) => l.id !== label.id));
      } else {
        await labelService.assignLabelToMessage(message.id, label.id);
        setMessageLabels((prev) => [...prev, label]);
      }
    } catch (error) {
      console.error('Failed to toggle label:', error);
    }
  };

  const handleSetStatus = async (status: MessageStatus) => {
    try {
      setUpdatingStatus(true);
      await messageService.setStatus(message.id, status);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to set status:', error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSetPriority = async (priority: TicketPriority) => {
    try {
      setUpdatingPriority(true);
      await messageService.setPriority(message.id, priority);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to set priority:', error);
    } finally {
      setUpdatingPriority(false);
    }
  };

  const handleSetCategory = async (categoryId: number | null) => {
    try {
      setUpdatingCategory(true);
      await messageService.setCategory(message.id, categoryId);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to set category:', error);
    } finally {
      setUpdatingCategory(false);
    }
  };

  const handleToggleLead = async () => {
    try {
      setTogglingLead(true);
      await messageService.markAsLead(message.id, !message.isLead);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to toggle lead:', error);
    } finally {
      setTogglingLead(false);
    }
  };

  const handleCloseAsNotLead = async () => {
    try {
      setClosing(true);
      // Unmark as lead first, then close
      await messageService.markAsLead(message.id, false);
      await messageService.close(message.id);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to close as not-lead:', error);
    } finally {
      setClosing(false);
    }
  };

  const handleClose = async () => {
    try {
      setClosing(true);
      await messageService.close(message.id);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to close message:', error);
    } finally {
      setClosing(false);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/messages?id=${message.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy link:', err);
      });
  };

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

  const handleSendReply = async () => {
    if (!replyContent.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      // Send reply without resolving - message stays open for customer response
      // Agent can explicitly resolve using "Resolve & Save to KB" button
      await messageService.replyWithAttachments(
        message.id,
        replyContent,
        selectedFiles,
        false // Don't auto-resolve - message is now awaiting customer response
      );
      setReplyContent('');
      setSelectedFiles([]);
      setShowReplyForm(false);
      onRefresh?.(); // Refresh message data after sending reply
    } catch (error) {
      console.error('Failed to send reply:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveWithoutReply = async () => {
    const result = await resolveToKB(message.id, onResolve);
    if (result) {
      // Show dialog first, then refresh when it closes
      setAlertDialog({
        ...result.alertState,
        onClose: async () => {
          setAlertDialog({ open: false, title: '', description: '', variant: 'info' });
          await result.refresh(); // Refresh AFTER dialog is shown
        },
      });
    }
  };

  const handleCheckContradiction = async () => {
    if (!message.threadId) {
      setAlertDialog({
        open: true,
        title: 'No Thread',
        description:
          'This message is not part of a thread. Contradiction detection requires message history.',
        variant: 'warning',
      });
      return;
    }

    try {
      setCheckingContradiction(true);
      const response = await messageService.checkContradiction(message.id);

      if (response.success && response.data) {
        onRefresh?.();
        setAlertDialog({
          open: true,
          title: response.data.result.hasContradiction
            ? 'Contradiction Detected'
            : 'No Contradiction Found',
          description: response.data.result.hasContradiction
            ? `Found contradiction with confidence: ${response.data.result.confidence}`
            : 'The message appears consistent with previous statements in the thread.',
          variant: response.data.result.hasContradiction ? 'warning' : 'success',
        });
      }
    } catch (err) {
      console.error('Failed to check contradiction:', err);
      setAlertDialog({
        open: true,
        title: 'Check Failed',
        description: 'Failed to check for contradictions. Please try again.',
        variant: 'error',
      });
    } finally {
      setCheckingContradiction(false);
    }
  };

  const convertTextToHtml = (text: string): string =>
    text
      .split('\n\n')
      .filter((para) => para.trim())
      .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('');

  const handleSelectSimilarAnswer = (answer: string) => {
    setReplyContent(convertTextToHtml(answer));
    setShowReplyForm(true);
    // Focus editor after content is set
    setTimeout(() => editorRef.current?.focus(), 100);
  };

  const handleUseResponse = (content: string) => {
    setReplyContent(convertTextToHtml(content));
    setShowReplyForm(true);
    // Focus editor after content is set
    setTimeout(() => editorRef.current?.focus(), 100);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const enrichment = message.metadata?.enrichment as
    | { detectedCategory?: string; routingAttributes?: { lang?: string } }
    | undefined;

  const autoReply = message.metadata?.autoReply as
    | {
        sent?: boolean;
        sentAt?: string;
        missingInfo?: string[];
        replyContent?: string;
      }
    | undefined;

  const suggestedAnswer = message.metadata?.suggestedAnswer as
    | {
        answer: string;
        similarity?: number;
        confidence?: number;
        source?: 'documentation' | 'similar_ticket' | 'similar_message' | 'lead_qualification';
        sourceId?: number;
        sourceMessageId?: number;
        documentationId?: number;
        documentTitle?: string;
        foundAt: string;
      }
    | undefined;

  return (
    <div className="relative space-y-6">
      {/* Only show ScrollButtons in drawer mode (not full-page, page has its own) */}
      {!isFullPage && <ScrollButtons bottomTarget="[data-message-actions]" />}
      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex gap-3 justify-between items-center">
          <MessageBadges message={message} />
          <div className="flex flex-shrink-0 gap-2">
            {showFullPageButton && !isFullPage && (
              <Link to={`/messages/${message.id}`}>
                <Button variant="ghost" size="sm" title="Open in full page">
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </Link>
            )}
            {onRefresh && (
              <Button onClick={onRefresh} variant="ghost" size="sm" title="Refresh message data">
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Message ID</p>
            <p className="font-mono text-sm">#{message.id}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">From</p>
            <div className="flex gap-2 items-center">
              <p className="text-lg font-semibold">{message.sender}</p>
              <Link
                to={`/messages?mode=contacts&sender=${encodeURIComponent(message.sender)}`}
                className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground"
                title="View all conversations with this sender"
              >
                History
              </Link>
            </div>
          </div>
        </div>

        {message.subject && (
          <div>
            <p className="text-sm text-muted-foreground">Subject</p>
            <p className="font-medium">{message.subject}</p>
          </div>
        )}

        <div>
          <p className="text-sm text-muted-foreground">Received</p>
          <p className="text-sm">
            {formatDate(
              (message.metadata as { receivedAt?: string })?.receivedAt ?? message.createdAt
            )}
          </p>
          {(message.metadata as { receivedAt?: string })?.receivedAt && message.createdAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Imported: {formatDate(message.createdAt)}
            </p>
          )}
        </div>
      </div>

      {/* Assignment */}
      <div className="pt-4 border-t">
        <p className="mb-2 text-sm text-muted-foreground">
          Assigned to {message.subject ? '(Thread)' : '(Message)'}
        </p>
        <AssignmentSelect
          type={message.subject ? 'thread' : 'message'}
          itemId={
            message.subject
              ? `subj::${message.subject
                  .replace(/^((re(\[\d+\])?|fwd|fw)\s*:\s*)*/gi, '')
                  .trim()
                  .toLowerCase()}::${message.sender < (message.recipient ?? '') ? message.sender : (message.recipient ?? '')}::${message.sender > (message.recipient ?? '') ? message.sender : (message.recipient ?? '')}`
              : message.id
          }
          currentAssigneeId={message.assigneeId}
          onAssign={onRefresh}
          className="w-full"
        />
      </div>

      {/* Priority, Category, Status */}
      <div className="grid grid-cols-1 gap-3 pt-4 border-t">
        {/* Priority */}
        <div>
          <p className="mb-1 text-sm text-muted-foreground">Priority</p>
          <div className="flex flex-wrap gap-1">
            {(['low', 'medium', 'high', 'critical'] as TicketPriority[]).map((p) => (
              <button
                key={p}
                onClick={() => void handleSetPriority(p)}
                disabled={updatingPriority}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  message.priority === p
                    ? PRIORITY_COLORS[p]
                    : 'text-muted-foreground border-border hover:bg-accent'
                }`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        {categories.length > 0 && (
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Category</p>
            <select
              value={message.categoryId ?? ''}
              onChange={(e) =>
                void handleSetCategory(e.target.value ? Number(e.target.value) : null)
              }
              disabled={updatingCategory}
              className="px-2 py-1 w-full text-sm rounded-md border bg-background border-input focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Status */}
        <div>
          <p className="mb-1 text-sm text-muted-foreground">Status</p>
          <div className="flex flex-wrap gap-1">
            {(['new', 'in_progress', 'pending', 'resolved', 'closed'] as MessageStatus[]).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => void handleSetStatus(s)}
                  disabled={updatingStatus}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                    message.status === s
                      ? 'text-blue-700 bg-blue-500/25 border-blue-500/60 font-semibold'
                      : 'text-muted-foreground border-border hover:bg-accent'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Labels */}
      {allLabels.length > 0 && (
        <div className="pt-4 border-t">
          <p className="mb-2 text-sm text-muted-foreground">Labels</p>
          <div className="flex flex-wrap gap-1 items-center">
            {messageLabels.map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: label.color }}
              >
                {label.name}
                {hasManageLabels && (
                  <button
                    onClick={() => handleToggleLabel(label)}
                    className="transition-opacity hover:opacity-70"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
            {hasManageLabels && (
              <div className="relative" ref={labelPickerRef}>
                <button
                  onClick={() => setShowLabelPicker((v) => !v)}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:bg-accent transition-colors border border-dashed border-border"
                  title="Add label"
                >
                  <Tag className="w-3 h-3" />
                  <Plus className="w-3 h-3" />
                </button>
                {showLabelPicker && (
                  <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-lg border bg-card shadow-md p-1">
                    {allLabels.map((label) => {
                      const isAssigned = messageLabels.some((l) => l.id === label.id);
                      return (
                        <button
                          key={label.id}
                          onClick={() => handleToggleLabel(label)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
                        >
                          <span
                            className="flex-shrink-0 w-3 h-3 rounded-full"
                            style={{ backgroundColor: label.color }}
                          />
                          <span className="flex-1">{label.name}</span>
                          {isAssigned && <span className="text-xs text-muted-foreground">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* KB References - Show KB entries created from this message */}
      <MessageKBReferences messageId={message.id} />

      <div className="space-y-4">
        {/* Link to Ticket */}
        {message.ticketId && (
          <div className="p-3 rounded-lg border bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  Linked Ticket
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Ticket #{message.ticketId}
                </p>
              </div>
              <Link
                to={`/tickets?id=${message.ticketId}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors"
              >
                View Ticket
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Processing Error Alert */}
        {message.processingError && (
          <div className="p-4 bg-red-50 rounded-lg border border-red-200 dark:bg-red-950/20 dark:border-red-800">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="mb-1 font-medium text-red-900 dark:text-red-100">Processing Failed</p>
                <p className="text-sm text-red-700 break-words dark:text-red-300">
                  {message.processingError}
                </p>
                {(message.metadata as { failedAt?: string })?.failedAt && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    Failed at: {formatDate((message.metadata as { failedAt: string }).failedAt)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contradiction Detection Alert */}
      {!!message.metadata?.contradictionCheck && (
        <ContradictionAlert
          contradictionCheck={message.metadata.contradictionCheck as ContradictionCheckMetadata}
        />
      )}

      {/* Similar Resolved Tickets - AI-powered suggestions (hidden for lead qualification messages) */}
      {!message.ticketId &&
        !message.resolved &&
        suggestedAnswer?.source !== 'lead_qualification' && (
          <SimilarTickets messageId={message.id} onUseResponse={handleUseResponse} />
        )}

      {/* Message Content */}
      <div className="pt-6 border-t" data-message-content>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Message</h3>
          <TranslateButton
            messageId={message.id}
            originalContent={message.content}
            originalSubject={message.subject ?? undefined}
            variant="ghost"
            size="sm"
          />
        </div>
        <div className="max-w-none break-words prose prose-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere">
            <LinkifiedText>{stripHtml(message.content)}</LinkifiedText>
          </p>
        </div>
      </div>

      {/* AI Auto-Reply (if sent) */}
      {autoReply?.sent && autoReply.replyContent && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200 dark:bg-green-950/20 dark:border-green-800">
          <div className="flex justify-between items-start mb-3">
            <div className="flex gap-2 items-center">
              <div className="p-1.5 rounded-full bg-green-100 dark:bg-green-900">
                <Send className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
                AI Auto-Reply Sent
              </h3>
            </div>
            {autoReply.sentAt && (
              <span className="text-xs text-green-600 dark:text-green-400">
                {formatDate(new Date(autoReply.sentAt))}
              </span>
            )}
          </div>
          <div className="mb-3 max-w-none break-words prose prose-sm prose-green">
            <p className="text-sm leading-relaxed text-green-900 whitespace-pre-wrap break-words overflow-wrap-anywhere dark:text-green-50">
              <LinkifiedText>{autoReply.replyContent}</LinkifiedText>
            </p>
          </div>
          {autoReply.missingInfo && autoReply.missingInfo.length > 0 && (
            <div className="pt-3 border-t border-green-200 dark:border-green-800">
              <p className="mb-2 text-xs font-medium text-green-700 dark:text-green-300">
                Additional information requested:
              </p>
              <ul className="space-y-1 text-xs text-green-600 dark:text-green-400">
                {autoReply.missingInfo.map((info) => (
                  <li key={info} className="flex gap-2 items-start">
                    <span className="mt-1">•</span>
                    <span>{info}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* AI Suggested Answer - Needs Agent Approval */}
      {suggestedAnswer &&
        !message.resolved &&
        !message.directReply &&
        !message.repliedBy &&
        (suggestedAnswer.source === 'lead_qualification' ? (
          <div className="p-4 mb-6 bg-green-50 rounded-lg border-2 border-green-300 dark:bg-green-950/20 dark:border-green-700">
            <div className="flex gap-2 items-start mb-3">
              <div className="p-2 bg-green-100 rounded-full dark:bg-green-900">
                <Target className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-green-900 dark:text-green-100">
                  Lead Qualification — Next Question
                </h3>
                <p className="text-xs text-green-600 dark:text-green-400">
                  Send this to continue qualifying the lead
                </p>
              </div>
            </div>

            <div className="p-3 bg-white rounded border border-green-200 dark:bg-green-950/40 dark:border-green-800">
              <p className="text-sm text-green-900 whitespace-pre-wrap break-words overflow-wrap-anywhere dark:text-green-50">
                <LinkifiedText>{suggestedAnswer.answer}</LinkifiedText>
              </p>
            </div>

            <div className="flex gap-2 mt-3">
              <Button
                onClick={() => {
                  setReplyContent(convertTextToHtml(suggestedAnswer.answer));
                  setShowReplyForm(true);
                }}
                className="flex-1"
              >
                <Check className="mr-2 w-4 h-4" />
                Use This Message
              </Button>
              <Button onClick={() => setShowReplyForm(true)} variant="outline">
                Write Different Reply
              </Button>
            </div>
          </div>
        ) : suggestedAnswer.source === 'documentation' ? (
          <div className="p-4 mb-6 bg-blue-50 rounded-lg border-2 border-blue-300 dark:bg-blue-950/20 dark:border-blue-700">
            <div className="flex gap-2 items-start mb-3">
              <div className="p-2 bg-blue-100 rounded-full dark:bg-blue-900">
                <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  AI Found Answer in Documentation
                </h3>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {suggestedAnswer.similarity !== null &&
                    suggestedAnswer.similarity !== undefined &&
                    `${Math.round(suggestedAnswer.similarity * 100)}% similarity`}
                  {suggestedAnswer.documentTitle && ` • ${suggestedAnswer.documentTitle}`}
                  {' • Needs your review'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-white rounded border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800">
              <p className="mb-2 text-xs font-medium text-blue-700 dark:text-blue-300">
                From Documentation:
              </p>
              <p className="text-sm text-blue-900 whitespace-pre-wrap break-words overflow-wrap-anywhere dark:text-blue-50">
                <LinkifiedText>{suggestedAnswer.answer}</LinkifiedText>
              </p>
            </div>

            <div className="flex gap-2 mt-3">
              <Button
                onClick={() => {
                  setReplyContent(convertTextToHtml(suggestedAnswer.answer));
                  setShowReplyForm(true);
                }}
                className="flex-1"
              >
                <Check className="mr-2 w-4 h-4" />
                Use This Answer
              </Button>
              {suggestedAnswer.sourceId && (
                <Button
                  onClick={() =>
                    window.open(`/knowledge-base?id=${suggestedAnswer.sourceId}`, '_blank')
                  }
                  variant="outline"
                  title="View source in Knowledge Base"
                >
                  <ExternalLink className="mr-2 w-4 h-4" />
                  View Source
                </Button>
              )}
              <Button onClick={() => setShowReplyForm(true)} variant="outline">
                Write Different Reply
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 mb-6 bg-purple-50 rounded-lg border-2 border-purple-300 dark:bg-purple-950/20 dark:border-purple-700">
            <div className="flex gap-2 items-start mb-3">
              <div className="p-2 bg-purple-100 rounded-full dark:bg-purple-900">
                <Search className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-purple-900 dark:text-purple-100">
                  {suggestedAnswer.source === 'similar_ticket'
                    ? 'AI Found Similar Resolved Ticket'
                    : 'AI Found Similar Resolved Message'}
                </h3>
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  {suggestedAnswer.similarity !== null &&
                    suggestedAnswer.similarity !== undefined &&
                    `${Math.round(suggestedAnswer.similarity * 100)}% similarity • `}
                  Needs your review
                </p>
              </div>
            </div>

            <div className="p-3 bg-white rounded border border-purple-200 dark:bg-purple-950/40 dark:border-purple-800">
              <p className="mb-2 text-xs font-medium text-purple-700 dark:text-purple-300">
                Suggested Answer:
              </p>
              <p className="text-sm text-purple-900 whitespace-pre-wrap break-words overflow-wrap-anywhere dark:text-purple-50">
                <LinkifiedText>{suggestedAnswer.answer}</LinkifiedText>
              </p>
            </div>

            <div className="flex gap-2 mt-3">
              <Button
                onClick={() => {
                  setReplyContent(convertTextToHtml(suggestedAnswer.answer));
                  setShowReplyForm(true);
                }}
                className="flex-1"
              >
                <Check className="mr-2 w-4 h-4" />
                Use This Answer
              </Button>
              <Button onClick={() => setShowReplyForm(true)} variant="outline">
                Write Different Reply
              </Button>
            </div>
          </div>
        ))}

      {/* Email Thread */}
      <MessageThread
        messageId={message.id}
        currentThreadId={message.threadId}
        onMessageClick={onMessageNavigate}
      />

      {/* Direct Reply Form */}
      <div className="pt-6 border-t">
        {message.ticketId && (
          <div className="p-3 mb-3 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
            <p className="flex gap-2 items-start text-sm text-blue-900 dark:text-blue-100">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                This message is linked to Ticket #{message.ticketId}. Your reply will be sent to the
                customer.
              </span>
            </p>
          </div>
        )}
        {message.resolved && !message.ticketId && (
          <div className="p-3 mb-3 bg-green-50 rounded-lg border border-green-200 dark:bg-green-950/20 dark:border-green-800">
            <p className="flex gap-2 items-start text-sm text-green-900 dark:text-green-100">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                This message is already marked as resolved. You can still send a follow-up reply if
                needed.
              </span>
            </p>
          </div>
        )}
        {!showReplyForm ? (
          <div className="space-y-2">
            {/* AI Knowledge Search - searches docs, tickets, and messages */}
            {!message.resolved && !message.ticketId && (
              <Button
                onClick={() => setSimilarMessagesOpen(true)}
                className="w-full"
                variant="secondary"
              >
                <Search className="mr-2 w-4 h-4" />
                AI Knowledge Search
              </Button>
            )}
            <Button onClick={() => setShowReplyForm(true)} className="w-full" variant="outline">
              <Reply className="mr-2 w-4 h-4" />
              {message.ticketId
                ? 'Send Reply'
                : message.resolved
                  ? 'Send Follow-up Reply'
                  : message.isLead
                    ? 'Reply to Lead'
                    : 'Reply Without Creating Ticket'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="reply-editor" className="block mb-2 text-sm font-medium">
                {message.ticketId ? 'Reply' : message.resolved ? 'Follow-up Reply' : 'Quick Reply'}
              </label>
              <RichTextEditor
                ref={editorRef}
                content={replyContent}
                onChange={setReplyContent}
                placeholder={
                  message.ticketId
                    ? 'Type your reply...'
                    : message.resolved
                      ? 'Type your follow-up message...'
                      : 'Type your reply to resolve this request quickly...'
                }
                minHeight="150px"
              />
            </div>

            {/* Selected Files Display */}
            {selectedFiles.length > 0 && (
              <div className="space-y-1">
                {selectedFiles.map((file, index) => (
                  <div
                    key={file.name}
                    className="flex gap-2 items-center p-2 rounded border bg-muted border-border"
                  >
                    <File className="w-4 h-4 text-muted-foreground" />
                    <span className="flex-1 text-sm truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFile(index)}
                      className="p-1 h-auto text-red-600 dark:text-red-400 hover:bg-red-500/10"
                      disabled={submitting}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-between items-center">
              <label className="flex gap-1 items-center px-3 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer text-foreground bg-background border-border hover:bg-accent">
                <Paperclip className="w-4 h-4" />
                <span>Attach Files</span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={submitting}
                />
              </label>
              <Button onClick={handleSendReply} disabled={submitting || !replyContent.trim()}>
                <Send className="mr-2 w-4 h-4" />
                {submitting ? 'Sending...' : 'Send Reply'}
              </Button>
              <Button variant="outline" onClick={() => setShowReplyForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Show existing direct reply if present - only when NOT showing thread view */}
      {/* If threadId exists, replies are shown in MessageThread component below */}
      {message.directReply && message.repliedAt && !message.threadId && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              Latest Support Reply
            </h3>
            {message.repliedAt && (
              <span className="text-xs text-blue-600 dark:text-blue-400">
                {formatDate(new Date(message.repliedAt))}
              </span>
            )}
          </div>
          <div
            className="max-w-none text-sm text-blue-900 prose prose-sm dark:text-blue-50"
            dangerouslySetInnerHTML={{ __html: message.directReply }}
          />
        </div>
      )}

      {/* Lead Qualification */}
      {message.isLead && (
        <div className="pt-6 border-t">
          {leadState ? (
            <LeadQualificationPanel
              leadState={leadState}
              fieldDefs={leadFieldDefs}
              enrichment={enrichment}
            />
          ) : (
            <div className="p-4 space-y-1 rounded-lg border border-violet-500/20 bg-violet-500/5">
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                Lead Qualification
              </p>
              <p className="text-xs text-muted-foreground">
                No qualification data gathered yet. Data is collected as the AI engages with this
                lead over the conversation.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Email Attachments */}
      <MessageAttachments message={message} />

      {/* AI Analysis */}
      <MessageAIAnalysis message={message} onRefresh={onRefresh} />

      {/* Metadata */}
      {message.metadata &&
        (() => {
          const {
            embedding: _emb,
            embeddingString: _embStr,
            analysis: _analysis,
            spamCheck: _spamCheck,
            suggestedAnswer: _sa,
            autoReply: _ar,
            leadState: _ls,
            enrichment: _enr,
            receivedAt: _ra,
            isThreadView: _itv,
            threadId: _tid,
            threadMessageCount: _tmc,
            threadHasUnread: _thu,
            threadHasTicket: _tht,
            threadIsResolved: _tir,
            lastReplyFromClient: _lrfc,
            gmailThreadId,
            gmailMessageId,
            integrationId: _integId,
            messageIdHeader,
            ...displayMetadata
          } = message.metadata ?? {};

          const emailDetails = [
            gmailThreadId && { label: 'Gmail Thread', value: gmailThreadId as string },
            gmailMessageId && { label: 'Gmail Message', value: gmailMessageId as string },
            messageIdHeader && { label: 'Message-ID', value: messageIdHeader as string },
          ].filter(Boolean) as { label: string; value: string }[];

          return (
            <>
              {emailDetails.length > 0 && (
                <div className="pt-6 border-t">
                  <h3 className="mb-2 text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                    Email Details
                  </h3>
                  <div className="space-y-1">
                    {emailDetails.map(({ label, value }) => (
                      <div key={label} className="flex gap-2 text-xs">
                        <span className="w-28 shrink-0 text-muted-foreground">{label}:</span>
                        <span className="font-mono break-all">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(displayMetadata).length > 0 && (
                <div className="pt-6 border-t">
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    Additional Information
                  </h3>
                  <div className="p-4 rounded-lg bg-muted">
                    <pre className="overflow-auto text-xs">
                      {JSON.stringify(displayMetadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </>
          );
        })()}

      {/* Internal Notes */}
      <div className="pt-6 border-t">
        <MessageNotes messageId={message.id} />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 pt-6 border-t" data-message-actions>
        {/* CLASSIFY ACTIONS: filtered (not_analysed) → approve to active */}
        {isFiltered && onClassify && (
          <Button
            onClick={() => void handleClassify('approve')}
            disabled={classifying}
            className="w-full"
            size="lg"
          >
            <ShieldCheck className="mr-2 w-4 h-4" />
            {classifying ? 'Approving…' : 'Approve — Move to Active'}
          </Button>
        )}

        {/* CLASSIFY ACTIONS: suspicious → approve to active */}
        {isSuspicious && onClassify && (
          <Button
            onClick={() => void handleClassify('approve')}
            disabled={classifying}
            className="w-full"
            size="lg"
          >
            <ShieldCheck className="mr-2 w-4 h-4" />
            {classifying ? 'Approving…' : 'Not Spam — Move to Active'}
          </Button>
        )}

        {/* CLASSIFY ACTIONS: active → mark suspicious */}
        {isActive && onClassify && (
          <Button
            onClick={() => void handleClassify('mark_suspicious')}
            disabled={classifying}
            variant="outline"
            size="sm"
            className="w-full text-yellow-600 border-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-950"
          >
            <ShieldAlert className="mr-2 w-4 h-4" />
            {classifying ? 'Updating…' : 'Mark as Suspicious'}
          </Button>
        )}

        {/* UNPROCESSED: Needs human review */}
        {!message.processed && (
          <>
            {/* Primary action */}
            {onReject && (
              <Button onClick={handleRejectClick} className="w-full" size="lg">
                <Check className="mr-2 w-4 h-4" />
                Process
              </Button>
            )}

            {/* Secondary actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCopyLink} variant="ghost" size="sm" className="flex-1">
                <LinkIcon className="mr-2 w-4 h-4" />
                {linkCopied ? 'Link Copied!' : 'Copy Link'}
              </Button>
              {onDelete && (
                <Button onClick={onDelete} variant="destructive" size="sm" className="flex-1">
                  <Trash2 className="mr-2 w-4 h-4" />
                  Delete
                </Button>
              )}
            </div>
          </>
        )}

        {/* PROCESSED (not resolved/closed, no ticket): Ready for action */}
        {message.processed &&
          !message.resolved &&
          message.status !== 'closed' &&
          !message.ticketId && (
            <>
              {/* Primary actions */}
              <div className="grid grid-cols-2 gap-3">
                {onApprove && (
                  <Button onClick={onApprove} size="lg">
                    <Check className="mr-2 w-4 h-4" />
                    {message.isLead ? 'Create Lead Ticket' : 'Create Ticket'}
                  </Button>
                )}
                {message.isLead ? (
                  <Button
                    onClick={handleCloseAsNotLead}
                    variant="outline"
                    size="lg"
                    disabled={closing}
                    title="Not a lead — unmark and close without KB capture"
                  >
                    <XCircle className="mr-2 w-4 h-4" />
                    {closing ? 'Closing...' : 'Not a Lead — Close'}
                  </Button>
                ) : (
                  <Button
                    onClick={handleResolveWithoutReply}
                    variant="secondary"
                    size="lg"
                    disabled={resolving}
                    title="Mark as resolved and save attachments to knowledge base"
                  >
                    {resolving ? (
                      <>
                        <RefreshCw className="mr-2 w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 w-4 h-4" />
                        Resolve & Save to KB
                      </>
                    )}
                  </Button>
                )}
              </div>
              {!message.isLead && (
                <Button
                  onClick={handleClose}
                  variant="outline"
                  size="sm"
                  disabled={closing}
                  className="w-full text-muted-foreground"
                  title="Close without saving to knowledge base"
                >
                  <XCircle className="mr-2 w-4 h-4" />
                  {closing ? 'Closing...' : 'Close (no KB capture)'}
                </Button>
              )}

              {/* Secondary actions */}
              <div className="flex gap-2">
                <Button
                  onClick={handleToggleLead}
                  variant="ghost"
                  size="sm"
                  className={`flex-1 ${message.isLead ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}
                  disabled={togglingLead}
                  title={message.isLead ? 'Unmark as lead' : 'Mark as lead'}
                >
                  <Target className="mr-2 w-4 h-4" />
                  {togglingLead ? 'Updating...' : message.isLead ? 'Unmark Lead' : 'Mark as Lead'}
                </Button>
                <Button onClick={handleCopyLink} variant="ghost" size="sm" className="flex-1">
                  <LinkIcon className="mr-2 w-4 h-4" />
                  {linkCopied ? 'Link Copied!' : 'Copy Link'}
                </Button>
                {message.threadId && (
                  <Button
                    onClick={handleCheckContradiction}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={checkingContradiction}
                    title="Check for contradictions with previous messages"
                  >
                    {checkingContradiction ? (
                      <>
                        <RefreshCw className="mr-2 w-4 h-4 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="mr-2 w-4 h-4" />
                        Check Contradiction
                      </>
                    )}
                  </Button>
                )}
                {onReopen && (
                  <Button
                    onClick={handleReopenClick}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <RotateCcw className="mr-2 w-4 h-4" />
                    Unprocess
                  </Button>
                )}
              </div>
            </>
          )}

        {/* CLOSED: Done without KB capture */}
        {message.status === 'closed' && !message.ticketId && (
          <>
            <div className="p-3 rounded-lg border bg-muted border-border">
              <p className="text-sm font-medium text-muted-foreground">Closed (no KB capture)</p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCopyLink} variant="ghost" size="sm" className="w-full">
                <LinkIcon className="mr-2 w-4 h-4" />
                {linkCopied ? 'Link Copied!' : 'Copy Link'}
              </Button>
            </div>
          </>
        )}

        {/* RESOLVED: Completed */}
        {message.resolved && !message.ticketId && (
          <>
            {/* Primary action */}
            {onReopen && (
              <Button onClick={handleReopenClick} variant="outline" size="lg" className="w-full">
                <RotateCcw className="mr-2 w-4 h-4" />
                Unresolve
              </Button>
            )}

            {/* Secondary action */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCopyLink} variant="ghost" size="sm" className="w-full">
                <LinkIcon className="mr-2 w-4 h-4" />
                {linkCopied ? 'Link Copied!' : 'Copy Link'}
              </Button>
            </div>
          </>
        )}

        {/* HAS TICKET: Ticket created */}
        {message.ticketId && (
          <>
            {/* Info banner */}
            <div className="p-4 rounded-lg border bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20">
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                ✓ Ticket created for this message
              </p>
            </div>

            {/* Secondary action */}
            <div className="flex gap-2">
              <Button onClick={handleCopyLink} variant="ghost" size="sm" className="w-full">
                <LinkIcon className="mr-2 w-4 h-4" />
                {linkCopied ? 'Link Copied!' : 'Copy Link'}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Processed?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to mark this message as processed without creating a ticket? This
            action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRejectConfirm}>Mark as Processed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unresolve / Unprocess Confirmation Dialog */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {message.resolved ? 'Unresolve Message?' : 'Unprocess Message?'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {message.resolved
              ? 'Are you sure you want to unresolve this message? This will:'
              : 'Are you sure you want to unprocess this message? This will:'}
          </p>
          <ul className="pl-2 space-y-1 text-sm list-disc list-inside text-muted-foreground">
            <li>Mark the message as unprocessed</li>
            <li>Remove all documentation created from this message</li>
            <li>Delete PDFs and images from the knowledge base</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            The message will appear in your unprocessed messages list again.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReopenConfirm} variant="destructive">
              {message.resolved ? 'Unresolve & Clean Up' : 'Unprocess & Clean Up'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Similar Messages Dialog */}
      <SimilarMessagesDialog
        messageId={message.id}
        open={similarMessagesOpen}
        onClose={() => setSimilarMessagesOpen(false)}
        onSelectAnswer={handleSelectSimilarAnswer}
      />

      {/* Alert Dialog for feedback */}
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => {
          if (!open && alertDialog.onClose) {
            void alertDialog.onClose(); // Intentionally not awaiting - background refresh
          } else {
            setAlertDialog({ ...alertDialog, open });
          }
        }}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </div>
  );
};
