import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import {
  managedAiUsageService,
  type ManagedAiOrgUsage,
  type ManagedAiTier,
  type ManagedAiTierStat,
} from '@/services/managedAiUsage.service';
import { getApiErrorMessage } from '@/lib/errorMessages';

const RANGES = [7, 30, 90] as const;

/**
 * ⛔ `other` was labelled "Unpriced", and that stopped being true when pricing moved from
 * per-tier rates to per-model list prices: `other` means "not one of the CURRENT tier
 * models" (a since-changed tier model, a historical row), and such a model is often
 * priced perfectly well. Keeping the old label would have shown 9,667,902 tokens under a
 * heading claiming they cost nothing knowable, next to a tile that had just priced them.
 * Unpriced is now its own, real figure — on the cost tile and in the by-model table.
 */
const TIER_LABEL: Record<ManagedAiTier, string> = {
  default: 'Cheap',
  strong: 'Strong',
  other: 'Other models',
};

const formatTokens = (tokens: number): string => tokens.toLocaleString();

/**
 * Cost, or an honest dash. Null is "nobody told us the price", never zero — showing 0.00
 * against an unpriced model reads as "this cost nothing".
 */
const formatCost = (cost: number | null): string =>
  cost === null
    ? '—'
    : // A real cost that rounds to 0.00 reads as free, which is the same lie as pricing an
      // unpriced model at zero. Anything above nothing but below a cent says so.
      cost > 0 && cost < 0.005
      ? '< 0.01'
      : cost.toFixed(2);

