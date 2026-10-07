/** Version skew: `globalReaches` (BE 25f329c4) is kept only when the backend sends a boolean. */
import { describe, expect, it } from 'vitest';
import { normalizeAdminFlagList, type AdminFeatureFlag } from '../featureFlags.service';

const flag = (key: string, extra: Record<string, unknown> = {}): AdminFeatureFlag =>
  ({
    key,
    codeDefault: false,
    global: null,
    organization: null,
    effective: false,
    source: 'code_default',
    ...extra,
  }) as AdminFeatureFlag;

describe('normalizeAdminFlagList', () => {
  it('keeps globalReaches only when boolean; absent stays absent (older backend)', () => {
    const out = normalizeAdminFlagList({
      organizationId: 4,
      flags: [flag('a', { globalReaches: false }), flag('b', { globalReaches: 'no' }), flag('c')],
    });
    expect(out.flags.map((item) => 'globalReaches' in item)).toEqual([true, false, false]);
    expect(out.flags[0].globalReaches).toBe(false);
  });
});
