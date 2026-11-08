import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select, type Option } from '@/components/ui/Select';
import { apiErrorMessage } from '@/lib/apiError';
import maintenanceService, { type AnalyticsExclusionsState } from '@/services/maintenance.service';

/**
 * Console → Maintenance: workspaces that never send product analytics (2026-11-07, tracking plan
 * phase 1). Meant for the owner's own demo and testing workspaces, so they stay out of the signup →
 * paid funnel. System and load-test workspaces are always excluded by the backend, listed or not.
 * The list is sent whole.
 */

const sameIds = (left: number[], right: number[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const sorted = (ids: number[]) => [...new Set(ids)].sort((left, right) => left - right);

export const AnalyticsExclusionsCard = ({
  state,
  workspaceOptions,
  queryKey,
}: {
  state: AnalyticsExclusionsState;
  workspaceOptions: Option[];
  queryKey: readonly unknown[];
}) => {
  const queryClient = useQueryClient();
  const saved = sorted(state.workspaceIds);
  const [selected, setSelected] = useState<number[]>(saved);
  const dirty = !sameIds(sorted(selected), saved);

  // A listed workspace missing from the picker (deleted, or the list is still loading) stays
  // visible by id, so a save never drops it silently.
  const options = useMemo<Option[]>(() => {
    const known = new Set(workspaceOptions.map((option) => option.value));
    const extra = selected
      .filter((id) => !known.has(String(id)))
      .map((id) => ({ value: String(id), label: `Workspace #${id}` }));
    return [...workspaceOptions, ...extra];
  }, [workspaceOptions, selected]);

  const save = useMutation({
    mutationFn: (next: number[]) => maintenanceService.setAnalyticsExclusions(next),
    onSuccess: (ids) => {
      setSelected(sorted(ids));
      toast.success('Analytics exclusions saved — they take effect within a minute');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save the analytics exclusions.')),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <EyeOff className="w-5 h-5 text-muted-foreground" />
          Analytics exclusions
        </CardTitle>
        <CardDescription>
          These workspaces never send product events to PostHog — use it for your own demo and
          testing workspaces so they stay out of the signup-to-paid funnel. The platform workspace
          and load-test workspaces are always excluded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.selfHosted && (
          <Alert variant="info">
            This server is self-hosted, so it never sends analytics. The list below changes nothing
            here.
          </Alert>
        )}
        <Select
          multi
          searchable
          label="Excluded workspaces"
          placeholder="Pick workspaces…"
          options={options}
          value={selected.map(String)}
          onChange={(values) =>
            setSelected(values.map(Number).filter((id) => Number.isInteger(id) && id > 0))
          }
        />
        <Button onClick={() => save.mutate(sorted(selected))} disabled={!dirty || save.isPending}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
};
