import { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Toggle } from '@/components/ui/Toggle';
import { usePermissions } from '@/hooks/usePermissions';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import {
  organizationService,
  type BusinessHoursConfig,
  type BusinessHoursRange,
  type BusinessHoursWeekday,
} from '@/services/organization.service';

const DAYS: Array<{ key: BusinessHoursWeekday; label: string }> = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const DEFAULT_RANGE: BusinessHoursRange = ['09:00', '17:00'];
const HHMM = /^([01]?\d|2[0-4]):[0-5]\d$/;

/** Every zone the runtime knows, falling back to the browser's own if the API is unavailable. */
const timezoneOptions = (): Array<{ value: string; label: string }> => {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = supported ? supported('timeZone') : [Intl.DateTimeFormat().resolvedOptions().timeZone];
  return zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }));
};

export const BusinessHoursSettings = () => {
  const { isAdmin, isOrgAdmin } = usePermissions();
  const canManage = isAdmin || isOrgAdmin;

  const [enabled, setEnabled] = useState(false);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [week, setWeek] = useState<Partial<Record<BusinessHoursWeekday, BusinessHoursRange[]>>>({});
  const [holidays, setHolidays] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  /** The backend does not have this endpoint yet — see the skew note in the load handler. */
  const [unavailable, setUnavailable] = useState(false);

  const zones = useMemo(timezoneOptions, []);

  useEffect(() => {
    if (!canManage) return;
    organizationService
      .getBusinessHours()
      .then((data) => {
        setEnabled(data.configured);
        if (data.businessHours) {
          setTimezone(data.businessHours.timezone);
          setWeek(data.businessHours.week ?? {});
          setHolidays((data.businessHours.holidays ?? []).join(', '));
        }
      })
      .catch((err: unknown) => {
        // ⚠️ The frontend deploys on push; the backend ships on a tag, so this UI can reach
        // production before its endpoint does. A 404 here means "not deployed yet", NOT
        // "something is broken" — showing a red error for it would have every admin reporting
        // a bug that resolves itself at the next release.
        //
        // 🪤 The interceptor rebuilds the failure as a fresh Error with `status`; there is no
        // `err.response`. Reading `err.response.status` here would silently never match.
        const status = (err as { status?: number } | undefined)?.status;
        if (status === 404) setUnavailable(true);
        else logger.error('Failed to load business hours', err);
      })
      .finally(() => setLoading(false));
  }, [canManage]);

  const setDay = (day: BusinessHoursWeekday, ranges: BusinessHoursRange[]) =>
    setWeek((current) => ({ ...current, [day]: ranges }));

  const toggleDay = (day: BusinessHoursWeekday, open: boolean) =>
    setDay(day, open ? [[...DEFAULT_RANGE] as BusinessHoursRange] : []);

  const updateRange = (
    day: BusinessHoursWeekday,
    index: number,
    which: 0 | 1,
    value: string
  ) => {
    const ranges = [...(week[day] ?? [])];
    const range: BusinessHoursRange = [...ranges[index]] as BusinessHoursRange;
    range[which] = value;
    ranges[index] = range;
    setDay(day, ranges);
  };

  const openDays = DAYS.filter(({ key }) => (week[key]?.length ?? 0) > 0);

  /** Mirrors the server's rules, so the same input is refused in the same terms. */
  const validationError = (): string => {
    if (openDays.length === 0) {
      return 'Open at least one day, or switch business hours off entirely.';
    }
    for (const { key, label } of DAYS) {
      for (const [open, close] of week[key] ?? []) {
        if (!HHMM.test(open) || !HHMM.test(close)) return `${label}: use HH:MM, for example 09:00.`;
        if (close <= open) return `${label}: the closing time must be after the opening time.`;
      }
    }
    const bad = holidays
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .find((entry) => !/^\d{4}-\d{2}-\d{2}$/.test(entry));
    return bad ? `Holiday "${bad}" is not a date. Use YYYY-MM-DD.` : '';
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    if (enabled) {
      const invalid = validationError();
      if (invalid) {
        setError(invalid);
        return;
      }
    }
    setSaving(true);
    try {
      const payload: BusinessHoursConfig | null = enabled
        ? {
            timezone,
            week: Object.fromEntries(openDays.map(({ key }) => [key, week[key]])),
            holidays: holidays
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean),
          }
        : null;
      await organizationService.updateBusinessHours(payload);
      setSuccess(
        enabled
          ? 'Business hours saved. Response metrics now show an open-hours column alongside wall-clock.'
          : 'Business hours cleared. Response metrics are wall-clock only.'
      );
    } catch (err: unknown) {
      logger.error('Failed to save business hours', err);
      // 🪤 The status was read off a hand-written cast. `getErrorStatus` is the one
      // reader that knows the api-client rebuilds the error without `.response`.
      setError(
        getErrorStatus(err) === 403
          ? 'You do not have permission to change business hours.'
          : (getApiErrorMessage(err) ?? 'Failed to save business hours. Please try again.')
      );
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return null;
  if (loading) return <div className="py-4 text-sm text-muted-foreground">Loading...</div>;

  if (unavailable) {
    return (
      <Alert variant="info">
        Business hours are not available on this deployment yet. They arrive with the next backend
        release; until then response times are reported in wall-clock hours.
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Business hours
          {enabled ? <Badge variant="success">On</Badge> : <Badge variant="secondary">Off</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Response and resolution times are always reported in wall-clock hours. Set a calendar to
          get a second figure that counts only the hours you are open — a message arriving on
          Friday evening and answered first thing Monday reads as three days of wall-clock and a
          few minutes of open time.
        </p>

        <div className="flex items-center gap-3">
          <Toggle checked={enabled} onChange={setEnabled} />
          <Label>Report an open-hours figure alongside wall-clock</Label>
        </div>

        {enabled ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="business-hours-timezone">Timezone</Label>
              <ReactSelect
                inputId="business-hours-timezone"
                options={zones}
                value={timezone}
                onChange={setTimezone}
              />
              <p className="text-xs text-muted-foreground">
                Opening times are wall-clock in this zone, so they follow daylight saving
                automatically.
              </p>
            </div>

            <div className="space-y-3">
              {DAYS.map(({ key, label }) => {
                const ranges = week[key] ?? [];
                const isOpen = ranges.length > 0;
                return (
                  <div key={key} className="flex flex-wrap items-center gap-3">
                    <div className="flex w-40 items-center gap-3">
                      <Toggle checked={isOpen} onChange={(next) => toggleDay(key, next)} />
                      <Label>{label}</Label>
                    </div>
                    {isOpen ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {ranges.map((range, index) => (
                          // The index IS the identity here: ranges are positional rows edited in
                          // place, and two identical ranges on one day would collide on content.
                          // eslint-disable-next-line react/no-array-index-key
                          <div key={`${key}-${index}`} className="flex items-center gap-2">
                            <Input
                              aria-label={`${label} opens`}
                              className="w-24"
                              value={range[0]}
                              onChange={(event) => updateRange(key, index, 0, event.target.value)}
                            />
                            <span className="text-sm text-muted-foreground">to</span>
                            <Input
                              aria-label={`${label} closes`}
                              className="w-24"
                              value={range[1]}
                              onChange={(event) => updateRange(key, index, 1, event.target.value)}
                            />
                            {ranges.length > 1 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Remove ${label} range`}
                                onClick={() =>
                                  setDay(key, ranges.filter((_range, at) => at !== index))
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDay(key, [...ranges, [...DEFAULT_RANGE] as BusinessHoursRange])}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Split
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Closed</span>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Use Split for a day that closes over lunch.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="business-hours-holidays">Holidays</Label>
              <Input
                id="business-hours-holidays"
                value={holidays}
                placeholder="2026-12-25, 2026-12-26"
                onChange={(event) => setHolidays(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated YYYY-MM-DD dates. These count as closed whatever the weekly
                pattern says.
              </p>
            </div>
          </>
        ) : null}

        {error ? <Alert variant="danger">{error}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}

        <div>
          <Button onClick={handleSave} isLoading={saving}>
            Save business hours
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
