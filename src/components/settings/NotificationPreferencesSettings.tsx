import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import type { SettingsLine, WorkingHours } from '@/services/notificationSettingsService';
import { NotificationPreferencesLegacy } from './NotificationPreferencesLegacy';
import { lineLabel } from './notificationKindLabels';
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
const PRIORITIES = ['low', 'medium', 'high', 'critical'].map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

const isHours = (val: unknown): val is WorkingHours =>
  typeof val === 'object' && val !== null && Array.isArray((val as WorkingHours).days);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div data-line-row className="flex flex-wrap justify-between items-center gap-2 py-3 border-b border-border last:border-0">
    <p className="text-sm font-medium">{label}</p>
    <div className="flex items-center gap-3">{children}</div>
  </div>
);

export const NotificationPreferencesSettings = () => {
  const { settings, save, reset, loading, error } = useNotificationSettings();
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [lockedNames, setLockedNames] = useState<string[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [hoursDraft, setHoursDraft] = useState<{ value: WorkingHours | null } | null>(null);

  if (loading) return <Spinner />;
  // Old server (or a reply without lines): exactly today's page.
  if (!settings || settings.legacy || settings.lines.length === 0) {
    if (error && !settings) return <p className="text-sm text-destructive">{error}</p>;
    return <NotificationPreferencesLegacy />;
  }

  const byKey = new Map(settings.lines.map((each) => [each.key, each]));
  const valueOf = (each: SettingsLine): unknown => (each.key in pending ? pending[each.key] : each.value);

  const change = async (key: string, value: unknown) => {
    setLockedNames([]);
    setFailed(null);
    setPending((prev) => ({ ...prev, [key]: value }));
    try {
      const result = await save({ [key]: value });
      if ('lockedKeys' in result) {
        setLockedNames(result.lockedKeys.map(lineLabel));
        setHoursDraft(null);
      }
    } catch {
      setFailed('Could not save that change.');
    } finally {
      setPending((prev) => {
        const { [key]: _gone, ...rest } = prev;
        return rest;
      });
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

  const Status = ({ each }: { each: SettingsLine }) => (
    <>
      {each.alwaysOn && <Badge variant="secondary">Always on</Badge>}
      {!each.alwaysOn && each.locked && <Badge variant="warning">Set by your admin</Badge>}
      {!each.alwaysOn && !each.locked && each.source === 'own' && (
        <Button size="sm" variant="ghost" onClick={() => resetLine(each.key)}>
          Reset to default
        </Button>
      )}
    </>
  );

  const switchRow = (each: SettingsLine) => {
    const label = lineLabel(each.key);
    const fixed = each.alwaysOn || each.locked;
    return (
      <Row key={each.key} label={label}>
        <Status each={each} />
        <Toggle
          ariaLabel={label}
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
                <Status each={severity} />
                {(['warning', 'critical'] as const).map((sev) => (
                  <Button
                    key={sev}
                    size="sm"
                    variant={valueOf(severity) === sev ? 'primary' : 'outline'}
                    disabled={severity.locked}
                    onClick={() => change(severity.key, sev)}
                  >
                    {sev === 'warning' ? 'All (warning+)' : 'Critical only'}
                  </Button>
                ))}
              </Row>
            )}
            {priority && (
              <Row label="Minimum priority">
                <Status each={priority} />
                <div className="w-40">
                  <Select
                    options={PRIORITIES}
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
                  <Status each={hours} />
                </div>
                <WorkingHoursEditor
                  value={hoursValue}
                  disabled={hours.locked}
                  onChange={(next) => {
                    setHoursDraft({ value: next });
                    if (next === null || validateWorkingHours(next) === null) void change(hours.key, next);
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
