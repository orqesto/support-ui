import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import {
  useCreatePlatformPlan,
  usePlatformPlanStats,
  usePlatformPlans,
  useTogglePlatformPlan,
  useUpdatePlatformPlan,
} from '@/hooks/usePlatformAdmin';
import { logger } from '@/lib/logger';
import {
  PLAN_TYPE_OPTIONS,
  emptyCreatePlanDraft,
  validateCreatePlanDraft,
  type CreatePlanDraft,
  type CreatePlanErrors,
} from '@/components/console/platformPlanCreate';
import type { AdminPlan } from '@/services/platform.service';

/**
 * Platform console → plan catalog manager. Unlike the org-scoped AdminPlansTab this is a
 * cross-org, platform-level view: it lists EVERY plan (incl. inactive) from
 * `GET /api/admin/plans`, shows adoption from `GET /api/admin/plans/stats`, and edits the
 * catalog via `PATCH /api/admin/plans/:id{,/toggle}`. All three authorize on the global-admin
 * role (org context is suppressed on platform scope, D-ADM-1) — there is no "current
 * subscription" or "switch plan" here, those only make sense for a single org.
 */

/** Draft strings for the edit modal — kept as strings so partial input doesn't fight the field. */
type EditDraft = {
  displayName: string;
  priceEuros: string;
  maxUsers: string;
  maxMessagesPerMonth: string;
  maxIntegrations: string;
};

const draftFromPlan = (plan: AdminPlan): EditDraft => ({
  displayName: plan.displayName,
  priceEuros: (plan.price / 100).toString(),
  maxUsers: plan.limits.maxUsers?.toString() ?? '',
  maxMessagesPerMonth: plan.limits.maxMessagesPerMonth?.toString() ?? '',
  maxIntegrations: plan.limits.maxIntegrations?.toString() ?? '',
});

const formatPrice = (plan: AdminPlan) => {
  if (plan.price === 0) return 'Custom pricing';
  const symbol = plan.currency === 'EUR' ? '€' : '$';
  return `${symbol}${(plan.price / 100).toFixed(0)}/${plan.billingInterval}`;
};

/** Pull the HTTP status the api-client attaches to a rejected request, if any. */
const errorStatus = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined;

