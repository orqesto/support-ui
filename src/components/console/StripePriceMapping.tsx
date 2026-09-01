import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { getApiErrorMessage } from '@/lib/errorMessages';

type AdminPlan = {
  id: number;
  name: string;
  displayName: string;
  price: number; // cents
  stripePriceId: string | null;
};

/**
 * Stripe price mapping — set each paid plan's Stripe Price id (`price_…`), the value
 * checkout reads to build the Stripe Checkout Session. Normally populated by
 * `npm run seed:stripe-prices`; this is the manual fallback (fix a price, or detach a
 * plan by clearing it). Global-admin only — `PATCH /api/admin/plans/:id` authorizes on
 * the global role, not org context.
 */
export const StripePriceMapping = () => {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await apiClient.get<{ success: boolean; data: AdminPlan[] }>(
        '/api/admin/plans'
      );
      const list = response.data.data ?? [];
      setPlans(list);
      setDrafts(Object.fromEntries(list.map((plan) => [plan.id, plan.stripePriceId ?? ''])));
      setError(null);
    } catch (err) {
      logger.error('Failed to load plans', err);
      setError(getApiErrorMessage(err) ?? 'Failed to load plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (plan: AdminPlan) => {
    setSavingId(plan.id);
    setError(null);
    try {
      const value = (drafts[plan.id] ?? '').trim();
      await apiClient.patch(`/api/admin/plans/${plan.id}`, {
        stripePriceId: value === '' ? null : value,
      });
      await load();
    } catch (err) {
      logger.error('Failed to save stripe price id', err);
      setError(
        getApiErrorMessage(err) ??
          'Save failed — the value must be a Stripe price id (price_…) or empty.'
      );
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return null;
  const paidPlans = plans.filter((plan) => plan.price > 0);

  return (
    <Card padding="md" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Stripe price mapping</h2>
        <p className="text-sm text-muted-foreground">
          Each paid plan&apos;s Stripe Price id (<code>price_…</code>) — used to build the Checkout
          Session. Usually set by <code>seed:stripe-prices</code>; edit here to fix or detach one.
        </p>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="space-y-2">
        {paidPlans.map((plan) => {
          const dirty = (drafts[plan.id] ?? '') !== (plan.stripePriceId ?? '');
          return (
            <div key={plan.id} className="flex flex-wrap gap-3 items-center">
              <div className="w-44 min-w-44">
                <div>
                  <span className="text-sm font-medium text-foreground">{plan.displayName}</span>{' '}
                  <span className="text-xs text-muted-foreground">
                    €{(plan.price / 100).toFixed(0)}
                  </span>
                </div>
                {/* Slug — disambiguates same-named plans (e.g. two "Enterprise Cloud":
                    enterprise-cloud vs enterprise) so you know which price you're setting. */}
                <code className="text-xs text-muted-foreground">{plan.name}</code>
              </div>
              <Input
                value={drafts[plan.id] ?? ''}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [plan.id]: event.target.value }))
                }
                placeholder="price_…"
                className="flex-1 min-w-56 font-mono text-xs"
              />
              {!plan.stripePriceId && <Badge variant="warning">unset</Badge>}
              <Button
                size="sm"
                onClick={() => void save(plan)}
                disabled={savingId === plan.id || !dirty}
                isLoading={savingId === plan.id}
              >
                Save
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
