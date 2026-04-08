import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';
import { ticketService } from '@/services/ticket.service';

type ConvertBotConversationModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: number;
  onSuccess?: (converted: number) => void;
};

export const ConvertBotConversationModal = ({
  open,
  onOpenChange,
  ticketId,
  onSuccess,
}: ConvertBotConversationModalProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await ticketService.convertBotConversation(ticketId);
      if (result.data) {
        onSuccess?.(result.data.converted);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert bot conversation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle className="flex gap-2 items-center">
          <MessageSquare className="w-5 h-5" />
          Convert Bot Conversation
        </DialogTitle>
        <DialogClose onClose={() => onOpenChange(false)} />
      </DialogHeader>
      <DialogContent>
        <p className="text-sm text-muted-foreground">
          This will import all messages from the bot conversation into this ticket as internal
          comments, preserving the original timestamps and labeling each message as{' '}
          <strong>User</strong> or <strong>Bot</strong>.
        </p>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleConvert} isLoading={loading} disabled={loading}>
          Convert
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
