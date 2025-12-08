import { useState, useEffect } from 'react';
import { CheckCircle, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { apiClient } from '@/lib/api-client';
import { kbService, type KBEntry } from '@/services/kb.service';
import { FormattedKBContent } from '../shared/FormattedKBContent';

type KBEntryDetailProps = {
  entry: KBEntry | null;
  onClose: () => void;
  onApprove: (id: number) => void;
  onHide: (id: number) => void;
  onDelete: (entry: KBEntry) => void;
};

export const KBEntryDetail = ({
  entry,
  onClose,
  onApprove,
  onHide,
  onDelete,
}: KBEntryDetailProps) => {
  const [fullEntry, setFullEntry] = useState<KBEntry | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch full entry content when drawer opens
  useEffect(() => {
    if (entry?.id) {
      setLoading(true);
      void kbService
        .getById(entry.id)
        .then((response: { data: KBEntry }) => {
          setFullEntry(response.data);
        })
        .catch((error: Error) => {
          console.error('Failed to fetch full entry:', error);
          setFullEntry(entry); // Fallback to truncated entry
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setFullEntry(null);
    }
  }, [entry?.id, entry]);

  if (loading || !entry) return null;

  const displayEntry = fullEntry ?? entry;

  return (
    <Drawer open={!!entry} onClose={onClose} title="Entry Details">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex-none p-6 border-b">
          <div className="flex gap-4 justify-between items-start mb-4">
            <h2 className="text-2xl font-semibold">{displayEntry.title}</h2>
            <div className="flex gap-2">
              {displayEntry.hidden ? (
                <Badge className="text-muted-foreground">Hidden</Badge>
              ) : displayEntry.approved ? (
                <Badge className="bg-green-600">Approved</Badge>
              ) : (
                <Badge>Pending Review</Badge>
              )}
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
              <div className="font-medium">{displayEntry.departmentRole}</div>
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
                  Array.isArray(typeData.sourceMessageIds) && typeData.sourceMessageIds.length > 0;

                if (!hasQuestionAnswer && !hasSourceMessages) return null;

                return (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Source Messages:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {hasQuestionAnswer && (
                        <>
                          {/* Question Message */}
                          <a
                            href={`/messages?id=${typeData.questionMessageId}`}
                            className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400"
                            title="Question Message"
                          >
                            ❓ Question: #{typeData.questionMessageId}
                          </a>

                          {/* Answer Message - always show even if same as question */}
                          <a
                            href={`/messages?id=${typeData.answerMessageId}`}
                            className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-green-600 bg-green-50 rounded hover:bg-green-100 dark:bg-green-950 dark:text-green-400"
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
                              href={`/messages?id=${msgId}`}
                              className="inline-flex gap-1 items-center px-2 py-1 text-xs font-medium text-gray-600 bg-gray-50 rounded hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400"
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
                      className="text-blue-600 hover:text-blue-700 hover:underline"
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

                // Debug: log what we have
                if (!attachmentId || !filename) {
                  console.log('KB Entry Attachment Debug:', {
                    id: displayEntry.id,
                    hasTypeData: !!displayEntry.typeData,
                    hasMetadata: !!displayEntry.metadata,
                    typeData: displayEntry.typeData,
                    metadata: displayEntry.metadata,
                    attachmentId,
                    filename,
                  });
                }

                if (typeof attachmentId === 'number' && typeof filename === 'string') {
                  const handleDownload = async () => {
                    try {
                      const response = await apiClient.get<Blob>(
                        `/api/attachments/${attachmentId}/download`,
                        { responseType: 'blob' }
                      );
                      const url = URL.createObjectURL(response.data);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      console.error('Download failed:', error);
                    }
                  };

                  return (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Original File:</span>
                      <div className="font-medium">
                        <button
                          type="button"
                          onClick={handleDownload}
                          className="inline-flex gap-2 items-center p-0 text-blue-600 bg-transparent border-none cursor-pointer hover:text-blue-700 hover:underline"
                        >
                          📎 {filename}
                        </button>
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
          <h3 className="mb-3 text-lg font-semibold">Content</h3>
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

        {/* Actions Footer */}
        <div className="flex-none p-6 border-t bg-muted/20">
          <div className="flex gap-3 justify-end">
            {!entry.approved && !entry.hidden && (
              <Button variant="primary" onClick={() => onApprove(entry.id)}>
                <CheckCircle className="mr-2 w-4 h-4" />
                Approve
              </Button>
            )}
            {!entry.hidden ? (
              <Button variant="outline" onClick={() => onHide(entry.id)}>
                <EyeOff className="mr-2 w-4 h-4" />
                Hide
              </Button>
            ) : (
              <Button variant="outline" onClick={() => onApprove(entry.id)}>
                <Eye className="mr-2 w-4 h-4" />
                Unhide
              </Button>
            )}
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => {
                onClose();
                onDelete(entry);
              }}
            >
              <Trash2 className="mr-2 w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
};