export const PlatformPlans = () => {
  const plansQuery = usePlatformPlans();
  const statsQuery = usePlatformPlanStats();
  const togglePlan = useTogglePlatformPlan();
  const updatePlan = useUpdatePlatformPlan();
  const createPlan = useCreatePlatformPlan();

  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Create-plan dialog state.
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreatePlanDraft>(emptyCreatePlanDraft);
  const [createErrors, setCreateErrors] = useState<CreatePlanErrors>({});
  const [createGeneralError, setCreateGeneralError] = useState<string | null>(null);

  const patchCreate = (patch: Partial<CreatePlanDraft>) =>
    setCreateDraft((current) => ({ ...current, ...patch }));

  const openCreate = () => {
    setCreateDraft(emptyCreatePlanDraft());
    setCreateErrors({});
    setCreateGeneralError(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateErrors({});
    setCreateGeneralError(null);
  };

  const handleCreate = async () => {
    const validation = validateCreatePlanDraft(createDraft);
    if (!validation.ok) {
      setCreateErrors(validation.errors);
      setCreateGeneralError(null);
      return;
    }
    setCreateErrors({});
    setCreateGeneralError(null);
    try {
      await createPlan.mutateAsync(validation.input);
      closeCreate();
    } catch (error) {
      // A duplicate slug is a field-level error surfaced under the name input; anything
      // else is a generic top-of-form message.
      if (errorStatus(error) === 409) {
        setCreateErrors({ name: 'A plan with this name already exists.' });
      } else {
        logger.error('Failed to create plan', error);
        setCreateGeneralError(
          error instanceof Error ? error.message : 'Could not create the plan.'
        );
      }
    }
  };

  const openEdit = (plan: AdminPlan) => {
    setEditing(plan);
    setDraft(draftFromPlan(plan));
    setSaveError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setDraft(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editing || !draft) return;
    setSaveError(null);

    const priceCents = Math.round(Number.parseFloat(draft.priceEuros) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setSaveError('Price must be a non-negative number.');
      return;
    }

    const maxUsers = Number.parseInt(draft.maxUsers, 10);
    const maxIntegrations = Number.parseInt(draft.maxIntegrations, 10);
    const trimmedMessages = draft.maxMessagesPerMonth.trim();
    const maxMessagesPerMonth =
      trimmedMessages === '' ? undefined : Number.parseInt(trimmedMessages, 10);

    if (
      !Number.isInteger(maxUsers) ||
      maxUsers < 0 ||
      !Number.isInteger(maxIntegrations) ||
      maxIntegrations < 0 ||
      (maxMessagesPerMonth !== undefined &&
        (!Number.isInteger(maxMessagesPerMonth) || maxMessagesPerMonth < 0))
    ) {
      setSaveError('Limits must be non-negative whole numbers.');
      return;
    }

    try {
      await updatePlan.mutateAsync({
        id: editing.id,
        input: {
          displayName: draft.displayName.trim(),
          price: priceCents,
          limits: {
            maxUsers,
            maxIntegrations,
            ...(maxMessagesPerMonth !== undefined ? { maxMessagesPerMonth } : {}),
          },
        },
      });
      closeEdit();
    } catch (error) {
      logger.error('Failed to update plan', error);
      setSaveError('Save failed — check the values and try again.');
    }
  };

  if (plansQuery.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size={24} />
      </div>
    );
  }

  if (plansQuery.isError || !plansQuery.data) {
    return <Alert variant="danger">Failed to load plans.</Alert>;
  }

  const plans = plansQuery.data;
  const stats = statsQuery.data ?? {};
  const basePlans = plans.filter((plan) => plan.planType === 'base');
  const otherPlans = plans.filter((plan) => plan.planType !== 'base');

  const renderPlanCard = (plan: AdminPlan) => {
    const adoption = stats[plan.id] ?? 0;
    const isToggling = togglePlan.isPending && togglePlan.variables === plan.id;

    return (
      <Card key={plan.id} className={plan.isActive ? undefined : 'opacity-70'}>
        <CardHeader>
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="text-base">{plan.displayName}</CardTitle>
            <Badge variant={plan.isActive ? 'success' : 'secondary'}>
              {plan.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          {/* Slug — disambiguates same-named plans (e.g. two "Enterprise Cloud":
              enterprise-cloud vs enterprise). */}
          <code className="text-xs text-muted-foreground">{plan.name}</code>
          <div className="mt-1 text-lg font-semibold text-foreground">{formatPrice(plan)}</div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="pb-3 space-y-1 text-sm text-muted-foreground border-b border-border">
            <p>
              <strong className="text-foreground">{plan.limits.maxUsers}</strong> users
            </p>
            <p>
              <strong className="text-foreground">
                {plan.limits.maxMessagesPerMonth?.toLocaleString() ?? '—'}
              </strong>{' '}
              messages/month
            </p>
            <p>
              <strong className="text-foreground">{plan.limits.maxIntegrations}</strong> integrations
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{adoption}</strong>{' '}
            {adoption === 1 ? 'workspace' : 'workspaces'}
          </p>

          <div className="flex justify-between items-center pt-1">
            <Toggle
              checked={plan.isActive}
              disabled={isToggling}
              onChange={() => togglePlan.mutate(plan.id)}
              label={plan.isActive ? 'Active' : 'Inactive'}
            />
            <Button size="sm" variant="outline" onClick={() => openEdit(plan)}>
              Edit
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderGroup = (title: string, description: string, groupPlans: AdminPlan[]) => (
    <div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      {groupPlans.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groupPlans.map(renderPlanCard)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No plans in this group.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="mr-2 w-4 h-4" />
          New plan
        </Button>
      </div>

      {renderGroup('Base plans', 'Core platform plans without AI features.', basePlans)}
      {renderGroup('Enterprise & other plans', 'Custom and enterprise solutions.', otherPlans)}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && closeEdit()}>
        <DialogHeader>
          <DialogTitle>Edit plan{editing ? ` — ${editing.name}` : ''}</DialogTitle>
          <DialogClose onClose={closeEdit} />
        </DialogHeader>
        <DialogContent>
          {draft && (
            <div className="space-y-4">
              {saveError && <Alert variant="danger">{saveError}</Alert>}
              <Input
                label="Display name"
                value={draft.displayName}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, displayName: event.target.value } : current
                  )
                }
              />
              <Input
                label="Price (€ / interval)"
                type="number"
                min={0}
                step="1"
                value={draft.priceEuros}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, priceEuros: event.target.value } : current
                  )
                }
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input
                  label="Max users"
                  type="number"
                  min={0}
                  value={draft.maxUsers}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, maxUsers: event.target.value } : current
                    )
                  }
                />
                <Input
                  label="Messages / month"
                  type="number"
                  min={0}
                  value={draft.maxMessagesPerMonth}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, maxMessagesPerMonth: event.target.value } : current
                    )
                  }
                />
                <Input
                  label="Max integrations"
                  type="number"
                  min={0}
                  value={draft.maxIntegrations}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, maxIntegrations: event.target.value } : current
                    )
                  }
                />
              </div>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={closeEdit} disabled={updatePlan.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} isLoading={updatePlan.isPending}>
            Save
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Create a new plan. Mirrors the edit form's fields and adds the create-only
          name (slug) + plan type + optional Stripe price id. */}
      <Dialog open={createOpen} onOpenChange={(open) => !open && closeCreate()}>
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogClose onClose={closeCreate} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            {createGeneralError && <Alert variant="danger">{createGeneralError}</Alert>}

            <div className="space-y-1">
              <Input
                label="Name (slug)"
                placeholder="e.g. pro-annual"
                value={createDraft.name}
                onChange={(event) => patchCreate({ name: event.target.value })}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier — lowercase letters, numbers and hyphens only.
              </p>
              {createErrors.name && (
                <p className="text-xs text-red-600 dark:text-red-400">{createErrors.name}</p>
              )}
            </div>

            <div className="space-y-1">
              <Input
                label="Display name"
                placeholder="e.g. Pro (annual)"
                value={createDraft.displayName}
                onChange={(event) => patchCreate({ displayName: event.target.value })}
              />
              {createErrors.displayName && (
                <p className="text-xs text-red-600 dark:text-red-400">{createErrors.displayName}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="create-plan-type" className="mb-1">
                Plan type
              </Label>
              <Select
                id="create-plan-type"
                value={createDraft.planType}
                onChange={(event) =>
                  patchCreate({ planType: event.target.value as CreatePlanDraft['planType'] })
                }
              >
                {PLAN_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <Input
                label="Price (€ / month)"
                type="number"
                min={0}
                step="1"
                value={createDraft.priceEuros}
                onChange={(event) => patchCreate({ priceEuros: event.target.value })}
              />
              {createErrors.price && (
                <p className="text-xs text-red-600 dark:text-red-400">{createErrors.price}</p>
              )}
            </div>

            <div className="space-y-1">
              <Input
                label="Stripe price id (optional)"
                placeholder="price_…"
                value={createDraft.stripePriceId}
                onChange={(event) => patchCreate({ stripePriceId: event.target.value })}
                className="font-mono text-sm"
              />
              {createErrors.stripePriceId && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {createErrors.stripePriceId}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input
                  label="Max users"
                  type="number"
                  min={0}
                  value={createDraft.maxUsers}
                  onChange={(event) => patchCreate({ maxUsers: event.target.value })}
                />
                <Input
                  label="Messages / month"
                  type="number"
                  min={0}
                  value={createDraft.maxMessagesPerMonth}
                  onChange={(event) => patchCreate({ maxMessagesPerMonth: event.target.value })}
                />
                <Input
                  label="Max integrations"
                  type="number"
                  min={0}
                  value={createDraft.maxIntegrations}
                  onChange={(event) => patchCreate({ maxIntegrations: event.target.value })}
                />
              </div>
              {createErrors.limits && (
                <p className="text-xs text-red-600 dark:text-red-400">{createErrors.limits}</p>
              )}
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={closeCreate} disabled={createPlan.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} isLoading={createPlan.isPending}>
            Create plan
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};
