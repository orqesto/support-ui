import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StrictFeatureGate } from '@/components/common/StrictFeatureGate';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DataTable } from '@/components/ui/DataTable';
import type { ColumnDef } from '@/components/ui/DataTable/dataTable.types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog/Dialog';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { FLOW_LABELS } from '@/features/rule-library/payloadFields';
import { listLibraryItems, RULE_LIBRARY_FLOWS, type RuleLibraryFlow } from '@/features/rule-library/services/ruleLibrary.service';
import {
  createTeamPreset,
  listTeamPresets,
  updateTeamPreset,
  TEAM_ROLE_LABELS,
  TEAM_ROLES,
  type ConsolePreset,
  type TeamRole,
} from '@/features/rule-library/services/teamPresets.service';
import { getApiErrorMessage, getErrorBody, getErrorStatus } from '@/lib/errorMessages';

/** Same flag as the rule library: the presets are built from its items. */
export const TEAM_PRESETS_FLAG = 'ui.rule_library_console';

const KEY = ['platform', 'team-presets'];
const PICK_PAGE_SIZE = 100;
/** Roles live in `roles`, so capability items are never offered as items. */
const PICK_FLOWS = RULE_LIBRARY_FLOWS.filter((flow) => flow !== 'capability');
const FLOW_OPTIONS = PICK_FLOWS.map((flow) => ({ value: flow, label: FLOW_LABELS[flow] }));

export const describeError = (err: unknown): string =>
  getApiErrorMessage(err) ?? (err instanceof Error ? err.message : 'Could not save.');
const isStale = (err: unknown) => getErrorStatus(err) === 409 && getErrorBody(err)?.code !== 'PRESET_KEY_TAKEN';

type Draft = {
  id: number | null;
  name: string;
  description: string;
  roles: TeamRole[];
  /** seedKey -> name, kept across flows. */
  picked: Record<string, string>;
  updatedAt: string;
  currentCount: number;
};

const blankDraft = (): Draft => ({ id: null, name: '', description: '', roles: [], picked: {}, updatedAt: '', currentCount: 0 });

