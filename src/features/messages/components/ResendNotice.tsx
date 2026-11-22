import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { ResendTarget } from './deliveryState';
import type { AttachmentsStatus } from './messageDetail/useThreadPanelsData';

/**
 * Do the files stored with the reply being resent go again? The backend's rule
 * (messageReplyController, `keepStoredFiles`): the agent's choice when made; otherwise only when
 * the send uploads no files of its own.
 */
export const storedFilesGo = (attachedHere: number, keepStoredFiles?: boolean): boolean =>
  keepStoredFiles ?? attachedHere === 0;

/**
 * What a resend does with files (the backend keeps an undelivered reply's files), as the send will
 * do it. `stored` = the names of the files the thread shows on that reply (as its bubble lists
 * them); `keepStoredFiles` = the agent's choice (absent = the backend's default).
 */
export const resendFilesText = (
  stored: readonly string[],
  attachedHere: number,
  keepStoredFiles?: boolean,
  listing: AttachmentsStatus = 'loaded'
): string => {
  // Not read yet: nothing is claimed about the files.
  if (listing === 'loading') return 'Checking its attachments…';
  if (listing === 'failed') {
    const unknown = 'Its attachments could not be listed:';
    const go = storedFilesGo(attachedHere, keepStoredFiles);
    if (attachedHere === 0)
      return go
        ? `${unknown} any stored with it are sent again.`
        : `${unknown} it is sent without any stored with it.`;
    return go
      ? `${unknown} any stored with it are sent again with the files attached here.`
      : `${unknown} the files attached here are sent instead of any stored with it.`;
  }
  if (stored.length === 0)
    return attachedHere > 0 ? '' : 'No attachments are stored with it: attach any it needs.';
  const names = stored.join(', ');
  const go = storedFilesGo(attachedHere, keepStoredFiles);
  if (attachedHere === 0)
    return go
      ? `Its attachments are sent again: ${names}.`
      : `It is sent without its attachments (${names}).`;
  return go
    ? `Its attachments are sent again with the files attached here: ${names}.`
    : 'The files attached here are sent instead of its own.';
};

/**
 * The one choice the notice offers about the stored files, for the send as it stands: drop them,
 * add them beside the composer's files, or undo either (back to the backend's default).
 */
export const storedFilesChoice = (
  attachedHere: number,
  keepStoredFiles?: boolean
): { label: string; next: boolean | undefined } => {
  const go = storedFilesGo(attachedHere, keepStoredFiles);
  if (attachedHere === 0)
    return go
      ? { label: 'Send without its attachments', next: false }
      : { label: 'Send its attachments again', next: undefined };
  return go
    ? { label: 'Send only the files attached here', next: undefined }
    : { label: 'Also send its own attachments', next: true };
};

/** What the thread holds per reply (useThreadPanelsData): the files, by their reply's event id. */
export type FilesByReply = ReadonlyMap<number, readonly { originalFilename: string }[]>;

/** The names of the files the thread shows on a reply, as its bubble lists them. */
export const storedFileNames = (files: FilesByReply, eventId: number | null): string[] =>
  eventId === null ? [] : (files.get(eventId) ?? []).map((file) => file.originalFilename);

/**
 * Over the composer while it holds an undelivered reply put back for a resend: the next Send
 * replaces that reply (one bubble on the thread). Cancel keeps the text but sends it as a new reply.
 * It says which files go, and offers the one choice about the stored ones (storedFilesChoice).
 */
export function ResendNotice({
  state: { resendOf: target, setResendOf: setTarget, selectedFiles, declinedResendRef },
  files: attachments,
  listing,
  busy,
}: {
  /** The composer's resend target and its attached files (useReplyComposerState). */
  state: {
    resendOf: ResendTarget | null;
    setResendOf: (next: ResendTarget | null) => void;
    selectedFiles: readonly File[];
    /** "Not a resend" was said for this reply: its text goes as a new reply. */
    declinedResendRef: { current: number | null };
  };
  /** The thread's files, by reply (useThreadPanelsData). */
  files: FilesByReply;
  /** Whether that list has been read (useThreadPanelsData). */
  listing: AttachmentsStatus;
  /** A send is waiting or out: what it carries is fixed, so nothing here can change it. */
  busy: boolean;
}) {
  if (!target) return null;
  const { uncertain, keepStoredFiles } = target;
  const stored = storedFileNames(attachments, target.eventId);
  const files = resendFilesText(stored, selectedFiles.length, keepStoredFiles, listing);
  // Offered when files may be stored: listed, or a list that could not be read.
  const choice =
    listing === 'failed' || (listing === 'loaded' && stored.length > 0)
      ? storedFilesChoice(selectedFiles.length, keepStoredFiles)
      : null;
  return (
    // A persistent notice holding controls: a labelled status (announced when it appears), not an
    // alert, which interrupts.
    <Alert
      variant={uncertain ? 'warning' : 'info'}
      className="mx-3 mb-2"
      role="status"
      label="Resending a reply"
    >
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="flex-1 min-w-[200px]">
          {uncertain
            ? 'We could not confirm that this reply reached the customer — if you resend it, they may get it twice. Edit it if needed, then send.'
            : 'Resending a reply that was not delivered. Edit it if needed, then send.'}
          {files ? ` ${files}` : ''}
        </span>
        {choice && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            // A toggle: pressed = the send differs from the default (stored files dropped or added).
            aria-pressed={keepStoredFiles !== undefined}
            onClick={() => {
              const { keepStoredFiles: _dropped, ...rest } = target;
              setTarget(
                choice.next === undefined ? rest : { ...rest, keepStoredFiles: choice.next }
              );
            }}
          >
            {choice.label}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            declinedResendRef.current = target.eventId;
            setTarget(null);
          }}
        >
          Not a resend
        </Button>
      </div>
    </Alert>
  );
}
