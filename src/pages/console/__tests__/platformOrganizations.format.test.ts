import { describe, expect, it } from 'vitest';
import {
  formatMemberCount,
  formatPlanLabel,
} from '@/pages/console/platformOrganizations.format';

describe('formatPlanLabel', () => {
  it('returns the plan display name when a plan is attached', () => {
    expect(formatPlanLabel({ name: 'pro', displayName: 'Pro' })).toBe('Pro');
  });

  it('returns an em-dash when the plan is null', () => {
    expect(formatPlanLabel(null)).toBe('—');
  });

  it('returns an em-dash when the plan is undefined (pre-enrichment payloads)', () => {
    expect(formatPlanLabel(undefined)).toBe('—');
  });
});

describe('formatMemberCount', () => {
  it('renders a positive count as a string', () => {
    expect(formatMemberCount(42)).toBe('42');
  });

  it('renders zero as "0", not a dash', () => {
    expect(formatMemberCount(0)).toBe('0');
  });

  it('renders an em-dash when the count is missing', () => {
    expect(formatMemberCount(undefined)).toBe('—');
  });
});
