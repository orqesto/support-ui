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
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';

type Props = {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: { name: string; description: string }) => void;
};

/** Name a preset made from this team's rules. Stays open until the answer arrives. */
export const SaveAsPresetDialog = ({ open, busy, error, onClose, onSave }: Props) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const trimmed = name.trim();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as preset</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="save-preset-name">Preset name</Label>
            <Input
              id="save-preset-name"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Textarea
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave({ name: trimmed, description: description.trim() })}
            isLoading={busy}
            disabled={trimmed === ''}
          >
            Save preset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
