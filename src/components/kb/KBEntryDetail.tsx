import { useState, useEffect } from 'react';
import {
  Bot,
  CheckCircle,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  Download,
  FileText,
  Image,
  Video,
  Volume2,
  Loader2,
  XCircle,
  Split,
} from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { apiClient } from '@/lib/api-client';
import { kbService, type KBEntry } from '@/services/kb.service';
import { KBApprovalProvenance } from './KBApprovalProvenance';
import { KBStatusBadge } from './KBStatusBadge';
import { FormattedKBContent } from '../shared/FormattedKBContent';
import { logger } from '@/lib/logger';
import { REJECTED_RETENTION_DAYS } from '@/lib/kbRejection';
import {
  isCaseRow,
  isMergedOriginal,
  mayRemoveCase,
  offersReviewActions,
} from '@/lib/kbConsolidation';
import { editableQaOf } from '@/lib/kbQaText';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const isImageFile = (filename: string) =>
  IMAGE_EXTS.has(filename.split('.').pop()?.toLowerCase() ?? '');

const AuthenticatedImage = ({
  attachmentId,
  filename,
}: {
  attachmentId: number;
  filename: string;
}) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let blobUrl: string;
    apiClient
      .get(`/api/attachments/${attachmentId}/download`, { responseType: 'blob' })
      .then((resp) => {
        blobUrl = URL.createObjectURL(resp.data as Blob);
        setSrc(blobUrl);
      })
      .catch(() => {
        /* non-fatal — icon fallback renders */
      });
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [attachmentId]);
  return src ? (
    <img src={src} alt={filename} className="w-full h-full object-cover" />
  ) : (
    <AttachmentFileIcon filename={filename} />
  );
};

const AttachmentFileIcon = ({ filename }: { filename: string }) => {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const cls = 'w-4 h-4 text-muted-foreground';
  if (IMAGE_EXTS.has(ext)) return <Image className={cls} />;
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return <Video className={cls} />;
  if (['mp3', 'wav', 'ogg', 'aac'].includes(ext)) return <Volume2 className={cls} />;
  return <FileText className={cls} />;
};

type KBEntryDetailProps = {
  entry: KBEntry | null;
  onClose: () => void;
  onApprove: (id: number) => void;
  onHide: (id: number) => void;
  onReject: (id: number) => void;
  onDelete: (entry: KBEntry) => void;
  onUpdate?: (entry: KBEntry) => void;
  /** May approve / reject / hide / edit (manage_knowledge_base). Without it the server answers 403. */
  canReview: boolean;
  /** Undo a merged case (manage_knowledge_base). Shown only on case rows. */
  onUnmerge?: (entry: KBEntry) => void;
};

/**
 * The deployed detail route (getKBEntry) omits fields the list sends — sourceDeleted, capturedVia,
 * publicId and the consolidation pair — which the badge and the action gates read. On THAT shape
 * only, the list row's values stand in. The current backend always sends `sourceDeleted`, and
 * there the detail is the authority for all five: it leaves `consolidation` out on purpose when
 * an entry is not merged, so a list row loaded before an Unmerge must not bring the merge back.
 * (A `?id=` deep link on the deployed backend has no list row, so there the drawer can only show
 * what the detail says.)
 */
const LIST_ONLY_FIELDS = [
  'sourceDeleted',
  'capturedVia',
  'publicId',
  'consolidatedInto',
  'consolidation',
] as const;
const withListFields = (detail: KBEntry, listed: KBEntry): KBEntry => {
  if (detail.sourceDeleted !== undefined) return detail;
  const merged = { ...detail };
  for (const key of LIST_ONLY_FIELDS) {
    if (merged[key] === undefined && listed[key] !== undefined) {
      (merged as Record<string, unknown>)[key] = listed[key];
    }
  }
  return merged;
};