const TeamPresetsPage = () => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flow, setFlow] = useState<RuleLibraryFlow>('routing');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const presets = useQuery({ queryKey: KEY, queryFn: listTeamPresets });
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const pickParams = { flow, active: true, page, pageSize: PICK_PAGE_SIZE };
  const library = useQuery({
    queryKey: ['platform', 'team-presets-pick', pickParams],
    queryFn: () => listLibraryItems(pickParams),
    enabled: draft !== null,
  });

  const save = useMutation({
    mutationFn: async (next: Draft) => {
      const items = Object.keys(next.picked).map((librarySeedKey) => ({ librarySeedKey }));
      const text = { name: next.name.trim(), description: next.description.trim() };
      return next.id === null
        ? createTeamPreset({ ...text, roles: next.roles, items })
        : updateTeamPreset(next.id, {
            updatedAt: next.updatedAt,
            ...text,
            roles: next.roles,
            // No pick on an edit keeps the current items; a pick replaces them all.
            ...(items.length > 0 ? { items } : {}),
          });
    },
    onSuccess: () => {
      setDraft(null);
      setError(null);
      void refresh();
    },
    onError: async (err, sent) => {
      setError(describeError(err));
      if (!isStale(err)) return;
      // Reload, then carry the row's new updatedAt into the open draft so a retry can succeed.
      try {
        const fresh = await queryClient.fetchQuery({ queryKey: KEY, queryFn: listTeamPresets, staleTime: 0 });
        const row = fresh.find((preset) => preset.id === sent.id);
        if (row) setDraft((prev) => (prev && prev.id === row.id ? { ...prev, updatedAt: row.updatedAt } : prev));
      } catch {
        void refresh();
      }
    },
  });
  const toggleActive = useMutation({
    mutationFn: (row: ConsolePreset) => updateTeamPreset(row.id, { updatedAt: row.updatedAt, active: !row.active }),
    onSuccess: () => {
      setError(null);
      void refresh();
    },
    onError: (err) => {
      setError(describeError(err));
      if (isStale(err)) void refresh();
    },
  });
  const locked = save.isPending || toggleActive.isPending;

  const columns: ColumnDef<ConsolePreset>[] = [
    { id: 'name', header: 'Name', cell: (row) => row.name, card: 'title' },
    { id: 'source', header: 'Source', cell: (row) => row.source },
    {
      id: 'items',
      header: 'Items',
      cell: (row) => (
        <span>
          {row.itemCount}
          {row.retiredCount > 0 && <span className="text-muted-foreground"> ({row.retiredCount} retired)</span>}
        </span>
      ),
    },
    { id: 'roles', header: 'Roles', cell: (row) => row.roles.map((role) => TEAM_ROLE_LABELS[role]).join(', ') },
    {
      id: 'active',
      header: 'Active',
      cell: (row) => <Badge variant={row.active ? 'success' : 'secondary'}>{row.active ? 'Active' : 'Archived'}</Badge>,
    },
  ];

  const pickedCount = draft ? Object.keys(draft.picked).length : 0;
  const choices = (library.data?.items ?? []).filter((item) => item.seedKey && item.flow !== 'capability');
  const totalPages = Math.max(1, Math.ceil((library.data?.total ?? 0) / PICK_PAGE_SIZE));

  const closeDialog = () => {
    setDraft(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Team presets"
        description="Platform-wide team starting points. Editing a preset changes what new teams start from; it never changes a team that already exists."
        actions={
          <Button
            disabled={locked}
            onClick={() => {
              setError(null);
              setFlow('routing');
              setPage(1);
              setDraft(blankDraft());
            }}
          >
            New preset
          </Button>
        }
      />
      {error && !draft && <Alert variant="danger">{error}</Alert>}
      <DataTable
        rows={presets.data ?? []}
        rowKey={(row) => row.id}
        columns={columns}
        actions={(row) => (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={locked}
              onClick={() => {
                setError(null);
                setFlow('routing');
                setPage(1);
                setDraft({
                  id: row.id,
                  name: row.name,
                  description: row.description,
                  roles: row.roles,
                  picked: {},
                  updatedAt: row.updatedAt,
                  currentCount: row.itemCount,
                });
              }}
            >
              Edit
            </Button>
            <Button size="sm" variant="secondary" disabled={locked} onClick={() => toggleActive.mutate(row)}>
              {row.active ? 'Archive' : 'Restore'}
            </Button>
          </div>
        )}
        pagination={{ mode: 'client', pageSize: 50 }}
        isError={presets.isError}
        onRetry={() => void presets.refetch()}
        empty={{ message: 'No presets.' }}
        actionsLabel="Actions"
      />
      <Dialog open={draft !== null} onOpenChange={(open) => !open && !locked && closeDialog()} dismissOnOverlayClick={false}>
        {draft && (
          <>
            <DialogHeader>
              <DialogTitle>{draft.id === null ? 'New preset' : 'Edit preset'}</DialogTitle>
            </DialogHeader>
            <DialogContent className="space-y-3">
              {error && <Alert variant="danger">{error}</Alert>}
              <Input label="Name" disabled={locked} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              <Textarea
                label="Description"
                disabled={locked}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
              <div className="space-y-1">
                {TEAM_ROLES.map((role) => (
                  <Toggle
                    key={role}
                    label={TEAM_ROLE_LABELS[role]}
                    disabled={locked}
                    checked={draft.roles.includes(role)}
                    onChange={(next) =>
                      setDraft({ ...draft, roles: next ? [...draft.roles, role] : draft.roles.filter((held) => held !== role) })
                    }
                  />
                ))}
              </div>
              {draft.id !== null && (
                <p className="text-sm text-muted-foreground">
                  {`Leave the items empty to keep the current ${draft.currentCount}, or pick items to replace them all.`}
                </p>
              )}
              <p className="text-sm">{`${pickedCount} item${pickedCount === 1 ? '' : 's'} picked`}</p>
              <Select
                label="Flow"
                disabled={locked}
                options={FLOW_OPTIONS}
                value={flow}
                onChange={(next) => {
                  setFlow(next as RuleLibraryFlow);
                  setPage(1);
                }}
              />
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {library.isError && <Alert variant="danger">Could not load library items.</Alert>}
                {choices.map((item) => {
                  const seedKey = item.seedKey as string;
                  return (
                    <Checkbox
                      key={seedKey}
                      label={item.name}
                      disabled={locked}
                      checked={seedKey in draft.picked}
                      onChange={(event) => {
                        const picked = { ...draft.picked };
                        if (event.target.checked) picked[seedKey] = item.name;
                        else delete picked[seedKey];
                        setDraft({ ...draft, picked });
                      }}
                    />
                  );
                })}
                {!library.isLoading && choices.length === 0 && (
                  <p className="text-sm text-muted-foreground">No items with a seed key in this flow.</p>
                )}
              </div>
              {totalPages > 1 && (
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  total={library.data?.total ?? 0}
                  limit={PICK_PAGE_SIZE}
                  onPageChange={setPage}
                  loading={library.isFetching}
                />
              )}
            </DialogContent>
            <DialogFooter>
              <Button variant="secondary" disabled={locked} onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                isLoading={save.isPending}
                disabled={locked || draft.name.trim() === '' || (draft.id === null && pickedCount === 0)}
                onClick={() => save.mutate(draft)}
              >
                Save
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </div>
  );
};

export const PlatformTeamPresets = () => (
  <StrictFeatureGate flag={TEAM_PRESETS_FLAG} title="Team presets">
    <TeamPresetsPage />
  </StrictFeatureGate>
);
