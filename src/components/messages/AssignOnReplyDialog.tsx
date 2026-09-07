import { UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import type { AssignOnReplyPrompt } from './assignOnReplyPrompt';

/**
 * Asked on Send, before the reply goes out (owner decision 2026-09-07): does this thread
 * become yours? Three ways out, none of them silent — assign and send, send without
 * owning, or cancel and keep editing. Closing the dialog (Escape, backdrop, X) is a
 * cancel: nothing is sent, nothing is assigned.
 */
export const AssignOnReplyDialog = ({
  prompt,
  sending,
  onChoose,
  onCancel,
}: {
  prompt: AssignOnReplyPrompt | null;
  sending: boolean;
  onChoose: (assign: 'me' | 'none') => void;
  onCancel: () => void;
}) => {
  const open = prompt !== null;
  const takeover = prompt?.kind === 'takeover';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !sending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {takeover
              ? `Take over this thread from ${prompt.ownerName}?`
              : 'Assign this thread to you?'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-4">
          <UserCheck className="w-6 h-6 shrink-0 text-primary" />
          <p className="text-sm text-foreground">
            {takeover
              ? `${prompt.ownerName} owns this thread. Your reply is sent either way; taking over makes you the owner from now on.`
              : 'Nobody owns this thread yet. Your reply is sent either way; assigning it to you tells the team you are handling it.'}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={sending}
            data-testid="assign-on-reply-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => onChoose('none')}
            isLoading={sending}
            data-testid="assign-on-reply-none"
          >
            {takeover ? 'Reply only' : 'Send without assigning'}
          </Button>
          <Button
            onClick={() => onChoose('me')}
            isLoading={sending}
            data-testid="assign-on-reply-me"
          >
            {takeover ? 'Take over & send' : 'Assign to me & send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
