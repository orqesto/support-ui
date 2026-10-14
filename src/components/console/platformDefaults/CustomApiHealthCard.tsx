import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useUpdatePlatformCustomApi } from '@/hooks/usePlatformSettings';
import type { PlatformSettings } from '@/services/platformSettings.service';
import { SourceBadge } from './SourceBadge';

export const CUSTOM_API_HEALTH_NOT_DEPLOYED =
  'This server does not have this setting yet — it arrives with the next backend release.';

/** A whole number of 1 or more, or null — the same rule the backend validates by. */
const asCount = (text: string): number | null => {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= 1 ? value : null;
};

/**
 * Platform Defaults → Custom API health (D5, 2026-10-14): how many nothing-found results in a row
 * make a lookup's row in Settings suggest checking its address, and how recent a found result
 * must be for its green dot. Absent from an older backend's settings, and then nothing here can be
 * edited — the card says why instead of offering a save that has no route behind it.
 */
export const CustomApiHealthCard = ({
  customApi,
}: {
  customApi: PlatformSettings['customApi'];
}) => {
  const save = useUpdatePlatformCustomApi();
  const health = customApi?.health;
  const savedStreak = health?.noMatchStreak.value;
  const savedDays = health?.okWindowDays.value;
  const [streak, setStreak] = useState(String(savedStreak ?? ''));
  const [days, setDays] = useState(String(savedDays ?? ''));
  // Re-seed when the saved values arrive or change (the query refetches after a save).
  useEffect(() => {
    setStreak(String(savedStreak ?? ''));
    setDays(String(savedDays ?? ''));
  }, [savedStreak, savedDays]);
  const noMatchStreak = asCount(streak);
  const okWindowDays = asCount(days);
  return (
    <Card data-config-card="Custom API health">
      <CardHeader>
        <CardTitle className="flex gap-2 items-center text-xl">
          <Activity className="w-5 h-5" />
          Custom API health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!health ? (
          <p className="text-sm text-muted-foreground">{CUSTOM_API_HEALTH_NOT_DEPLOYED}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              When a lookup&rsquo;s row in Settings says it keeps finding nothing, and how recent a
              found result must be for its green dot.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  label="Nothing found in a row before a lookup is flagged"
                  value={streak}
                  onChange={(event) => setStreak(event.target.value)}
                />
                <SourceBadge source={health.noMatchStreak.source} />
              </div>
              <div className="space-y-1">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  label="Recent means within (days)"
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                />
                <SourceBadge source={health.okWindowDays.source} />
              </div>
            </div>
            <Button
              disabled={save.isPending || noMatchStreak === null || okWindowDays === null}
              onClick={() => {
                if (noMatchStreak !== null && okWindowDays !== null) {
                  save.mutate({ noMatchStreak, okWindowDays });
                }
              }}
            >
              Save
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
