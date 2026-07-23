import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Coins, Cpu, Layers, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { statisticsService, type TokenUsageData } from '@/services/statistics.service';
import { logger } from '@/lib/logger';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const fmt = (value: number): string => value.toLocaleString();
const compact = (value: number): string =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(1)}k`
      : String(value);

/** Turn a snake_case feature id into a readable label. */
const featureLabel = (feature: string): string =>
  feature.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export const TokenUsageTab = ({ days }: { days: number }) => {
  const [data, setData] = useState<TokenUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feature, setFeature] = useState<string>('all');
  const [provider, setProvider] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    statisticsService
      .getTokenUsage(days, undefined, {
        feature: feature === 'all' ? undefined : feature,
        provider: provider === 'all' ? undefined : provider,
      })
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) setData(res.data);
        else setError('Failed to load token usage.');
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('Failed to load token usage:', err);
        setError('Failed to load token usage.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, feature, provider]);

  // Feature/provider options come from the UNFILTERED first load so the dropdowns
  // stay stable while drilling in. Fall back to the current data if needed.
  const featureOptions = useMemo(
    () => Array.from(new Set((data?.byFeature ?? []).map((row) => row.feature))).sort(),
    [data]
  );
  const providerOptions = useMemo(
    () => Array.from(new Set((data?.byProvider ?? []).map((row) => row.provider))).sort(),
    [data]
  );

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} />
      </div>
    );
  }
  if (error) {
    return <p className="py-12 text-center text-sm text-destructive">{error}</p>;
  }
  if (!data || data.totals.requests === 0) {
    return (
      <div className="space-y-4">
        <FilterBar
          feature={feature}
          setFeature={setFeature}
          featureOptions={featureOptions}
          provider={provider}
          setProvider={setProvider}
          providerOptions={providerOptions}
        />
        <p className="py-12 text-center text-sm text-muted-foreground">
          No LLM token usage recorded for this period yet.
        </p>
      </div>
    );
  }

  const { totals, byProvider, byModel, byFeature, daily } = data;

  const kpis = [
    { label: 'Total tokens', value: fmt(totals.totalTokens), icon: <Coins className="w-4 h-4" /> },
    { label: 'Prompt tokens', value: fmt(totals.promptTokens), icon: <Layers className="w-4 h-4" /> },
    {
      label: 'Completion tokens',
      value: fmt(totals.completionTokens),
      icon: <Cpu className="w-4 h-4" />,
    },
    { label: 'Requests', value: fmt(totals.requests), icon: <Hash className="w-4 h-4" /> },
  ];

  const featureChart = byFeature
    .slice()
    .sort((rowA, rowB) => rowB.totalTokens - rowA.totalTokens)
    .map((row) => ({ name: featureLabel(row.feature), tokens: row.totalTokens, requests: row.requests }));

  return (
    <div className="space-y-6" id="panel-tokens" role="tabpanel">
      <FilterBar
        feature={feature}
        setFeature={setFeature}
        featureOptions={featureOptions}
        provider={provider}
        setProvider={setProvider}
        providerOptions={providerOptions}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                {kpi.icon}
                <span className="text-xs font-medium">{kpi.label}</span>
              </div>
              <div className="mt-1 text-2xl font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tokens over time */}
      <Card>
        <CardHeader>
          <CardTitle>Tokens over time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="tokGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickMargin={8} minTickGap={24} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={44} />
              <Tooltip
                formatter={(value) => [fmt(typeof value === 'number' ? value : 0), 'Tokens']}
                labelClassName="text-foreground"
                contentStyle={{ fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="totalTokens"
                stroke="#6366f1"
                fill="url(#tokGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* By feature */}
        <Card>
          <CardHeader>
            <CardTitle>By feature</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, featureChart.length * 30)}>
              <BarChart data={featureChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <Tooltip formatter={(value) => [fmt(typeof value === 'number' ? value : 0), 'Tokens']} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="tokens" radius={[0, 4, 4, 0]}>
                  {featureChart.map((entry, idx) => (
                    <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By provider */}
        <Card>
          <CardHeader>
            <CardTitle>By provider</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byProvider.map((row, idx) => (
                <div key={row.provider}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium capitalize">{row.provider}</span>
                    <span className="text-muted-foreground">
                      {fmt(row.totalTokens)} · {row.percentage}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, row.percentage)}%`,
                        backgroundColor: COLORS[idx % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* By model */}
      <Card>
        <CardHeader>
          <CardTitle>By model</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">Model</th>
                  <th className="py-2 pr-4 font-medium">Provider</th>
                  <th className="py-2 pr-4 font-medium text-right">Tokens</th>
                  <th className="py-2 font-medium text-right">Requests</th>
                </tr>
              </thead>
              <tbody>
                {byModel
                  .slice()
                  .sort((rowA, rowB) => rowB.totalTokens - rowA.totalTokens)
                  .map((row) => (
                    <tr key={`${row.provider}:${row.model}`} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">{row.model}</td>
                      <td className="py-2 pr-4 capitalize">{row.provider}</td>
                      <td className="py-2 pr-4 text-right">{fmt(row.totalTokens)}</td>
                      <td className="py-2 text-right">{fmt(row.requests)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

type FilterBarProps = {
  feature: string;
  setFeature: (value: string) => void;
  featureOptions: string[];
  provider: string;
  setProvider: (value: string) => void;
  providerOptions: string[];
};

const FilterBar = ({
  feature,
  setFeature,
  featureOptions,
  provider,
  setProvider,
  providerOptions,
}: FilterBarProps) => (
  <div className="flex flex-wrap items-center gap-4">
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Feature:</span>
      <select
        value={feature}
        onChange={(event) => setFeature(event.target.value)}
        className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="all">All features</option>
        {featureOptions.map((opt) => (
          <option key={opt} value={opt}>
            {featureLabel(opt)}
          </option>
        ))}
      </select>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Provider:</span>
      <select
        value={provider}
        onChange={(event) => setProvider(event.target.value)}
        className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="all">All providers</option>
        {providerOptions.map((opt) => (
          <option key={opt} value={opt} className="capitalize">
            {opt}
          </option>
        ))}
      </select>
    </div>
  </div>
);
