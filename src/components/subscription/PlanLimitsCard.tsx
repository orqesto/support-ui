import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

const Limit = ({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) => (
  <div className="p-3 rounded-lg bg-muted/50">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`${mono ? 'font-mono ' : ''}text-lg font-semibold`}>{value}</p>
  </div>
);

/**
 * The plan's caps at a glance. `aiCallsLimit` is given only before the money budgets are applied,
 * while the old monthly AI-call cap still refuses work (0 = not included).
 */
export const PlanLimitsCard = ({
  limits,
  aiCallsLimit,
}: {
  limits: { maxUsers: number; maxIntegrations: number; maxMessagesPerMonth: number; maxStorageMb: number };
  aiCallsLimit?: number;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Plan Limits</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Limit label="Max Users" value={limits.maxUsers.toLocaleString()} />
        <Limit label="Max Integrations" value={limits.maxIntegrations.toLocaleString()} />
        <Limit label="Messages / Month" value={limits.maxMessagesPerMonth.toLocaleString()} />
        {aiCallsLimit !== undefined && (
          <Limit
            label="AI Calls / Month"
            value={aiCallsLimit === 0 ? 'Not included' : aiCallsLimit.toLocaleString()}
            mono={false}
          />
        )}
        <Limit label="Storage" value={`${limits.maxStorageMb.toLocaleString()} MB`} />
      </div>
    </CardContent>
  </Card>
);
