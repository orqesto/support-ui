import { ArrowLeft, Mail, Paperclip, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Kbd } from '@/components/ui/Kbd';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Message } from '@/types';
import { MAX_FILES, NewTicketFiles } from './NewTicketFiles';

/**
 * The create page's bar: back · "/ New ticket" · Cancel · Create ticket. Leaving with unsaved work
 * asks first ("Discard this ticket?"); Esc leaves too, except from a field, where Esc is the field's.
 */
export const CreateTicketBar = ({
  backLabel,
  formId,
  blockedReason,
  canCreate,
  loading,
  dirty,
  onLeave,
}: {
  backLabel: string;
  /** The form the Create button submits. */
  formId: string;
  /** Why Create is off, shown on hover; null when the page's own notices explain it. */
  blockedReason: string | null;
  canCreate: boolean;
  loading: boolean;
  /** Something typed or picked that leaving would lose. */
  dirty: boolean;
  onLeave: () => void;
}) => {
  const [discardOpen, setDiscardOpen] = useState(false);
  const cancel = () => (dirty ? setDiscardOpen(true) : onLeave());
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const active = document.activeElement;
      if (active && active !== document.body && active.tagName !== 'BUTTON') return;
      if (document.querySelector('[role="dialog"]')) return;
      cancelRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Card
        padding="none"
        className="flex gap-1 items-center px-2 h-[46px] text-[12.5px] text-muted-foreground"
      >
        <Tooltip
          content={
            <span className="inline-flex gap-1.5 items-center">
              Cancel
              <Kbd tone="tooltip">Esc</Kbd>
            </span>
          }
        >
          <Button variant="ghost" size="sm" type="button" onClick={cancel}>
            <ArrowLeft className="mr-1.5 w-4 h-4" aria-hidden />
            {backLabel}
          </Button>
        </Tooltip>
        <span>/</span>
        <span>New ticket</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" type="button" onClick={cancel}>
          Cancel
        </Button>
        <Tooltip content={canCreate ? '' : (blockedReason ?? '')} size="sm">
          <span className="inline-flex">
            <Button type="submit" form={formId} size="sm" isLoading={loading} disabled={!canCreate}>
              {!loading && <Plus className="mr-1 w-3.5 h-3.5" aria-hidden />}
              Create ticket
            </Button>
          </span>
        </Tooltip>
      </Card>
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={onLeave}
        title="Discard this ticket?"
        description="What you’ve written here isn’t saved."
        confirmText="Discard"
        cancelText="Keep editing"
      />
    </>
  );
};

/** The thread a ticket is created from, quoted — two lines, or the whole message on demand. */
export const CreateTicketQuote = ({ message }: { message: Message }) => {
  const [open, setOpen] = useState(false);
  return (
    <Card padding="sm" className="grid gap-1 bg-muted/30">
      <p className="flex gap-2 items-center min-w-0 text-[13px]">
        <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <b className="truncate">{message.sender}</b>
        <span className="text-xs text-muted-foreground">{message.channel}</span>
      </p>
      {message.subject && <p className="text-[13px] font-semibold">{message.subject}</p>}
      <p
        className={`text-[13px] leading-relaxed text-muted-foreground whitespace-pre-line ${open ? '' : 'line-clamp-2'}`}
      >
        {message.content}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((was) => !was)}
        className="justify-self-start px-0 h-auto text-primary"
      >
        {open ? 'Show less' : 'Show the whole message'}
      </Button>
    </Card>
  );
};

/** The sidebar's Files section: the chosen files, why any were left out, and Attach files. */
export const CreateTicketFilesSection = ({
  files,
  notice,
  disabled,
  onPick,
  onRemove,
}: {
  files: File[];
  notice: string | null;
  disabled: boolean;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <section className="space-y-3">
      <h3 className="font-display text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground">
        Files <span className="font-normal normal-case tracking-normal">· up to 5, 10 MB each</span>
      </h3>
      <NewTicketFiles files={files} onRemove={onRemove} disabled={disabled} />
      {notice && <p className="text-xs text-destructive">{notice}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || files.length >= MAX_FILES}
      >
        <Paperclip className="mr-1 w-3.5 h-3.5" aria-hidden />
        Attach files
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={onPick}
        className="hidden"
        aria-label="Attach files to the ticket"
        disabled={disabled}
      />
    </section>
  );
};

/** Sync to Jira, with what it does — offered only on a ticket created from a thread. */
export const CreateTicketJiraOption = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <div className="p-3 rounded-lg border border-border bg-muted/30">
    <Checkbox
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      label={
        <span className="grid gap-0.5">
          <span className="font-medium">Sync to Jira</span>
          <span className="text-xs text-muted-foreground">
            Creates a Jira issue with the ticket. It only syncs with a clear title and description
            and a category — or High or Critical priority.
          </span>
        </span>
      }
    />
  </div>
);
