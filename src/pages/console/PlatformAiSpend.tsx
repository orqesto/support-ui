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

const TIER_LABEL: Record<ManagedAiTier, string> = {
  default: 'Cheap',
  strong: 'Strong',
  other: 'Unpriced',
};

const formatTokens = (tokens: number): string => tokens.toLocaleString();

/**
 * Cost, or an honest dash. `costEstimate` is null when no PLATFORM_AI_*_COST_PER_1K rate is
 * set for that tier — and always null for `other`. Showing 0.00 there would read as "this
 * cost nothing", when the truth is "nobody told us the price".
 */
const formatCost = (cost: number | null): string => (cost === null ? '—' : cost.toFixed(2));

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
  const totalCost = usage ? sumCost(usage.totals.byTier) : null;
  const unpricedTokens =
    usage?.totals.byTier
      .filter((tier) => tier.costEstimate === null)
      .reduce((sum, tier) => sum + tier.totalTokens, 0) ?? 0;

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
                <span className="text-2xl font-semibold">{formatCost(totalCost)}</span>
                {totalCost === null ? (
                  <span className="text-xs text-muted-foreground">
                    no PLATFORM_AI_*_COST_PER_1K rate configured
                  </span>
                ) : (
                  unpricedTokens > 0 && (
                    <span className="text-xs text-muted-foreground">
                      excludes {formatTokens(unpricedTokens)} unpriced tokens
                    </span>
                  )
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
        </>
      )}
    </div>
  );
};