/** `$1,234.56`. Cents are kept: a small workspace's month is a sub-dollar figure. */
const formatUsd = (usd: number): string =>
  `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatEur = (eur: number): string =>
  `€${eur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sumCost = (tiers: ManagedAiTierStat[]): number | null => {
  const priced = tiers.filter((tier) => tier.costEstimate !== null);
  if (priced.length === 0) return null;
  return priced.reduce((total, tier) => total + (tier.costEstimate ?? 0), 0);
};

const tokensFor = (org: ManagedAiOrgUsage, tier: ManagedAiTier): number =>
  org.byTier.find((entry) => entry.tier === tier)?.totalTokens ?? 0;

/** `2026-09` → `September 2026`. Returns the raw value if it is not a month key. */
const formatMonth = (month: string): string => {
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex) return month;
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** First day of a `YYYY-MM` key, UTC — the instant the cap counter last reset. */
const monthStart = (month: string): Date => new Date(`${month}-01T00:00:00.000Z`);

/** A cap bar. Amber past 75%, red past 90% — the point is to notice before it bites. */
const CallCap = ({ calls }: { calls: ManagedAiOrgUsage['calls'] }) => {
  if (!calls) return <span className="text-muted-foreground">unknown</span>;
  const pct = calls.limit > 0 ? Math.min(100, Math.round((calls.used / calls.limit) * 100)) : 0;
  const tone = pct >= 90 ? 'bg-destructive' : pct >= 75 ? 'bg-warning' : 'bg-primary';
  return (
    <div className="flex flex-col gap-1 min-w-[9rem]">
      <span className="text-xs text-muted-foreground">
        {formatTokens(calls.used)} / {formatTokens(calls.limit)} calls
      </span>
      <div className="overflow-hidden w-full h-1.5 rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

/**
 * Platform console → AI Spend. Who is spending the platform provider key, per workspace.
 *
 * Reads `GET /api/organizations/managed-ai-usage` (requireGlobalAdmin, cross-org). The
 * per-org token endpoint the app already had resolves its org from the SESSION, so from the
 * platform console it answers for the operator's own workspace and reports a confident zero
 * for everyone else — which is why this page exists rather than a filter on that one.
 */
export const PlatformAiSpend = () => {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-managed-ai-usage', days],
    queryFn: () => managedAiUsageService.get(days),
  });

  const usage = data?.usage;
  const totalTokens = usage?.totals.byTier.reduce((sum, tier) => sum + tier.totalTokens, 0) ?? 0;
  const totalRequests = usage?.totals.byTier.reduce((sum, tier) => sum + tier.requests, 0) ?? 0;
  /**
   * The backend now prices per MODEL and reports the rollup, because a per-tier rate
   * could not price the `other` tier at all — which on this platform was 9,667,902 of
   * framehouse's 40,787,419 tokens. `cost` is optional so an older backend still renders:
   * fall back to summing the per-tier estimates, exactly as this page did before.
   */
  const cost = usage?.totals.cost;
  /**
   * Every model in the window, platform-wide. Without this the console could report
   * "Unpriced 9,667,902" and offer no way to find out what those tokens were — the
   * controller had grouped by model all along and thrown the name away.
   */
  const models = Object.values(
    (usage?.orgs ?? []).reduce<Record<string, { model: string; totalTokens: number; requests: number; costUsd: number | null; priced: boolean }>>(
      (acc, org) => {
        for (const row of org.byModel ?? []) {
          const entry = (acc[row.model] ??= {
            model: row.model,
            totalTokens: 0,
            requests: 0,
            costUsd: null,
            priced: false,
          });
          entry.totalTokens += row.totalTokens;
          entry.requests += row.requests;
          if (row.costUsd !== null) {
            entry.costUsd = (entry.costUsd ?? 0) + row.costUsd;
            entry.priced = true;
          }
        }
        return acc;
      },
      {}
    )
  ).sort((left, right) => right.totalTokens - left.totalTokens);
  const totalCost = cost ? cost.usd : usage ? sumCost(usage.totals.byTier) : null;
  const unpricedTokens =
    cost?.unpricedTokens ??
    usage?.totals.byTier
      .filter((tier) => tier.costEstimate === null)
      .reduce((sum, tier) => sum + tier.totalTokens, 0) ??
    0;

  /**
   * The cap column is on a different clock from every column beside it: tokens answer the
   * `days` selector above, the cap is a calendar-month counter that resets on the 1st.
   * Undefined against an API that predates the field — the column then renders exactly as
   * it always did rather than claiming a window it does not know.
   */
  const capMonth = usage?.orgs.find((org) => org.calls?.month)?.calls?.month;
  /**
   * Only worth saying when the two windows genuinely disagree. On 2026-09-02 with a 30-day
   * range they did: 21M tokens burned on 08-28 sat beside `0 / 96,000 calls`, both correct,
   * together reading as "nothing is being spent".
   */
  const capWindowIsShorter = Boolean(
    capMonth && data?.meta.from && new Date(data.meta.from) < monthStart(capMonth)
  );

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <ConsolePageHeader
        title="AI Spend"
        description="Token spend on the platform provider key, by workspace. Every managed workspace bills here — this is the key that pays, not theirs."
      />

      <div className="flex gap-2 items-center">
        {RANGES.map((range) => (
          <Button
            key={range}
            variant={range === days ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setDays(range)}
          >
            {range} days
          </Button>
        ))}
        {data?.meta.from && (
          <span className="ml-2 text-xs text-muted-foreground">
            since {new Date(data.meta.from).toLocaleDateString()}
          </span>
        )}
      </div>

      {error && (
        <Alert variant="danger">{getApiErrorMessage(error) ?? 'Could not load AI spend.'}</Alert>
      )}

      {isLoading && <ConsoleLoading />}

      {usage && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs text-muted-foreground">Tokens</span>
                <span className="text-2xl font-semibold">{formatTokens(totalTokens)}</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs text-muted-foreground">Calls</span>
                <span className="text-2xl font-semibold">{formatTokens(totalRequests)}</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs text-muted-foreground">Estimated cost</span>
                <span className="text-2xl font-semibold">
                  {totalCost === null ? '—' : `≈ ${formatUsd(totalCost)}`}
                </span>
                {/* The euro figure is secondary on purpose: vendors publish and bill in
                    USD, so the dollar number is the one that can be checked against an
                    invoice. The rate is always shown beside it — a bare euro total reads
                    more precise than a converted estimate is. */}
                {totalCost !== null && cost?.eur !== null && cost?.eur !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    ≈ {formatEur(cost.eur)} · at {cost.usdToEur} USD/EUR
                    {cost.usdToEurIsDefault && ' (default)'}
                  </span>
                )}
                {totalCost === null ? (
                  <span className="text-xs text-muted-foreground">
                    no rate matched any model in this window
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {/* Coverage, always — a total with an unstated hole in it is worse
                        than the dash this replaced. */}
                    {unpricedTokens > 0
                      ? `list prices${cost ? ` as of ${cost.pricesAsOf}` : ''} · excludes ${formatTokens(unpricedTokens)} unpriced tokens`
                      : `list prices${cost ? ` as of ${cost.pricesAsOf}` : ''} · all tokens priced`}
                  </span>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs text-muted-foreground">Managed workspaces</span>
                <span className="text-2xl font-semibold">{usage.totals.managedOrgCount}</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs text-muted-foreground">Daily token ceiling</span>
                {/* A cap nobody can see is not meaningfully different from no cap: the
                    2026-08-28 burn spent 20.8M tokens while the CALL ceiling read 8% used. */}
                <span className="text-2xl font-semibold">
                  {usage.totals.tokenCeilingPerOrgPerDay === undefined
                    ? '—'
                    : usage.totals.tokenCeilingPerOrgPerDay === 0
                      ? 'none'
                      : formatTokens(usage.totals.tokenCeilingPerOrgPerDay)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {usage.totals.tokenCeilingPerOrgPerDay === undefined
                    ? 'this backend does not report one'
                    : usage.totals.tokenCeilingPerOrgPerDay === 0
                      ? 'the budget is switched off, per workspace per day'
                      : usage.totals.tokenCeilingIsDefault
                        ? 'per workspace per day — platform default, not configured'
                        : 'per workspace per day — configured'}
                </span>
              </CardContent>
            </Card>
          </div>

          <Card className="flex overflow-hidden flex-col flex-1 min-h-0">
            <CardContent padding="none" className="flex overflow-auto flex-col flex-1 min-h-0">
              {usage.totals.managedOrgCount === 0 ? (
                <p className="flex flex-1 gap-2 justify-center items-center py-8 text-sm text-center text-muted-foreground">
                  <Coins className="w-4 h-4" />
                  No workspace is in managed mode, so nothing bills to the platform key.
                </p>
              ) : totalTokens === 0 ? (
                <p className="flex flex-1 justify-center items-center py-8 text-sm text-center text-muted-foreground">
                  {usage.totals.managedOrgCount} managed workspace
                  {usage.totals.managedOrgCount === 1 ? '' : 's'}, and no AI spend in this window.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Workspace</th>
                      <th className="px-3 py-2 font-medium text-right">Tokens</th>
                      <th className="px-3 py-2 font-medium text-right">Share</th>
                      {(['default', 'strong', 'other'] as ManagedAiTier[]).map((tier) => (
                        <th key={tier} className="px-3 py-2 font-medium text-right">
                          {TIER_LABEL[tier]}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-medium">
                        Monthly cap
                        {capMonth && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            · {formatMonth(capMonth)}
                          </span>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.orgs.map((org) => (
                      <tr key={org.organizationId} className="border-t border-border">
                        <td className="px-3 py-2">
                          <span className="font-medium text-foreground">{org.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            #{org.organizationId}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatTokens(org.totalTokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {totalTokens > 0
                            ? `${Math.round((org.totalTokens / totalTokens) * 100)}%`
                            : '—'}
                        </td>
                        {(['default', 'strong', 'other'] as ManagedAiTier[]).map((tier) => (
                          <td
                            key={tier}
                            className="px-3 py-2 text-right tabular-nums text-muted-foreground"
                          >
                            {formatTokens(tokensFor(org, tier))}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <CallCap calls={org.calls} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
            {capWindowIsShorter && capMonth && (
              <p className="px-3 py-2 text-xs border-t text-muted-foreground border-border">
                The cap column counts {formatMonth(capMonth)} only — it resets on the 1st and
                does not follow the range above, so a workspace can show heavy token spend
                beside a nearly untouched cap.
              </p>
            )}
          </Card>

          {models.length > 0 && (
            <Card>
              <CardContent padding="none">
                <p className="px-3 py-2 text-xs border-b text-muted-foreground border-border">
                  By model · what the tier columns above are made of. A model with no
                  published rate is listed here with its tokens rather than priced at a
                  guess — set{' '}
                  <code className="text-[11px]">PLATFORM_AI_*_COST_PER_1K</code> to price it
                  yourself.
                </p>
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium text-right">Tokens</th>
                      <th className="px-3 py-2 font-medium text-right">Calls</th>
                      <th className="px-3 py-2 font-medium text-right">Estimated cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((row) => (
                      <tr key={row.model} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">
                          {row.model}
                          {!row.priced && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              no published rate
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatTokens(row.totalTokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {formatTokens(row.requests)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.priced ? `≈ ${formatCost(row.costUsd)}` : formatCost(null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
