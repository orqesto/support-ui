import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ChoiceCard } from '@/components/ui/ChoiceCard';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { teamBuilderService, type PresetView } from '../../services/teamBuilder.service';
import { TEAM_ROLE_LABELS } from './teamLabels';

type Props = {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onApply: (preset: PresetView) => void;
};

const keyOf = (preset: PresetView): string => `${preset.scope}:${preset.id}`;

/** Pick a preset to apply to the team. Stays open until the answer arrives. */
export const ApplyPresetDialog = ({ open, busy, error, onClose, onApply }: Props) => {
  const { data: presets = [], isLoading } = useQuery({
    queryKey: ['team-presets'],
    queryFn: () => teamBuilderService.listPresets(),
    enabled: open,
  });
  const [choice, setChoice] = useState<string | null>(null);
  const chosen = presets.find((one) => keyOf(one) === choice) ?? null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply a preset</DialogTitle>
        </DialogHeader>
        {isLoading && <Spinner />}
        <div className="grid gap-3">
          {presets.map((one) => (
            <ChoiceCard
              key={keyOf(one)}
              selected={choice === keyOf(one)}
              onSelect={() => setChoice(keyOf(one))}
            >
              <p className="text-sm font-medium">{one.name}</p>
              <p className="text-xs text-muted-foreground">{one.description}</p>
              <p className="text-xs text-muted-foreground">{one.itemCount} rules</p>
              <div className="flex flex-wrap gap-1">
                {one.roles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {TEAM_ROLE_LABELS[role]}
                  </Badge>
                ))}
              </div>
            </ChoiceCard>
          ))}
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => chosen && onApply(chosen)} isLoading={busy} disabled={!chosen}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
