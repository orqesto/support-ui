import { useState } from 'react';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useCreatePlanStripePrice,
  useCreatePlatformPlan,
  useDeletePlatformPlan,
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
  const deletePlan = useDeletePlatformPlan();
  const createStripePrice = useCreatePlanStripePrice();

  // Delete + Stripe-price state. Both surface the SERVER's message rather than a generic
  // one: every refusal here (in use, seeded, Stripe unreachable) is a different problem
  // with a different fix, and only the BE knows which one applies.
  const [pendingDelete, setPendingDelete] = useState<AdminPlan | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const confirmDelete = async () => {
    const plan = pendingDelete;
    setPendingDelete(null);
    if (!plan) return;
    setActionError(null);
    try {
      await deletePlan.mutateAsync(plan.id);
    } catch (error) {
      logger.error('Failed to delete plan', error);
      setActionError(
        error instanceof Error ? error.message : `Could not delete '${plan.name}'.`
      );
    }
  };

  const handleStripePrice = async (plan: AdminPlan) => {
    setActionError(null);
    try {
      await createStripePrice.mutateAsync(plan.id);
    } catch (error) {
      logger.error('Failed to create Stripe price', error);
      setActionError(
        error instanceof Error
          ? error.message
          : `Could not create a Stripe price for '${plan.name}'.`
      );
    }
  };

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
      const created = await createPlan.mutateAsync(validation.input);
      closeCreate();
      // The Stripe leg is non-fatal server-side: the plan exists either way. Saying so is
      // the point — "created" alone would imply it is sellable when it is not, and the
      // per-card "Create Stripe price" button is the retry.
      if (created.stripe && !created.stripe.linked) {
        setActionError(
          `'${created.name}' was created, but its Stripe price was not: ${
            created.stripe.error ?? 'Stripe did not respond.'
          } It cannot be purchased until you create one.`
        );
      }
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
    const isDeleting = deletePlan.isPending && deletePlan.variables === plan.id;
    const isPricing = createStripePrice.isPending && createStripePrice.variables === plan.id;
    // Adoption counts ACTIVE workspaces; a plan can still hold cancelled subscriptions,
    // so a zero here is a hint that delete will work, not a promise. The BE decides.
    const deletable = adoption === 0;

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

          {/* Stripe state, spelled out. A paid plan with no price cannot be bought — that
              used to be invisible until a customer reached Checkout and it threw. */}
          {plan.price > 0 && (
            <p className="text-xs">
              {plan.stripePriceId ? (
                <span className="text-muted-foreground">
                  Stripe <code>{plan.stripePriceId}</code>
                </span>
              ) : (
                <span className="text-warning">Not billable — no Stripe price</span>
              )}
            </p>
          )}

          <div className="flex justify-between items-center pt-1">
            <Toggle
              checked={plan.isActive}
              disabled={isToggling}
              onChange={() => togglePlan.mutate(plan.id)}
              label={plan.isActive ? 'Active' : 'Inactive'}
            />
            <div className="flex gap-2 items-center">
              {plan.price > 0 && !plan.stripePriceId && (
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={isPricing}
                  onClick={() => void handleStripePrice(plan)}
                >
                  <CreditCard className="mr-1 w-4 h-4" />
                  Create Stripe price
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => openEdit(plan)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Delete ${plan.displayName}`}
                title={
                  deletable
                    ? `Delete ${plan.displayName}`
                    : 'In use by a workspace — deactivate it instead'
                }
                disabled={!deletable || isDeleting}
                isLoading={isDeleting}
                onClick={() => setPendingDelete(plan)}
              >
                <Trash2 className="w-4 h-4 text-danger" />
              </Button>
            </div>
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
      {actionError && (
        <Alert variant="danger">{actionError}</Alert>
      )}

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

            <div className="space-y-2">
              <Input
                label="Stripe price id (optional)"
                placeholder="price_…"
                value={createDraft.stripePriceId}
                onChange={(event) => patchCreate({ stripePriceId: event.target.value })}
                className="font-mono text-sm"
                disabled={createDraft.createStripePrice}
              />
              {createErrors.stripePriceId && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {createErrors.stripePriceId}
                </p>
              )}
              {/* Offered only for a paid plan: a free plan has nothing to bill, which is
                  also the BE's own guard. Pasting an id and asking us to create one are
                  alternatives, so choosing this disables the field above. */}
              {Number(createDraft.priceEuros) > 0 && (
                <Toggle
                  checked={createDraft.createStripePrice}
                  onChange={() =>
                    patchCreate({
                      createStripePrice: !createDraft.createStripePrice,
                      ...(createDraft.createStripePrice ? {} : { stripePriceId: '' }),
                    })
                  }
                  label="Create the Stripe product & price for me"
                />
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

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        variant="danger"
        confirmText="Delete plan"
        title={`Delete ${pendingDelete?.displayName ?? 'this plan'}?`}
        description={
          pendingDelete?.stripePriceId
            ? `This removes the plan from the catalog and archives its Stripe price (${pendingDelete.stripePriceId}) so nobody can buy it. Existing invoices are unaffected. If any workspace has ever been on this plan the deletion is refused — deactivate it instead.`
            : 'This removes the plan from the catalog for good. If any workspace has ever been on it the deletion is refused — deactivate it instead.'
        }
      />
    </div>
  );
};
