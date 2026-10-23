import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { dollarsText, dollarsToMicros, fmtMoney } from '@/components/budget/budget.rules';
import { usePlatformFreeStarter, useUpdatePlatformFreeStarter } from '@/hooks/usePlatformSettings';
import { SourceBadge } from './SourceBadge';

export const FREE_STARTER_NOT_DEPLOYED =
  'This server does not have this setting yet — it arrives with the next backend release.';

/**
 * Dollars typed by the admin → whole micros, or null when it is not a number of 0 or more within
 * [min, max] micros. 0 is allowed (no KB allowance on our AI).
 */
export const kbAllowanceMicrosFrom = (text: string, min: number, max: number): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  const micros = dollarsToMicros(dollars);
  return micros >= min && micros <= max ? micros : null;
};

/**
 * Platform Defaults → Free AI allowance for the knowledge base (BE #1112): the one-time amount a
 * Free workspace may spend on our AI for knowledge-base processing and history import
 * (`GET/PUT /settings/free-starter`, `kbAllowanceMicros`). Shown in dollars, sent in micros. A
 * workspace's amount is fixed when its allowance is created, so a change applies to new ones.
 * The live-mail allowance (100 messages) is not set here.
 */
export const FreeStarterCard = () => {
  const query = usePlatformFreeStarter();
  const save = useUpdatePlatformFreeStarter();
  const field = query.data?.kbAllowanceMicros;
  const saved = field?.value;
  const [text, setText] = useState(saved === undefined ? '' : dollarsText(saved));
  // Re-seed when the saved value arrives or changes (the query refetches after a save).
  useEffect(() => {
    if (saved !== undefined) setText(dollarsText(saved));
  }, [saved]);

  const title = (
    <CardHeader>
      <CardTitle className="flex gap-2 items-center text-xl">
        <BookOpen className="w-5 h-5" />
        Free AI allowance for the knowledge base
      </CardTitle>
    </CardHeader>
  );

  if (query.isLoading) {
    return (
      <Card data-config-card="Free AI allowance for the knowledge base">
        {title}
        <CardContent>
          <Spinner size={20} />
        </CardContent>
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card data-config-card="Free AI allowance for the knowledge base">
        {title}
        <CardContent>
          <Alert variant="danger">Could not load this setting.</Alert>
        </CardContent>
      </Card>
    );
  }
  if (!field) {
    return (
      <Card data-config-card="Free AI allowance for the knowledge base">
        {title}
        <CardContent>
          <p className="text-sm text-muted-foreground">{FREE_STARTER_NOT_DEPLOYED}</p>
        </CardContent>
      </Card>
    );
  }

  const micros = kbAllowanceMicrosFrom(text, field.min, field.max);
  const error =
    micros === null
      ? `Enter an amount from ${fmtMoney(field.min).replace(/^≈ /, '')} to ${fmtMoney(field.max).replace(/^≈ /, '')}.`
      : undefined;

  return (
    <Card data-config-card="Free AI allowance for the knowledge base">
      {title}
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          A one-time amount each Free workspace can spend on our AI for knowledge-base processing
          and history import. Live mail has its own allowance. A change applies to workspaces whose
          allowance is created after the save.
        </p>
        <div className="space-y-1 sm:max-w-xs">
          <Input
            type="number"
            min={0}
            step="0.01"
            label="Allowance (USD)"
            value={text}
            error={error}
            onChange={(event) => setText(event.target.value)}
          />
          <SourceBadge source={field.source} envLabel="Server setting" />
        </div>
        <Button
          disabled={save.isPending || micros === null || micros === field.value}
          onClick={() => micros !== null && save.mutate(micros)}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
};
