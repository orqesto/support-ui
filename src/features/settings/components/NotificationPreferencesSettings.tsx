import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationSettings } from '@/features/settings/hooks/useNotificationSettings';
import {
  LEGACY_LINES,
  type NotificationSettings,
  type SettingsLine,
  type WorkingHours,
} from '@/services/notificationSettingsService';
import { NotificationPreferencesLegacy, type Prefs } from './NotificationPreferencesLegacy';
import { isHours, lineLabel, PRIORITY_OPTIONS, severityLabel } from './notificationKindLabels';
import { WorkingHoursEditor, validateWorkingHours } from './WorkingHoursEditor';

const GROUPS: Array<{ title: string; hint: string; kinds: string[] }> = [
  {
    title: 'Personal',
    hint: 'Threads that are yours.',
    kinds: ['conversation_assigned', 'customer_message_on_assigned', 'conversation_reopened', 'hold_recheck_due'],
  },
  {
    title: 'Team',
    hint: 'Mail and alerts for your teams.',
    kinds: [
      'new_unassigned_message',
      'sla_message_breach',
      'sla_ticket_first_response',
      'sla_ticket_resolution',
      'suspicious_arrival',
      'spam_arrival',
      'one_sided_outbound',
      'customer_reply_in_spam',
    ],
  },
  {
    title: 'Admin',
    hint: 'Workspace health and knowledge base.',
    kinds: [
      'kb_review_pending',
      'kb_consolidation_pending',
      'kb_document_stale',
      'ingestion_dark',
      'ingestion_gap',
      'ai_provider_down',
      'ai_token_limit_reached',
      'mailbox_address_undeclared',
      'slack_connection_broken',
    ],
  },
];
const SETTING_KEYS = ['onlyAssignedToMe', 'slaMinSeverity', 'minPriority', 'workingHours'];

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div data-line-row className="flex flex-wrap justify-between items-center gap-2 py-3 border-b border-border last:border-0">
    <p className="text-sm font-medium">{label}</p>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>
  </div>
);

const statusId = (key: string) => `line-status-${key}`;

const Status = ({ each, onReset }: { each: SettingsLine; onReset: (key: string) => void }) => (
  <>
    {each.alwaysOn && (
      <span id={statusId(each.key)}>
        <Badge variant="secondary">Always on</Badge>
      </span>
    )}
    {!each.alwaysOn && each.locked && (
      <span id={statusId(each.key)}>
        <Badge variant="warning">Set by your admin</Badge>
      </span>
    )}
    {!each.alwaysOn && !each.locked && each.source === 'own' && (
      <Button size="sm" variant="ghost" aria-label={`Reset ${lineLabel(each.key)} to default`} onClick={() => onReset(each.key)}>
        Reset to default
      </Button>
    )}
  </>
);

/** The old preferences, rebuilt from the lines the hook already read (no second GET). */
const legacyPrefs = (settings: NotificationSettings): Partial<Prefs> => {
  const out: Record<string, unknown> = {};
  // One column per line set: the first line of each column carries its value.
  for (const [field, keys] of LEGACY_LINES) {
    if (field === 'onlyAssignedToMe') continue;
    const hit = settings.lines.find((each) => each.key === keys[0]);
    if (hit && hit.value !== null) out[field] = hit.value;
  }
  return out as Partial<Prefs>;
};

const DEBOUNCE_MS = 600;

const selectedOrgKey = (): number | string | null => {
  const state = useAuthStore.getState();
  return state.selectedOrganizationId ?? state.user?.organizationId ?? null;
};

