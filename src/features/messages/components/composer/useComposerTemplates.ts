import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { isBlankRichText } from '@/lib/stripHtml';
import { logger } from '@/lib/logger';
import { replyTemplatesService, type ReplyTemplate } from '@/services/replyTemplates.service';
import type { Message } from '@/types';

export function useComposerTemplates({
  message,
  selectedFiles,
  setComposer,
  richEditorRef,
  onFilesChange,
}: {
  message: Message;
  selectedFiles: File[];
  setComposer: React.Dispatch<React.SetStateAction<string>>;
  richEditorRef: RefObject<RichTextEditorHandle>;
  onFilesChange: (files: File[]) => void;
}) {
  /*
    Reply templates (2026-10-09): the body goes into the editor — in place of a blank draft, after
    the agent's own words otherwise — and the template's files are attached. Placeholders stay as
    tokens (filled at send); AI draft on a template adapts it (polish), which fills them first.
    ⛔ The files download after the text lands: if the agent has moved to another conversation by
    then, they are NOT attached — they would go to a different customer.
  */
  const [templateError, setTemplateError] = useState<string | null>(null);
  const filesRef = useRef(selectedFiles);
  filesRef.current = selectedFiles;
  const messageIdRef = useRef(message.id);
  messageIdRef.current = message.id;
  useEffect(() => setTemplateError(null), [message.id]);
  const insertTemplate = async (template: ReplyTemplate) => {
    setTemplateError(null);
    setComposer((prev) => (isBlankRichText(prev) ? template.body : `${prev}${template.body}`));
    setTimeout(() => richEditorRef.current?.focus(), 0);
    if (template.attachments.length === 0) return;
    const startedOn = message.id;
    const results = await Promise.allSettled(
      template.attachments.map((file) =>
        replyTemplatesService.downloadAttachment(template.id, file)
      )
    );
    if (messageIdRef.current !== startedOn) return;
    const files = results
      .filter((row): row is PromiseFulfilledResult<File> => row.status === 'fulfilled')
      .map((row) => row.value);
    if (files.length > 0) onFilesChange([...filesRef.current, ...files]);
    const failed = template.attachments.filter((_, idx) => results[idx].status === 'rejected');
    if (failed.length > 0) {
      logger.error('Failed to attach a reply template’s files', { templateId: template.id });
      setTemplateError(
        `Could not attach ${failed.map((file) => file.filename).join(', ')} from “${template.name}”.`
      );
    }
  };
  return { templateError, insertTemplate };
}
