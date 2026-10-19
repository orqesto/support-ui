import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useUpdatePlatformAnalysisHourly } from '@/hooks/usePlatformSettings';
import type {
  AnalysisHourlySettings,
  PlatformAnalysisHourlyInput,
} from '@/services/platformSettings.service';
import { SourceBadge } from './SourceBadge';

export const ANALYSIS_HOURLY_NOT_DEPLOYED =
  'This server does not have this setting yet — it arrives with the next backend release.';

const asInt = (text: string): number | null => {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) ? value : null;
};

/**
 * Platform Defaults → Hourly AI calls (2026-10-19): the most AI calls a managed workspace may make
 * per hour, and how many of them are kept for new customer mail. Knowledge-base work stops at
 * limit − reserve, so live mail always gets AI. Saved with a PARTIAL PUT /settings/analysis-hourly
 * (only the fields that changed). The server is the authority on bounds; the card only stops what
 * it can see is wrong (a blank, a fraction, outside the bounds, reserve not below the limit).
 */
export const AnalysisHourlyCard = ({
  analysisHourly,
}: {
  analysisHourly: AnalysisHourlySettings | undefined;
}) => {
  const save = useUpdatePlatformAnalysisHourly();
  const savedLimit = analysisHourly?.callsPerHour.value;
  const savedReserve = analysisHourly?.liveReserveCallsPerHour.value;
  const [limitText, setLimitText] = useState(String(savedLimit ?? ''));
  const [reserveText, setReserveText] = useState(String(savedReserve ?? ''));
  // Re-seed when the saved values arrive or change (the query refetches after a save).
  useEffect(() => {
    setLimitText(String(savedLimit ?? ''));
    setReserveText(String(savedReserve ?? ''));
  }, [savedLimit, savedReserve]);

  if (!analysisHourly) {
    return (
      <Card data-config-card="Hourly AI calls">
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-xl">
            <Gauge className="w-5 h-5" />
            Hourly AI calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{ANALYSIS_HOURLY_NOT_DEPLOYED}</p>
        </CardContent>
      </Card>
    );
  }

  const { callsPerHour, liveReserveCallsPerHour: reserveField } = analysisHourly;
  const limit = asInt(limitText);
  const reserve = asInt(reserveText);
  const limitError =
    limit === null || limit < callsPerHour.min || limit > callsPerHour.max
      ? `Enter a whole number from ${callsPerHour.min} to ${callsPerHour.max}.`
      : undefined;
  // The reserve's upper bound follows the limit typed here, not the saved one: both may change in
  // one save.
  const reserveError =
    reserve === null || reserve < reserveField.min
      ? `Enter a whole number of ${reserveField.min} or more.`
      : limit !== null && !limitError && reserve >= limit
        ? 'The reserve must be lower than the calls per hour.'
        : undefined;
  const kbCalls = limit !== null && reserve !== null && limit > reserve ? limit - reserve : null;

  const changed: PlatformAnalysisHourlyInput = {};
  if (limit !== null && limit !== callsPerHour.value) changed.callsPerHour = limit;
  if (reserve !== null && reserve !== reserveField.value) {
    changed.liveReserveCallsPerHour = reserve;
  }
  const nothingChanged = Object.keys(changed).length === 0;

  return (
    <Card data-config-card="Hourly AI calls">
      <CardHeader>
        <CardTitle className="flex gap-2 items-center text-xl">
          <Gauge className="w-5 h-5" />
          Hourly AI calls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Managed workspaces can make at most this many AI calls per hour. Knowledge-base work stops
          at the limit minus the reserve, so new customer mail always gets AI.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Input
              type="number"
              min={callsPerHour.min}
              max={callsPerHour.max}
              step={1}
              label="AI calls per hour"
              value={limitText}
              error={limitError}
              onChange={(event) => setLimitText(event.target.value)}
            />
            <SourceBadge source={callsPerHour.source} envLabel="Server setting" />
          </div>
          <div className="space-y-1">
            <Input
              type="number"
              min={reserveField.min}
              max={reserveField.max}
              step={1}
              label="Reserved for live mail"
              value={reserveText}
              error={reserveError}
              onChange={(event) => setReserveText(event.target.value)}
            />
            <SourceBadge source={reserveField.source} envLabel="Server setting" />
          </div>
        </div>
        {reserveField.saved !== undefined && (
          <p className="text-sm text-warning" data-testid="reserve-clamped">
            The saved reserve of {reserveField.saved.toLocaleString()} did not fit under the limit,
            so {reserveField.value.toLocaleString()} is in use. Save a reserve below the limit to
            fix it.
          </p>
        )}
        <p className="text-sm" data-testid="kb-calls-line">
          {kbCalls === null
            ? 'Knowledge base can use up to — calls per hour.'
            : `Knowledge base can use up to ${kbCalls.toLocaleString()} calls per hour.`}
        </p>
        <Button
          disabled={
            save.isPending ||
            nothingChanged ||
            limitError !== undefined ||
            reserveError !== undefined
          }
          onClick={() => save.mutate(changed)}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
};