export const KBEntryDetail = ({
  entry,
  onClose,
  onApprove,
  onHide,
  onReject,
  onDelete,
  onUpdate,
  canReview,
  onUnmerge,
}: KBEntryDetailProps) => {
  const [fullEntry, setFullEntry] = useState<KBEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    content: '',
    category: '',
    question: '',
    answer: '',
  });
  // A Q&A entry is edited as question + answer (sent as such); anything else as content.
  const [editsQa, setEditsQa] = useState(false);
  // The drawer holds the entry's FULL text only once the detail route answered.
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [qaDrifted, setQaDrifted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Fetch full entry content when drawer opens
  useEffect(() => {
    if (entry?.id) {
      setLoading(true);
      setDetailLoaded(false);
      void kbService
        .getById(entry.id)
        .then((response: { data: KBEntry }) => {
          setFullEntry(withListFields(response.data, entry));
          setDetailLoaded(true);
        })
        .catch((error: Error) => {
          logger.error('Failed to fetch full entry:', error);
          setFullEntry(entry); // Fallback to truncated entry
          setDetailLoaded(false);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setFullEntry(null);
      setDetailLoaded(false);
    }
  }, [entry?.id, entry]);

  const handleEditClick = () => {
    if (displayEntry) {
      const qaText = editableQaOf(displayEntry, detailLoaded);
      setEditsQa(qaText !== null);
      setQaDrifted(qaText?.drifted ?? false);
      setEditForm({
        title: displayEntry.title,
        content: displayEntry.content,
        category: displayEntry.category,
        question: qaText?.question ?? '',
        answer: qaText?.answer ?? '',
      });
      setEditError(null);
      setEditDialogOpen(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!displayEntry) return;

    setSaving(true);
    try {
      const response = await kbService.update(
        displayEntry.id,
        editsQa
          ? {
              title: editForm.title,
              category: editForm.category,
              question: editForm.question,
              answer: editForm.answer,
              // Also as content, which a backend without question/answer support reads — it
              // would otherwise drop the edit and still answer 200 (FE pass 20 LOW-3).
              content: `Question: ${editForm.question}\n\nAnswer: ${editForm.answer}`,
            }
          : { title: editForm.title, content: editForm.content, category: editForm.category }
      );
      if (response.success && response.data) {
        setFullEntry(response.data);
        if (onUpdate) {
          onUpdate(response.data);
        }
        setEditDialogOpen(false);
      }
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : 'Failed to update entry. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!entry) return null;

  const displayEntry = fullEntry ?? entry;

  return (
    <Drawer open={!!entry} onClose={onClose} title="Entry Details">
      {loading ? (
        <div className="flex flex-1 justify-center items-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex-none p-6 border-b">
            <div className="flex gap-4 justify-between items-start mb-4">
              <h2 className="font-display text-2xl font-semibold">{displayEntry.title}</h2>
              <div className="flex gap-2">
                {/* Shown next to the approve action: approving makes this entry
                  retrievable ground truth, so the reviewer must know when the
                  answer was drafted by the model rather than written by a person. */}
                {displayEntry.metadata?.authorProvenance === 'ai_drafted' && (
                  <Badge
                    variant="secondary"
                    className="gap-1"
                    title="This answer was drafted by AI and sent by an agent — review it before approving."
                  >
                    <Bot className="w-3 h-3" />
                    AI-drafted
                  </Badge>
                )}
                <KBStatusBadge
                  entry={displayEntry}
                  pendingLabel="Pending Review"
                  withProvenance={false}
                />
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Category:</span>
                <div className="font-medium">{displayEntry.category}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Department:</span>
                <div className="font-medium">
                  <DepartmentBadge departmentId={displayEntry.departmentId} />
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Quality Score:</span>
                <div className="font-medium">{(displayEntry.qualityScore * 100).toFixed(0)}%</div>
              </div>
              <div>
                <span className="text-muted-foreground">Usage Count:</span>
                <div className="font-medium">{displayEntry.usageCount}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>
                <div className="font-medium capitalize">{displayEntry.type.replace('_', ' ')}</div>
              </div>

              {/* Whether a person ever vetted this, or only a score did. An approved entry is
                quotable by the AI as ground truth, so the difference is worth the row. */}
              <KBApprovalProvenance entry={displayEntry} />

              {/* Source Messages for Q&A pairs */}
              {displayEntry.type === 'qa_pair' &&
                displayEntry.typeData &&
                typeof displayEntry.typeData === 'object' &&
                (() => {
                  const typeData = displayEntry.typeData as {
                    questionMessageId?: number;
                    answerMessageId?: number;
                    sourceMessageIds?: number[];
                    threadId?: string;
                  };

                  const hasQuestionAnswer =
                    typeof typeData.questionMessageId === 'number' &&
                    typeof typeData.answerMessageId === 'number';
                  const hasSourceMessages =
                    Array.isArray(typeData.sourceMessageIds) &&
                    typeData.sourceMessageIds.length > 0;

                  if (!hasQuestionAnswer && !hasSourceMessages) return null;

                  return (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Source Messages:</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {hasQuestionAnswer && (
                          <>
                            {/* Question Message — id is a message_events.id, so include
                              kind=event so getById skips its conv-first fallback. */}
                            <a
                              href={`/messages?id=${typeData.questionMessageId}&kind=event`}
                              className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-primary bg-primary-muted rounded hover:bg-primary-muted/70"
                              title="Question Message"
                            >
                              ❓ Question: #{typeData.questionMessageId}
                            </a>

                            {/* Answer Message - always show even if same as question */}
                            <a
                              href={`/messages?id=${typeData.answerMessageId}&kind=event`}
                              className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-success bg-success-muted rounded hover:bg-success-muted"
                              title="Answer Message"
                            >
                              ✅ Answer: #{typeData.answerMessageId}
                              {typeData.answerMessageId === typeData.questionMessageId && (
                                <span className="ml-1 text-[10px] opacity-70">(same)</span>
                              )}
                            </a>
                          </>
                        )}

                        {/* All thread messages (excluding question and answer) */}
                        {hasSourceMessages &&
                          typeData.sourceMessageIds?.map((msgId) => {
                            // Skip if already shown as question or answer
                            if (
                              msgId === typeData.questionMessageId ||
                              msgId === typeData.answerMessageId
                            ) {
                              return null;
                            }
                            return (
                              <a
                                key={msgId}
                                href={`/messages?id=${msgId}&kind=event`}
                                className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-muted-foreground bg-muted rounded hover:bg-muted"
                                title="Other Thread Message"
                              >
                                💬 #{msgId}
                              </a>
                            );
                          })}
                      </div>
                    </div>
                  );
                })()}

              {/* Fallback: single source message from metadata */}
              {displayEntry.type !== 'qa_pair' &&
                displayEntry.metadata &&
                typeof displayEntry.metadata.sourceMessageId === 'number' && (
                  <div>
                    <span className="text-muted-foreground">Source Message:</span>
                    <div className="font-medium">
                      <a
                        href={`/messages?id=${displayEntry.metadata.sourceMessageId}`}
                        className="text-primary hover:text-primary/80 hover:underline"
                      >
                        #{displayEntry.metadata.sourceMessageId}
                      </a>
                    </div>
                  </div>
                )}
              {displayEntry.type === 'document' &&
                (() => {
                  // Try to get attachment info from typeData first, then metadata
                  const attachmentId =
                    (displayEntry.typeData as { attachmentId?: number })?.attachmentId ??
                    (displayEntry.metadata as { attachmentId?: number })?.attachmentId;
                  const filename =
                    (displayEntry.typeData as { originalFilename?: string })?.originalFilename ??
                    (displayEntry.metadata as { originalFilename?: string })?.originalFilename;

                  if (typeof attachmentId === 'number' && typeof filename === 'string') {
                    const handleDownload = async (inline = false) => {
                      try {
                        const response = await apiClient.get<Blob>(
                          `/api/attachments/${attachmentId}/download`,
                          { responseType: 'blob' }
                        );
                        const url = URL.createObjectURL(response.data);
                        if (inline) {
                          window.open(url, '_blank', 'noopener,noreferrer');
                          setTimeout(() => URL.revokeObjectURL(url), 10000);
                        } else {
                          const anchor = document.createElement('a');
                          anchor.href = url;
                          anchor.download = filename;
                          document.body.appendChild(anchor);
                          anchor.click();
                          document.body.removeChild(anchor);
                          setTimeout(() => URL.revokeObjectURL(url), 100);
                        }
                      } catch (error) {
                        logger.error('Download failed:', error);
                      }
                    };

                    return (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Original File:</span>
                        <div className="mt-1">
                          <div className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors">
                            <div className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center bg-muted/60 overflow-hidden">
                              {isImageFile(filename) ? (
                                <AuthenticatedImage
                                  attachmentId={attachmentId}
                                  filename={filename}
                                />
                              ) : (
                                <AttachmentFileIcon filename={filename} />
                              )}
                            </div>
                            <p className="flex-1 min-w-0 text-[11px] font-medium truncate">
                              {filename}
                            </p>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              {isImageFile(filename) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => void handleDownload(true)}
                                  title="View"
                                  aria-label="View"
                                  className="p-1 w-auto h-auto rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => void handleDownload()}
                                title="Download"
                                aria-label="Download"
                                className="p-1 w-auto h-auto rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
            </div>
          </div>

          {/* Content */}
          <div className="overflow-auto flex-1 p-6">
            <h3 className="font-display mb-3 text-lg font-semibold">Content</h3>
            <FormattedKBContent
              content={(() => {
                // For document type entries, use clean document content
                if (displayEntry.type === 'document') {
                  // Try to get documentContent from typeData (new entries)
                  if (
                    displayEntry.typeData &&
                    typeof displayEntry.typeData === 'object' &&
                    'documentContent' in displayEntry.typeData &&
                    typeof displayEntry.typeData.documentContent === 'string'
                  ) {
                    return displayEntry.typeData.documentContent;
                  }

                  // Fallback: Extract document content from combined content (old entries)
                  // Look for "Extracted Text:" line and get everything after it
                  const extractedTextMatch = displayEntry.content.match(
                    /Extracted Text:\s*\n([\s\S]*)/
                  );
                  if (extractedTextMatch?.[1]) {
                    return extractedTextMatch[1].trim();
                  }

                  // If that fails, try to remove just the headers at the start
                  const withoutHeaders = displayEntry.content
                    .replace(/^##\s*Message Context[\s\S]*?(?=##\s*Attachment Content|$)/, '')
                    .replace(/^##\s*Thread Context[\s\S]*?(?=##\s*Attachment Content|$)/, '')
                    .replace(/^##\s*Attachment Content[\s\S]*?Extracted Text:\s*\n/, '')
                    .trim();

                  if (withoutHeaders && withoutHeaders !== displayEntry.content) {
                    return withoutHeaders;
                  }
                }

                // For Q&A pairs and manual entries, use full content
                return displayEntry.content;
              })()}
            />
          </div>

          {/* Actions Footer — reads the entry the drawer FETCHED, like the header badge above.
              The row it was opened with may not say it is a case or a merged original (a deep
              link has no row at all), and acting on it would offer what the server refuses. */}
          <div className="flex-none p-6 border-t bg-muted/20">
            <div className="flex gap-3 justify-end">
              {canReview && isCaseRow(displayEntry) && mayRemoveCase(displayEntry) && onUnmerge && (
                <Button
                  variant="outline"
                  onClick={() => onUnmerge(displayEntry)}
                  title="Undo this case and restore its original entries"
                >
                  <Split className="mr-2 w-4 h-4" />
                  Unmerge
                </Button>
              )}
              {canReview && offersReviewActions(displayEntry) && (
                <Button variant="outline" onClick={handleEditClick}>
                  <Edit className="mr-2 w-4 h-4" />
                  Edit
                </Button>
              )}
              {canReview && offersReviewActions(displayEntry) && !displayEntry.approved && !displayEntry.hidden && (
                <>
                  {mayRemoveCase(displayEntry) && (
                    <Button
                      variant="outline"
                      onClick={() => onReject(displayEntry.id)}
                      title={`Hidden now, deleted after ${REJECTED_RETENTION_DAYS} days unless approved again`}
                    >
                      <XCircle className="mr-2 w-4 h-4" />
                      Reject
                    </Button>
                  )}
                  <Button variant="primary" onClick={() => onApprove(displayEntry.id)}>
                    <CheckCircle className="mr-2 w-4 h-4" />
                    Approve
                  </Button>
                </>
              )}
              {canReview &&
                offersReviewActions(displayEntry) &&
                (displayEntry.hidden || mayRemoveCase(displayEntry)) &&
                (!displayEntry.hidden ? (
                  <Button variant="outline" onClick={() => onHide(displayEntry.id)}>
                    <EyeOff className="mr-2 w-4 h-4" />
                    Hide
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => onApprove(displayEntry.id)}>
                    <Eye className="mr-2 w-4 h-4" />
                    {displayEntry.rejectedAt ? 'Restore' : 'Unhide'}
                  </Button>
                ))}
              {!isMergedOriginal(displayEntry) && mayRemoveCase(displayEntry) && (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    onClose();
                    onDelete(displayEntry);
                  }}
                >
                  <Trash2 className="mr-2 w-4 h-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogHeader>
          <DialogTitle>Edit KB Entry</DialogTitle>
          <DialogClose onClose={() => setEditDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {editError && (
            <div className="p-3 mb-4 text-sm text-destructive bg-destructive-muted rounded border border-destructive-line">
              {editError}
            </div>
          )}
          {editsQa && qaDrifted && (
            <p className="mb-4 text-sm text-muted-foreground">
              This entry was edited before in a way AI drafts did not pick up: they still used the
              earlier text. Below is the edited text; saving makes AI drafts use it too.
            </p>
          )}
          {displayEntry && isCaseRow(displayEntry) && (
            <p className="mb-4 text-sm text-muted-foreground">
              This is a merged case. Edit its wording here; to change what this case is about,
              {mayRemoveCase(displayEntry)
                ? ' Unmerge it.'
                : ' only a moderator covering every department it serves, or an org admin, can Unmerge it.'}
            </p>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="edit-title" className="block mb-1 text-sm font-medium">
                Title
              </label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
                placeholder="Entry title"
              />
            </div>
            <div>
              <label htmlFor="edit-category" className="block mb-1 text-sm font-medium">
                Category
              </label>
              <Input
                id="edit-category"
                value={editForm.category}
                onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}
                placeholder="Category"
              />
            </div>
            {editsQa ? (
              <>
                <div>
                  <label htmlFor="edit-question" className="block mb-1 text-sm font-medium">
                    Question
                  </label>
                  <Textarea
                    id="edit-question"
                    value={editForm.question}
                    onChange={(event) => setEditForm({ ...editForm, question: event.target.value })}
                    rows={3}
                  />
                </div>
                <div>
                  <label htmlFor="edit-answer" className="block mb-1 text-sm font-medium">
                    Answer
                  </label>
                  <Textarea
                    id="edit-answer"
                    value={editForm.answer}
                    onChange={(event) => setEditForm({ ...editForm, answer: event.target.value })}
                    rows={8}
                  />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="edit-content" className="block mb-1 text-sm font-medium">
                  Content
                </label>
                <Textarea
                  id="edit-content"
                  value={editForm.content}
                  onChange={(event) => setEditForm({ ...editForm, content: event.target.value })}
                  placeholder="Entry content"
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveEdit}
            isLoading={saving}
            // A blank half would silently keep the old text on the backend (FE pass 20 LOW-4).
            disabled={editsQa && (!editForm.question.trim() || !editForm.answer.trim())}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </Dialog>
    </Drawer>
  );
};
