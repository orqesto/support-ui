import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { LibraryPicker } from './LibraryPicker';

type Props = {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onAdd: (itemIds: number[]) => void;
};

/** Pick library rules to copy onto the team. Stays open until the answer arrives. */
export const AddFromLibraryDialog = ({ open, busy, error, onClose, onAdd }: Props) => {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add rules from the library</DialogTitle>
        </DialogHeader>
        <LibraryPicker selected={picked} onChange={setPicked} />
        {error && <Alert variant="danger">{error}</Alert>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onAdd([...picked])}
            isLoading={busy}
            disabled={picked.size === 0}
          >
            Add {picked.size} {picked.size === 1 ? 'rule' : 'rules'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
