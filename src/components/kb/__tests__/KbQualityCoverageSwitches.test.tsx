/**
 * Owner 2026-10-07: the quality tab said "the nightly quality review is off" without saying which
 * switch. With the backend's `switches` it names it; without them (older backend) it says what it
 * said before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { KbQualityStatus } from '@/services/kbQuality.service';
import type { KbConsolidationRunState } from '@/services/kbConsolidation.service';

const getStatus = vi.fn<() => Promise<KbQualityStatus | 'unsupported' | 'error'>>();
const getRunState = vi.fn<() => Promise<KbConsolidationRunState | null>>();
vi.mock('@/services/kbQuality.service', () => ({
  kbQualityService: { getStatus: () => getStatus() },
}));
vi.mock('@/services/kbConsolidation.service', () => ({
  kbConsolidationService: { getRunState: () => getRunState() },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getCurrent: () => Promise.resolve({ id: 7, name: 'Acme' }) },
}));

const { KbQualityCoverage } = await import('../KbQualityCoverage');

const OLD_OFF =
  'The nightly quality review is off for this workspace — nothing new will be suggested.';
const status = (state: KbQualityStatus['state']): KbQualityStatus => ({
  state,
  coverage: {
    entries: 10,
    checked: 10,
    notYet: 0,
    unassessed: 0,
    rewritesWaiting: 0,
    lastCheckedAt: null,
  },
});
const runState = (switches?: KbConsolidationRunState['switches']): KbConsolidationRunState => ({
  runningSince: null,
  last: null,
  canRun: false,
  ...(switches ? { switches } : {}),
});
const OWN_KEY_QUALITY_OFF = {
  ownKey: true,
  selfHosted: false,
  globalApplies: false,
  enabled: { on: true, from: 'workspace' as const },
  dryRun: { on: false, from: 'default' as const },
  quality: { on: false, from: 'default' as const },
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('KbQualityCoverage — which switch keeps the review off', () => {
  it('own key on hosted, quality off ⇒ names kb.quality_review_enabled at this workspace', async () => {
    getStatus.mockResolvedValue(status('off'));
    getRunState.mockResolvedValue(runState(OWN_KEY_QUALITY_OFF));
    render(<KbQualityCoverage />);
    await waitFor(() =>
      expect(screen.getByTestId('kb-quality-coverage').textContent).toBe(
        'This workspace uses its own AI key, so the global switch does not reach it. Ask the platform admin to turn kb.quality_review_enabled on for this workspace (Console → Feature flags → scope Acme). Nothing new will be suggested until then.'
      )
    );
  });

  it('old backend (no switches) ⇒ the text it had', async () => {
    getStatus.mockResolvedValue(status('off'));
    getRunState.mockResolvedValue(runState());
    render(<KbQualityCoverage />);
    expect(await screen.findByText(OLD_OFF)).toBeTruthy();
  });

  it('the switches read failing ⇒ the text it had', async () => {
    getStatus.mockResolvedValue(status('off'));
    getRunState.mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }));
    render(<KbQualityCoverage />);
    expect(await screen.findByText(OLD_OFF)).toBeTruthy();
  });

  it('CONTROL — a review that runs does not read the switches at all', async () => {
    getStatus.mockResolvedValue(status('on'));
    render(<KbQualityCoverage />);
    expect(await screen.findByText(/Checked 10 of 10/)).toBeTruthy();
    expect(getRunState).not.toHaveBeenCalled();
  });
});