/** Keyed on the workspace so every bit of local state (drafts, pending values, notices) starts clean on a switch. */
export const NotificationPreferencesSettings = () => {
  const orgKey = useAuthStore((state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null);
  return <NotificationPreferencesBody key={orgKey ?? 'none'} />;
};

const NotificationPreferencesBody = () => {
  const { settings, save, reset, loading, error } = useNotificationSettings();
  const sendCount = useRef(0);
  const latestFor = useRef<Record<string, number>>({});
  const hoursTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The working-hours edit waiting for its 600 ms pause, so leaving the page can still save it.
  const hoursWaiting = useRef<{ key: string; value: WorkingHours | null } | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const orgAtMount = useRef(selectedOrgKey());
  // Leaving within the pause: the edit is saved, not dropped, but only into the workspace it was
  // made in (a request after a switch would write A's hours into B). After a switch the person is
  // told it was not saved; on sign-out (no workspace) the copy stays neutral.
  useEffect(
    () => () => {
      if (hoursTimer.current) clearTimeout(hoursTimer.current);
      hoursTimer.current = null;
      const waiting = hoursWaiting.current;
      hoursWaiting.current = null;
      if (!waiting) return;
      const nowOrg = selectedOrgKey();
      if (nowOrg === orgAtMount.current) {
        saveRef.current({ [waiting.key]: waiting.value }).catch((err: unknown) => {
          toast.failure('save your last working-hours change', err);
        });
      } else {
        toast.warning(
          nowOrg === null
            ? 'Your last change to the working hours was not saved.'
            : 'Your last change to the working hours was not saved because you switched workspace.'
        );
      }
    },
    []
  );
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [lockedNames, setLockedNames] = useState<string[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [hoursDraft, setHoursDraft] = useState<{ value: WorkingHours | null } | null>(null);

  if (loading) return <Spinner />;
  // Old server (or a reply without lines): exactly today's page.
  if (!settings || settings.legacy || settings.lines.length === 0) {
    if (error && !settings) return <p className="text-sm text-destructive">{error}</p>;
    return <NotificationPreferencesLegacy initial={settings?.legacy ? legacyPrefs(settings) : undefined} />;
  }

  const byKey = new Map(settings.lines.map((each) => [each.key, each]));
  const valueOf = (each: SettingsLine): unknown => (each.key in pending ? pending[each.key] : each.value);

  const change = async (key: string, value: unknown) => {
    const call = ++sendCount.current;
    latestFor.current[key] = call;
    const isLatest = () => latestFor.current[key] === call;
    setLockedNames([]);
    setFailed(null);
    setPending((prev) => ({ ...prev, [key]: value }));
    try {
      const result = await save({ [key]: value });
      if (!isLatest()) return;
      if ('lockedKeys' in result) {
        setLockedNames(result.lockedKeys.map(lineLabel));
        setHoursDraft(null);
      } else if (key === 'workingHours') {
        // Saved: drop the draft unless the user has edited again since.
        setHoursDraft((prev) => (prev && prev.value === value ? null : prev));
      }
    } catch {
      if (isLatest()) setFailed('Could not save that change.');
    } finally {
      if (isLatest()) {
        setPending((prev) => {
          const { [key]: _gone, ...rest } = prev;
          return rest;
        });
      }
    }
  };

  const changeHours = (key: string, next: WorkingHours | null) => {
    setHoursDraft({ value: next });
    if (hoursTimer.current) clearTimeout(hoursTimer.current);
    // Only valid values are sent, and only once typing pauses.
    if (next === null || validateWorkingHours(next) === null) {
      hoursWaiting.current = { key, value: next };
      hoursTimer.current = setTimeout(() => {
        hoursWaiting.current = null;
        void change(key, next);
      }, DEBOUNCE_MS);
    } else {
      // An invalid draft (the editor says why) is never sent; it also replaces the valid edit that
      // was waiting, so leaving the page does not save a value the screen no longer shows.
      hoursWaiting.current = null;
    }
  };

  const resetLine = async (key: string) => {
    setFailed(null);
    setHoursDraft(null);
    try {
      await reset([key]);
    } catch {
      setFailed('Could not reset that line.');
    }
  };

  const switchRow = (each: SettingsLine) => {
    const label = lineLabel(each.key);
    const fixed = each.alwaysOn || each.locked;
    return (
      <Row key={each.key} label={label}>
        <Status each={each} onReset={resetLine} />
        <Toggle
          ariaLabel={label}
          ariaDescribedBy={fixed ? statusId(each.key) : undefined}
          checked={each.alwaysOn ? true : valueOf(each) === true}
          disabled={fixed}
          onChange={(next) => change(each.key, next)}
        />
      </Row>
    );
  };

  const known = new Set([...GROUPS.flatMap((grp) => grp.kinds.map((kind) => `kind:${kind}`)), ...SETTING_KEYS]);
  const others = settings.lines.filter((each) => !known.has(each.key));
  const sections = [
    ...GROUPS.map((grp) => ({
      ...grp,
      rows: grp.kinds.map((kind) => byKey.get(`kind:${kind}`)).filter((each): each is SettingsLine => !!each),
    })),
    { title: 'Other', hint: '', kinds: [], rows: others },
  ].filter((section) => section.rows.length > 0);

  const only = byKey.get('onlyAssignedToMe');
  const severity = byKey.get('slaMinSeverity');
  const priority = byKey.get('minPriority');
  const hours = byKey.get('workingHours');
  const hoursValue = hoursDraft ? hoursDraft.value : isHours(hours?.value) ? hours.value : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Notification preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What reaches your alert center. Lines your admin set are marked; the rest are yours to change.
        </p>
      </div>

      {lockedNames.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            Set by your admin: {lockedNames.join(', ')}. Those were not changed; your other changes were saved.
          </AlertDescription>
        </Alert>
      )}
      {failed && <p className="text-sm text-destructive">{failed}</p>}

      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="font-display text-sm font-semibold mb-1">{section.title}</h3>
          {section.hint && <p className="text-xs text-muted-foreground mb-3">{section.hint}</p>}
          <div className="rounded-lg border border-border bg-card px-4">{section.rows.map(switchRow)}</div>
        </div>
      ))}

      {(only || severity || priority || hours) && (
        <div>
          <h3 className="font-display text-sm font-semibold mb-3">Settings</h3>
          <div className="rounded-lg border border-border bg-card px-4">
            {only && switchRow(only)}
            {severity && (
              <Row label={lineLabel(severity.key)}>
                <Status each={severity} onReset={resetLine} />
                {(['warning', 'critical'] as const).map((sev) => (
                  <Button
                    key={sev}
                    size="sm"
                    variant={valueOf(severity) === sev ? 'primary' : 'outline'}
                    disabled={severity.locked}
                    aria-label={`${lineLabel(severity.key)}: ${severityLabel(sev)}`}
                    aria-pressed={valueOf(severity) === sev}
                    onClick={() => change(severity.key, sev)}
                  >
                    {severityLabel(sev)}
                  </Button>
                ))}
              </Row>
            )}
            {priority && (
              <Row label="Minimum priority">
                <Status each={priority} onReset={resetLine} />
                <div className="w-40">
                  <Select
                    aria-label="Minimum priority"
                    options={PRIORITY_OPTIONS}
                    value={typeof valueOf(priority) === 'string' ? (valueOf(priority) as string) : 'low'}
                    disabled={priority.locked}
                    onChange={(next) => change(priority.key, next)}
                    hint="Applies to new unassigned mail only."
                  />
                </div>
              </Row>
            )}
            {hours && (
              <div data-line-row className="border-b border-border last:border-0">
                <div className="flex items-center justify-between pt-3">
                  <p className="text-sm font-medium">Working hours</p>
                  <Status each={hours} onReset={resetLine} />
                </div>
                <WorkingHoursEditor
                  value={hoursValue}
                  disabled={hours.locked}
                  onChange={(next) => {
                    changeHours(hours.key, next);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
