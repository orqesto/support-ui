import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { OrgTokenBudget } from '@/services/managedAiUsage.service';
import { WorkspaceLimitCell } from '../WorkspaceTokenLimits';

afterEach(cleanup);

const budget = (monthly?: OrgTokenBudget['monthly']): OrgTokenBudget => ({
  kb: { limit: 2_000_000, source: 'platform', spentToday: 150_000 },
  regular: { limit: 1_000_000, source: 'platform', spentToday: 40_000 },
  override: null,
  enforced: false,
  monthly,
});

const noop = () => undefined;

/**
 * A tester read the plan's AI-call column ("own key · no cap") as the monthly TOKEN limit not
 * applying (2026-10-14). The monthly token limits are shown in the token-limit cell, own key or not.
 */
describe('WorkspaceLimitCell — monthly limits', () => {
  it("shows this month's spend against each monthly limit beside today's", () => {
    render(
      <WorkspaceLimitCell
        budget={budget({
          kb: { limit: 20_000_000, source: 'platform', spentThisMonth: 3_500_000 },
          regular: { limit: 10_000_000, source: 'workspace', spentThisMonth: 900_000 },
        })}
        onOpen={noop}
      />
    );
    expect(screen.getByText(/KB month 3,500,000 \/ 20,000,000/)).toBeTruthy();
    expect(screen.getByText(/Regular month 900,000 \/ 10,000,000/)).toBeTruthy();
    expect(screen.getByText(/KB 150,000 \/ 2,000,000/)).toBeTruthy();
  });

  it('says a bucket has no monthly limit rather than leaving it out', () => {
    render(
      <WorkspaceLimitCell
        budget={budget({
          kb: null,
          regular: { limit: 10_000_000, source: 'platform', spentThisMonth: 0 },
        })}
        onOpen={noop}
      />
    );
    expect(screen.getByText('KB month · no monthly limit')).toBeTruthy();
    expect(screen.getByText(/Regular month 0 \/ 10,000,000/)).toBeTruthy();
  });

  it('shows nothing monthly from a backend that does not send it', () => {
    render(<WorkspaceLimitCell budget={budget()} onOpen={noop} />);
    expect(screen.queryByText(/month/)).toBeNull();
  });
});
