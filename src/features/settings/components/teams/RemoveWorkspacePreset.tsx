import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { teamBuilderService, type PresetView } from '../../services/teamBuilder.service';

const REMOVE_FAILED_TEXT = 'The preset could not be removed.';

type Props = {
  preset: PresetView;
  /** The page is creating a team (possibly from this preset): no removal meanwhile. */
  disabled?: boolean;
};

/**
 * Removes a preset this workspace saved (the backend archives it). Built-in and console presets
 * are not the workspace's to remove, so this renders nothing for them. Teams already made from
 * the preset keep their rules: a team holds copies. A page that had this preset chosen needs no
 * reset: the choice no longer matches a listed preset, so it selects nothing.
 */
export const RemoveWorkspacePreset = ({ preset, disabled = false }: Props) => {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One request at a time: a second confirm click during the dialog's close sends nothing.
  const inFlight = useRef(false);
  if (preset.scope !== 'workspace') return null;

  const remove = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAsking(false);
    setBusy(true);
    setError(null);
    try {
      await teamBuilderService.archivePreset(preset.id);
      await queryClient.invalidateQueries({ queryKey: ['team-presets'] });
    } catch (err) {
      setError(getApiErrorMessage(err) ?? REMOVE_FAILED_TEXT);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="sm"
        isLoading={busy}
        disabled={disabled}
        onClick={() => setAsking(true)}
        aria-label={`Remove preset ${preset.name}`}
      >
        Remove
      </Button>
      {error && <Alert variant="danger">{error}</Alert>}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        onConfirm={() => void remove()}
        title="Remove this preset?"
        description={`"${preset.name}" will no longer be offered when making a team. Teams already made from it keep their rules.`}
        confirmText="Remove"
      />
    </div>
  );
};
