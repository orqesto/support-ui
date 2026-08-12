import { describe, expect, it } from 'vitest';
import {
  emptyCreatePlanDraft,
  validateCreatePlanDraft,
  type CreatePlanDraft,
} from '@/components/console/platformPlanCreate';

const validDraft = (): CreatePlanDraft => ({
  ...emptyCreatePlanDraft(),
  name: 'pro-annual',
  displayName: 'Pro (annual)',
  planType: 'bundle',
  priceEuros: '500',
  stripePriceId: '',
  maxUsers: '25',
  maxMessagesPerMonth: '10000',
  maxIntegrations: '5',
});

describe('validateCreatePlanDraft', () => {
  it('accepts a well-formed draft and converts euros to cents', () => {
    const result = validateCreatePlanDraft(validDraft());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.name).toBe('pro-annual');
      expect(result.input.price).toBe(50000);
      expect(result.input.planType).toBe('bundle');
      expect(result.input.limits).toEqual({
        maxUsers: 25,
        maxIntegrations: 5,
        maxMessagesPerMonth: 10000,
      });
      expect(result.input.features).toEqual({});
      expect(result.input).not.toHaveProperty('stripePriceId');
    }
  });

  it('trims the name and omits an empty messages limit', () => {
    const result = validateCreatePlanDraft({
      ...validDraft(),
      name: '  starter  ',
      maxMessagesPerMonth: '   ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.name).toBe('starter');
      expect(result.input.limits).not.toHaveProperty('maxMessagesPerMonth');
    }
  });

  it('rejects an invalid slug (uppercase / spaces)', () => {
    const result = validateCreatePlanDraft({ ...validDraft(), name: 'Pro Plan' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeDefined();
    }
  });

  it('rejects a too-short slug', () => {
    const result = validateCreatePlanDraft({ ...validDraft(), name: 'a' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeDefined();
    }
  });

  it('rejects an empty display name', () => {
    const result = validateCreatePlanDraft({ ...validDraft(), displayName: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.displayName).toBeDefined();
    }
  });

  it('rejects a negative price', () => {
    const result = validateCreatePlanDraft({ ...validDraft(), priceEuros: '-5' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.price).toBeDefined();
    }
  });

  it('accepts a valid stripe price id and passes it through', () => {
    const result = validateCreatePlanDraft({
      ...validDraft(),
      stripePriceId: 'price_1ABCdef23',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.stripePriceId).toBe('price_1ABCdef23');
    }
  });

  it('rejects a malformed stripe price id', () => {
    const result = validateCreatePlanDraft({ ...validDraft(), stripePriceId: 'sku_123' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.stripePriceId).toBeDefined();
    }
  });

  it('rejects non-integer / negative limits', () => {
    const result = validateCreatePlanDraft({ ...validDraft(), maxUsers: '-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.limits).toBeDefined();
    }
  });
});
