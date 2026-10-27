import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { usePermissions } from '@/hooks/usePermissions';
import { apiErrorMessage } from '@/lib/apiError';
import { getMessageHeaders } from '@/services/message-html.service';

/**
 * "Headers" on a message in the thread: the stored original headers, read-only, for workspace
 * admins (and global admins) only — the backend enforces the same rule. It answers questions like
 * "did this acknowledgement say it was automatic (Auto-Submitted)?" without a database shell.
 *
 * Renders nothing for anyone else, and fetches only once the dialog is opened.
 */
export function OriginalHeadersButton({
  eventId,
  className,
}: {
  eventId: number;
  className?: string;
}) {
  const { isAdmin, isOrgAdmin } = usePermissions();
  const [open, setOpen] = useState(false);
  if (!isAdmin && !isOrgAdmin) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={className ?? 'h-auto px-1 py-0 text-[10.5px]'}
        onClick={() => setOpen(true)}
        title="Show the original headers of this message"
        data-testid="original-headers-button"
      >
        Headers
      </Button>
      {open && <OriginalHeadersDialog eventId={eventId} onClose={() => setOpen(false)} />}
    </>
  );
}

function OriginalHeadersDialog({ eventId, onClose }: { eventId: number; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['message-headers', eventId],
    queryFn: () => getMessageHeaders(eventId),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} size="lg">
      <DialogHeader>
        <DialogTitle>Original headers</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogContent>
        {query.isLoading && <Spinner />}
        {query.isError && (
          <Alert variant="danger">
            {apiErrorMessage(query.error, 'Could not load the headers of this message.')}
          </Alert>
        )}
        {query.data?.headers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            This message kept no headers (for example a chat message, or a copy we only noted).
          </p>
        )}
        {query.data && query.data.headers.length > 0 && (
          <>
            <ul className="space-y-1 font-mono text-xs break-all" data-testid="original-headers">
              {query.data.headers.map((header, index) => (
                // Headers repeat (every relay adds a Received line) and never reorder: the
                // position IS the identity here.
                // eslint-disable-next-line react/no-array-index-key
                <li key={`${index}-${header.name}`}>
                  <span className="font-semibold text-foreground">{header.name}:</span>{' '}
                  <span className="text-muted-foreground">{header.value}</span>
                </li>
              ))}
            </ul>
            {query.data.truncated && (
              <p className="mt-2 text-xs text-warning">Only the first 500 headers are shown.</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
