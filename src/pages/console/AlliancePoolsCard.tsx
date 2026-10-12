import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useMyAlliances } from '@/hooks/useAllianceAdmin';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  managedAiUsageService,
  type AlliancePoolLimits,
  type TokenCapsTotals,
} from '@/services/managedAiUsage.service';
import { capEdit, parseCapInput, toastLimitSaved } from './tokenLimits.helpers';

type PoolField = keyof AlliancePoolLimits;
const FIELDS: Array<{ key: PoolField; label: string; isKb: boolean }> = [
  { key: 'kbTokensPerDay', label: 'KB processing per day', isKb: true },
  { key: 'regularTokensPerDay', label: 'Regular work per day', isKb: false },
  { key: 'kbTokensPerMonth', label: 'KB processing per month', isKb: true },
  { key: 'regularTokensPerMonth', label: 'Regular work per month', isKb: false },
];
const EMPTY_TEXTS: Record<PoolField, string> = {
  kbTokensPerDay: '',
  regularTokensPerDay: '',
  kbTokensPerMonth: '',
  regularTokensPerMonth: '',
};

type Pool = TokenCapsTotals['alliances'][number];

/** "2,500,000 of 70,000,000" for each limit the pool has; spend of the matching period. */
const describePool = (pool: Pool): string => {
  const parts = FIELDS.flatMap(({ key, label }) => {
    const limit = pool.limits[key];
    if (limit === undefined) return [];
    const bucket = key.startsWith('kb') ? 'kb' : 'regular';
    const spent = key.endsWith('PerDay') ? pool.spentToday[bucket] : pool.spentThisMonth[bucket];
    return [
      `${label}: ${limit === 0 ? 'off (0)' : `${spent.toLocaleString('en-US')} of ${limit.toLocaleString('en-US')}`}`,
    ];
  });
  return parts.length > 0 ? parts.join(' · ') : 'No limits';
};

/**
 * Alliance pools (owner D3, 2026-10-12): a limit on the SUM of an alliance's workspaces' spend,
 * per day and per calendar month (UTC). Own-key spend counts too; whether a member is stopped still
 * follows its own enforcement. Reaching a pool stops every member it applies to.
 */
export const AlliancePoolsCard = ({ caps, kbMin }: { caps: TokenCapsTotals; kbMin: number }) => {
  const queryClient = useQueryClient();
  const { data: alliances = [] } = useMyAlliances();
  /** The alliance being edited (an existing pool or a new one), or null. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [texts, setTexts] = useState<Record<PoolField, string>>(EMPTY_TEXTS);
  const unreadable = caps.lookupFailed === true;

  const saved: AlliancePoolLimits =
    caps.alliances.find((pool) => pool.id === editingId)?.limits ?? {};
  const parsed = FIELDS.map((field) => ({
    field,
    result: parseCapInput(texts[field.key], field.isKb, kbMin),
  }));
  const valid = parsed.every(({ result }) => result.ok);
  const edit: { [K in PoolField]?: number | null } = {};
  for (const { field, result } of parsed) {
    if (!result.ok) continue;
    const value = capEdit(saved[field.key], result.value);
    if (value !== undefined) edit[field.key] = value;
  }
  const changed = Object.keys(edit).length > 0;

  const open = (pool: Pool) => {
    setTexts(
      Object.fromEntries(
        FIELDS.map(({ key }) => [
          key,
          pool.limits[key] === undefined ? '' : String(pool.limits[key]),
        ])
      ) as Record<PoolField, string>
    );
    setAdding(false);
    setEditingId(pool.id);
  };
  const close = () => {
    setEditingId(null);
    setAdding(false);
  };

  const save = useMutation({
    mutationFn: (allianceId: number) => managedAiUsageService.updateAlliancePool(allianceId, edit),
    onSuccess: async (outcome) => {
      toastLimitSaved('Alliance pool saved', outcome);
      await queryClient.invalidateQueries({ queryKey: ['platform-managed-ai-usage'] });
      close();
    },
    onError: (error) => toast.error(getApiErrorMessage(error) ?? 'Could not save the pool'),
  });
  const locked = save.isPending;

  const withoutPool = alliances.filter(
    (alliance) => !caps.alliances.some((pool) => pool.id === alliance.id)
  );

  const editor = (
    <div className="flex flex-col gap-2">
      {adding && (
        <Select
          label="Alliance"
          options={withoutPool.map((alliance) => ({
            value: String(alliance.id),
            label: alliance.name,
          }))}
          value={editingId === null ? '' : String(editingId)}
          onChange={(value) => setEditingId(value ? Number(value) : null)}
        />
      )}
      {parsed.map(({ field, result }) => (
        <Input
          key={field.key}
          label={`${field.label} (tokens)`}
          inputMode="numeric"
          value={texts[field.key]}
          onChange={(event) =>
            setTexts((current) => ({ ...current, [field.key]: event.target.value }))
          }
          error={result.ok ? undefined : result.error}
          disabled={locked}
        />
      ))}
      <p className="text-xs text-muted-foreground">
        Blank = no limit; 0 switches one off. Clearing every limit removes the pool.
      </p>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={close} disabled={locked}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => editingId !== null && save.mutate(editingId)}
          isLoading={save.isPending}
          disabled={editingId === null || !valid || !changed || save.isPending}
        >
          Save
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            Alliance pools · the members’ spend summed, per day and per calendar month (UTC)
          </span>
          {!adding && editingId === null && withoutPool.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={unreadable}
              onClick={() => {
                setTexts(EMPTY_TEXTS);
                setEditingId(null);
                setAdding(true);
              }}
            >
              Add pool
            </Button>
          )}
        </div>
        {caps.alliances.length === 0 && !adding && (
          <span className="text-sm text-muted-foreground">No alliance has a pool.</span>
        )}
        <ul className="flex flex-col gap-2">
          {caps.alliances.map((pool) => (
            <li key={pool.id} className="flex flex-col gap-1">
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm font-semibold">{pool.name}</span>
                {!adding && editingId === null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${pool.name}`}
                    disabled={unreadable}
                    onClick={() => open(pool)}
                  >
                    Edit
                  </Button>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {pool.memberIds.length} workspace{pool.memberIds.length === 1 ? '' : 's'} ·{' '}
                {describePool(pool)}
              </span>
              {!adding && editingId === pool.id && editor}
            </li>
          ))}
        </ul>
        {adding && editor}
      </CardContent>
    </Card>
  );
};
