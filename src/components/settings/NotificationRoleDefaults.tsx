import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { roleDisplayNames } from '@/types/roles';
import {
  saveRoleDefaults,
  type RoleDefaults,
  type RoleDefaultsLine,
} from '@/services/notificationSettingsService';
import { invalidateRoleDefaults, loadRoleDefaults } from '@/services/notificationRoleDefaultsShared';
import { isHours, lineLabel, PRIORITY_OPTIONS, SEVERITY_OPTIONS } from './notificationKindLabels';
import { WorkingHoursEditor, validateWorkingHours } from './WorkingHoursEditor';

type Draft = { value: unknown; locked: boolean };
type RoleName = 'org_admin' | 'moderator' | 'support' | 'associate';
const ROLE_ORDER: RoleName[] = ['org_admin', 'moderator', 'support', 'associate'];

/** Keyed on the workspace so no role data survives a switch. */
export const NotificationRoleDefaults = () => {
  const orgKey = useAuthStore((state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null);
  return <RoleDefaultsBody key={orgKey ?? 'none'} orgKey={orgKey} />;
};

const RoleDefaultsBody = ({ orgKey }: { orgKey: number | string | null }) => {
  const [data, setData] = useState<RoleDefaults | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<string>('org_admin');
  const [drafts, setDrafts] = useState<Record<string, Record<string, Draft>>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Unsaved drafts live only on this page: leaving it (another tab, another workspace) drops them,
  // so the person is told instead of losing them silently.
  const dirtyRef = useRef(false);
  dirtyRef.current = Object.values(drafts).some((roleDraft) => Object.keys(roleDraft).length > 0);
  useEffect(
    () => () => {
      if (!dirtyRef.current) return;
      const state = useAuthStore.getState();
      const nowOrg = state.selectedOrganizationId ?? state.user?.organizationId ?? null;
      toast.warning(
        nowOrg !== orgKey
          ? 'Your unsaved changes to the notification defaults were discarded because you switched workspace.'
          : 'Your unsaved changes to the notification defaults were not saved.'
      );
    },
    [orgKey]
  );

  useEffect(() => {
    let live = true;
    // Shared with the Workspace-settings tab probe: opening the tab does not fetch again.
    loadRoleDefaults(orgKey)
      .then((res) => live && setData(res))
      .catch(() => live && setLoadError('Could not load the role defaults.'));
    return () => {
      live = false;
    };
  }, [orgKey, attempt]);

  if (loadError)
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setLoadError(null);
            setAttempt((prev) => prev + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  if (data === undefined) return <Spinner />;
  if (data === null)
    return <p className="text-sm text-muted-foreground">Notifications by role are not available on this server yet.</p>;

  const current = data.roles.find((each) => each.role === role) ?? data.roles[0];
  const roleDrafts = (current && drafts[current.role]) || {};
  const effective = (line: RoleDefaultsLine): Draft => roleDrafts[line.key] ?? { value: line.value, locked: line.locked };
  const setDraft = (line: RoleDefaultsLine, patch: Partial<Draft>) => {
    if (!current) return;
    setSaved(false);
    setFailed(null);
    setDrafts((prev) => ({
      ...prev,
      [current.role]: { ...prev[current.role], [line.key]: { ...effective(line), ...patch } },
    }));
  };

  const hoursInvalid = (current?.lines ?? []).some((line) => {
    const val = effective(line).value;
    return line.key === 'workingHours' && roleDrafts[line.key] && isHours(val) && validateWorkingHours(val) !== null;
  });
  const dirty = Object.keys(roleDrafts).length > 0;

  const save = async () => {
    if (!current) return;
    setSaving(true);
    setFailed(null);
    try {
      // Only what the admin changed; always-on lines are never sent (the server refuses them).
      const body: Record<string, Draft> = {};
      for (const line of current.lines) {
        if (!line.alwaysOn && roleDrafts[line.key]) body[line.key] = roleDrafts[line.key];
      }
      const fresh = await saveRoleDefaults(current.role, body);
      invalidateRoleDefaults(orgKey);
      setData(fresh);
      setDrafts((prev) => ({ ...prev, [current.role]: {} }));
      setSaved(true);
    } catch {
      setFailed('Could not save the role defaults.');
    } finally {
      setSaving(false);
    }
  };

  const toggleLock = (line: RoleDefaultsLine, next: boolean) => {
    if (next && line.differing > 0 && !line.locked) setConfirmKey(line.key);
    else setDraft(line, { locked: next });
  };

  const valueControl = (line: RoleDefaultsLine, label: string, disabled: boolean) => {
    const value = effective(line).value;
    if (line.key === 'minPriority')
      return (
        <div className="w-40">
          <Select
            aria-label={label}
            options={PRIORITY_OPTIONS}
            value={typeof value === 'string' ? value : 'low'}
            disabled={disabled}
            onChange={(next) => setDraft(line, { value: next })}
          />
        </div>
      );
    if (line.key === 'slaMinSeverity')
      return (
        <div className="w-44">
          <Select
            aria-label={label}
            options={SEVERITY_OPTIONS}
            value={typeof value === 'string' ? value : 'warning'}
            disabled={disabled}
            onChange={(next) => setDraft(line, { value: next })}
          />
        </div>
      );
    if (line.key === 'workingHours') return null;
    return (
      <Toggle
        ariaLabel={label}
        checked={line.alwaysOn ? true : value === true}
        disabled={disabled}
        onChange={(next) => setDraft(line, { value: next })}
      />
    );
  };

  const lineRow = (line: RoleDefaultsLine) => {
    const label = lineLabel(line.key);
    const draft = effective(line);
    const people = line.differingUsers;
    return (
      <div key={line.key} data-line-row className="py-3 border-b border-border last:border-0">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <p className="text-sm font-medium">{label}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {line.alwaysOn ? (
              <>
                <span className="text-xs text-muted-foreground">Always on</span>
                <Toggle ariaLabel={label} checked disabled onChange={() => undefined} />
              </>
            ) : (
              <>
                {valueControl(line, label, false)}
                <Toggle
                  ariaLabel={`Locked: ${label}`}
                  label={draft.locked ? 'Locked' : 'Users may change this'}
                  checked={draft.locked}
                  onChange={(next) => toggleLock(line, next)}
                />
              </>
            )}
          </div>
        </div>
        {line.key === 'workingHours' && !line.alwaysOn && (
          <WorkingHoursEditor
            value={isHours(draft.value) ? draft.value : null}
            onChange={(next) => setDraft(line, { value: next })}
          />
        )}
        {!line.alwaysOn && !draft.locked && line.differing > 0 && (
          <div className="mt-1">
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              aria-expanded={!!open[line.key]}
              onClick={() => setOpen((prev) => ({ ...prev, [line.key]: !prev[line.key] }))}
            >
              {`${line.differing} ${line.differing === 1 ? 'person uses' : 'people use'} their own value`}
            </button>
            {open[line.key] && (
              <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                {people.map((who) => (
                  <li key={who.id}>{who.name}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  const confirmLine = current?.lines.find((line) => line.key === confirmKey);
  const names = confirmLine?.differingUsers.map((who) => who.name).join(', ') ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Notifications by role</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What each role gets by default. Lock a line to stop people changing it.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ROLE_ORDER.filter((name) => data.roles.some((each) => each.role === name)).map((name) => (
          <Button
            key={name}
            size="sm"
            variant={current?.role === name ? 'primary' : 'outline'}
            aria-pressed={current?.role === name}
            onClick={() => {
              setRole(name);
              setSaved(false);
              setFailed(null);
            }}
          >
            {roleDisplayNames[name]}
            {(drafts[name] && Object.keys(drafts[name]).length > 0) && (
              <span
                role="img"
                aria-label="unsaved changes"
                title="Unsaved changes"
                className="ml-2 inline-block h-2 w-2 rounded-full bg-warning"
              />
            )}
          </Button>
        ))}
      </div>

      {saved && (
        <Alert variant="success">
          <AlertDescription>Saved.</AlertDescription>
        </Alert>
      )}
      {failed && <p className="text-sm text-destructive">{failed}</p>}

      <div className="rounded-lg border border-border bg-card px-4">{(current?.lines ?? []).map(lineRow)}</div>

      <Button onClick={() => void save()} disabled={!dirty || saving || hoursInvalid}>
        Save
      </Button>

      <ConfirmDialog
        open={confirmKey !== null}
        onOpenChange={(next) => !next && setConfirmKey(null)}
        title={confirmLine ? `Lock ${lineLabel(confirmLine.key)}?` : 'Lock this line?'}
        description={`${names} use their own value. Their own choice will be replaced by the one set here.`}
        confirmText="Lock"
        onConfirm={() => {
          if (confirmLine) setDraft(confirmLine, { locked: true });
          setConfirmKey(null);
        }}
      />
    </div>
  );
};
