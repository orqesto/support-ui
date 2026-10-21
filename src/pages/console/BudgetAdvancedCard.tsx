import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ADVANCED_ANCHOR, dollarsText, parseDollars } from '@/components/budget/budget.rules';
import { useUpdateBudgetSettings } from '@/hooks/useBudgets';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { BudgetSettingsView, SettingsUpdate } from '@/services/budgets.service';

export { ADVANCED_ANCHOR };

type Field = {
  key: keyof SettingsUpdate;
  label: string;
  hint: string;
  /** Money in dollars (typed) <-> micros (sent). */
  dollars?: boolean;
  /** Blank is allowed and means "none" (serverCeiling). */
  nullable?: boolean;
  integer?: boolean;
};

const FIELDS: Field[] = [
  {
    key: 'bulkPctMin',
    label: 'Bulk limit, lowest %',
    hint: 'The bulk line cannot go below it.',
    integer: true,
  },
  {
    key: 'bulkPctMax',
    label: 'Bulk limit, highest %',
    hint: 'The bulk line cannot go above it.',
    integer: true,
  },
  {
    key: 'defaultBulkPct',
    label: 'Bulk limit, default %',
    hint: 'Where a new group starts.',
    integer: true,
  },
  {
    key: 'microsPerMessage',
    label: 'Money per message, micros ($0.000001)',
    hint: "A plan's messages × this = its share of the budget. 4000 = $0.004.",
    integer: true,
  },
  {
    key: 'serverCeiling',
    label: 'Server ceiling, US dollars / month',
    hint: 'Everything on this server stops at it. Empty = none.',
    dollars: true,
    nullable: true,
  },
  {
    key: 'defaultStandaloneBudget',
    label: 'Default budget for new standalone workspaces, US dollars / month',
    hint: 'A standalone workspace with no budget of its own gets this. Empty = none.',
    dollars: true,
    nullable: true,
  },
  {
    key: 'liveSpikeFactor',
    label: 'Live spike warning, × a usual day',
    hint: 'A workspace whose live mail today is this many times its usual day gets a warning.',
  },
];

const shown = (field: Field, settings: BudgetSettingsView): string => {
  const value = settings[field.key];
  if (value === null || value === undefined) return '';
  return field.dollars ? dollarsText(value) : String(value);
};

/** The platform-wide budget settings, collapsed under "Advanced" on AI Spend. */
export const BudgetAdvancedCard = ({
  settings,
  selfHosted,
}: {
  settings: BudgetSettingsView;
  selfHosted: boolean;
}) => {
  const location = useLocation();
  const linkedHere = location.hash === `#${ADVANCED_ANCHOR}`;
  const [open, setOpen] = useState(linkedHere);
  // The card mounts only once the budget state has loaded (it sits at the bottom of a long page),
  // so the browser's own jump to the hash has already missed it: scroll to it here.
  useEffect(() => {
    if (linkedHere)
      document
        .getElementById(ADVANCED_ANCHOR)
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [linkedHere]);
  const [drafts, setDrafts] = useState<Partial<Record<keyof SettingsUpdate, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useUpdateBudgetSettings();
  // Hosted: money per message turns plans into budgets. Self-hosted only (the API refuses them on
  // hosted): the server ceiling and the default standalone budget.
  const fields = FIELDS.filter((field) =>
    field.key === 'microsPerMessage'
      ? !selfHosted
      : field.key === 'serverCeiling' || field.key === 'defaultStandaloneBudget'
        ? selfHosted
        : true
  );

  const onSave = () => {
    const body: SettingsUpdate = {};
    for (const field of fields) {
      const draft = drafts[field.key];
      if (draft === undefined || draft.trim() === shown(field, settings)) continue;
      const trimmed = draft.trim();
      if (trimmed === '' && field.nullable) {
        Object.assign(body, { [field.key]: null });
        continue;
      }
      const value = field.dollars ? parseDollars(trimmed) : Number(trimmed);
      if (
        value === null ||
        !Number.isFinite(value) ||
        value <= 0 ||
        (field.integer && !Number.isInteger(value))
      ) {
        setError(`${field.label}: type a ${field.integer ? 'whole ' : ''}number above 0.`);
        return;
      }
      Object.assign(body, { [field.key]: value });
    }
    setError(null);
    if (Object.keys(body).length === 0) return;
    save.mutate(body, {
      onSuccess: () => {
        setDrafts({});
        toast.success('Budget settings saved');
      },
      onError: (saveError) =>
        setError(getApiErrorMessage(saveError) ?? 'Could not save the budget settings.'),
    });
  };

  return (
    <Card id={ADVANCED_ANCHOR}>
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex justify-between items-center">
          <h3 className="font-display text-base font-semibold">Advanced</h3>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={`${ADVANCED_ANCHOR}-body`}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? 'Hide' : 'Show'}
          </Button>
        </div>
        {open && (
          <div id={`${ADVANCED_ANCHOR}-body`} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1">
                  <Input
                    label={field.label}
                    type="number"
                    value={drafts[field.key] ?? shown(field, settings)}
                    placeholder={field.nullable ? 'None' : undefined}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                    size="sm"
                  />
                  <span className="text-xs text-muted-foreground">{field.hint}</span>
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div>
              <Button size="sm" isLoading={save.isPending} onClick={onSave}>
                Save settings
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
