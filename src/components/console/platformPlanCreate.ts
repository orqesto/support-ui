import type { CreatePlanInput, PlanType } from '@/services/platform.service';

/**
 * Pure validation + normalization for the "New plan" form (POST /api/admin/plans).
 * Kept out of the component so the field rules — the slug regex, the euros→cents
 * conversion, the optional stripePriceId format, the non-negative integer limits —
 * are unit-tested in one place and the component only renders the result.
 *
 * The create form mirrors the edit form's field set (displayName, price, the three
 * limits) and adds the fields create additionally requires: `name` (the unique slug),
 * `planType`, and an optional `stripePriceId`. `features` is sent as an empty object —
 * the BE schema requires the key but every feature flag inside it is optional.
 */

export const PLAN_TYPE_OPTIONS: { value: PlanType; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'enterprise', label: 'Enterprise' },
];

/** Draft strings — kept as strings so partial input doesn't fight the number fields. */
export type CreatePlanDraft = {
  name: string;
  displayName: string;
  planType: PlanType;
  priceEuros: string;
  stripePriceId: string;
  maxUsers: string;
  maxMessagesPerMonth: string;
  maxIntegrations: string;
};

/** Field-keyed validation errors — each maps to an inline message under its input. */
export type CreatePlanErrors = Partial<
  Record<'name' | 'displayName' | 'price' | 'stripePriceId' | 'limits', string>
>;

export type CreatePlanValidation =
  | { ok: true; input: CreatePlanInput }
  | { ok: false; errors: CreatePlanErrors };

export const emptyCreatePlanDraft = (): CreatePlanDraft => ({
  name: '',
  displayName: '',
  planType: 'base',
  priceEuros: '',
  stripePriceId: '',
  maxUsers: '',
  maxMessagesPerMonth: '',
  maxIntegrations: '',
});

const SLUG_RE = /^[a-z0-9-]+$/;
const STRIPE_PRICE_RE = /^price_[A-Za-z0-9]+$/;

export const validateCreatePlanDraft = (draft: CreatePlanDraft): CreatePlanValidation => {
  const errors: CreatePlanErrors = {};

  const name = draft.name.trim();
  if (name.length < 2 || name.length > 50 || !SLUG_RE.test(name)) {
    errors.name = 'Use 2–50 lowercase letters, numbers and hyphens (e.g. pro-annual).';
  }

  const displayName = draft.displayName.trim();
  if (displayName.length < 1 || displayName.length > 100) {
    errors.displayName = 'Enter a display name (1–100 characters).';
  }

  const priceCents = Math.round(Number.parseFloat(draft.priceEuros) * 100);
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    errors.price = 'Price must be a non-negative number.';
  }

  const stripePriceId = draft.stripePriceId.trim();
  if (stripePriceId && !STRIPE_PRICE_RE.test(stripePriceId)) {
    errors.stripePriceId = 'Must look like a Stripe price id (price_…).';
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
    errors.limits = 'Limits must be non-negative whole numbers.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    input: {
      name,
      displayName,
      planType: draft.planType,
      price: priceCents,
      ...(stripePriceId ? { stripePriceId } : {}),
      limits: {
        maxUsers,
        maxIntegrations,
        ...(maxMessagesPerMonth !== undefined ? { maxMessagesPerMonth } : {}),
      },
      // BE requires the `features` key but every flag inside is optional — an empty
      // object satisfies the strict schema (new plans start with no features enabled).
      features: {},
    },
  };
};
