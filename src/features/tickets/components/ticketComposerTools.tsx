import { useState, type RefObject } from 'react';
import { Paperclip } from 'lucide-react';
import { COMPOSER_TOOL } from '@/components/messages/messageDetailConstants';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';
import { TemplatePicker } from '@/components/shared/TemplatePicker';
import { TranslateButton } from '@/components/shared/TranslateButton';
import { Button } from '@/components/ui/Button';
import { logger } from '@/lib/logger';
import { isBlankRichText } from '@/lib/stripHtml';
import { replyTemplatesService, type ReplyTemplate } from '@/services/replyTemplates.service';

/**
 * A template's text into the ticket update's editor and its files attached — the thread
 * composer's Templates (MessageComposer `insertTemplate`), for the one update every ticked
 * customer gets.
 */
export const useInsertTemplate = ({
  ticketId,
  currentTicket,
  draft,
  setEditor,
  addFiles,
  focus,
}: {
  ticketId: number;
  /** The ticket on screen now: files fetched for a ticket the page left are dropped. */
  currentTicket: { current: number };
  draft: string;
  setEditor: (html: string) => void;
  addFiles: (files: File[]) => void;
  focus: () => void;
}) => {
  const [templateError, setTemplateError] = useState<string | null>(null);
  const insertTemplate = async (template: ReplyTemplate) => {
    setTemplateError(null);
    setEditor(isBlankRichText(draft) ? template.body : `${draft}${template.body}`);
    setTimeout(focus, 0);
    if (template.attachments.length === 0) return;
    const startedOn = ticketId;
    const results = await Promise.allSettled(
      template.attachments.map((file) =>
        replyTemplatesService.downloadAttachment(template.id, file)
      )
    );
    if (currentTicket.current !== startedOn) return;
    const fetched = results
      .filter((row): row is PromiseFulfilledResult<File> => row.status === 'fulfilled')
      .map((row) => row.value);
    if (fetched.length > 0) addFiles(fetched);
    const failed = template.attachments.filter((_, idx) => results[idx].status === 'rejected');
    if (failed.length > 0) {
      logger.error('Failed to attach a reply template’s files', { templateId: template.id });
      setTemplateError(
        `Could not attach ${failed.map((file) => file.filename).join(', ')} from “${template.name}”.`
      );
    }
  };
  return { insertTemplate, templateError };
};

/** Attach · Translate · Templates, styled and placed as in the thread composer. */
export const TicketComposerTools = ({
  editor,
  onAttach,
  attachDisabled,
  disabled,
  onInsertTemplate,
}: {
  editor: RefObject<RichTextEditorHandle | null>;
  onAttach: () => void;
  attachDisabled: boolean;
  /** Translate and Templates: off while sending, drafting or locked. */
  disabled: boolean;
  onInsertTemplate: (template: ReplyTemplate) => void;
}) => (
  <>
    <Button
      variant="ghost"
      type="button"
      onClick={onAttach}
      disabled={attachDisabled}
      className={`${COMPOSER_TOOL} h-auto`}
    >
      <Paperclip className="w-3 h-3" aria-hidden />
      Attach
    </Button>
    {/* Labelled, with the reply tools — as the thread composer (the editor's icon went unnoticed). */}
    <TranslateButton
      getText={() => editor.current?.getTranslationText() ?? ''}
      onTranslated={(translated) => editor.current?.applyTranslation(translated)}
      clearable={false}
      disabled={disabled}
      label="Translate"
      tooltip="Translate before sending"
      buttonClassName={`${COMPOSER_TOOL} !w-auto !h-auto`}
    />
    <TemplatePicker
      use="ticket"
      onPick={onInsertTemplate}
      disabled={disabled}
      triggerClassName={`${COMPOSER_TOOL} h-auto`}
    />
  </>
);
