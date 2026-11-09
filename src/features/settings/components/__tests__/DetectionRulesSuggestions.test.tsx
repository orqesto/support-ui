/** Detection Rules decides the engine's detection suggestions in place. Invented data. */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import type * as LearningServiceModule from '@/services/learning.service';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const fetches = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/features/settings/services/detectionRule.service', () => ({
  detectionRuleService: {
    getAll: () => {
      fetches.count += 1;
      return Promise.resolve({ success: true, data: [] });
    },
  },
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [] }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: true }) }));

const pending = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/services/learning.service', async (importOriginal) => {
  const actual = await importOriginal<typeof LearningServiceModule>();
  return {
    ...actual,
    learningService: {
      acceptSuggestion: () => Promise.resolve({}),
      declineSuggestion: () => Promise.resolve({}),
      listSuggestions: (domain?: string) =>
        Promise.resolve((pending.list as Array<{ domain: string }>).filter((item) => !domain || item.domain === domain)),
    },
  };
});
vi.mock('@/hooks/useSuggestionDomainAccess', () => ({
  useSuggestionDomainAccess: () => ({ canActOn: () => true, canActOnSuggestion: () => true, canActOnAnyDomain: true }),
}));
const suggestion = (id: number, domain: string, suggestionType: string, payload: Record<string, unknown> = {}) => ({
  id, domain, suggestionType, payload, evidenceEventIds: null, evidenceCount: 3, confidence: null,
  status: 'pending', expiresAt: '9999-12-31T00:00:00Z', createdAt: '2026-10-14T09:00:00Z',
});

import { DetectionRulesSettings } from '@/features/settings/components/DetectionRulesSettings';

beforeEach(() => { pending.list = []; });
afterEach(cleanup);

describe('Detection Rules › Suggestions', () => {
  it('a pending detection promotion can be accepted or declined on the page', async () => {
    pending.list = [suggestion(41, 'detection', 'promote', { summary: 'refund request' })];
    render(<DetectionRulesSettings />);
    expect(await screen.findByRole('button', { name: 'Accept this suggestion' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
  });

  it('accepting a suggestion reloads the rule list (it may have added, promoted or disabled a rule)', async () => {
    pending.list = [suggestion(92, 'detection', 'promote', { summary: 'invented' })];
    render(<DetectionRulesSettings />);
    const accept = await screen.findByRole('button', { name: 'Accept this suggestion' });
    const before = fetches.count;
    fireEvent.click(accept);
    await waitFor(() => expect(fetches.count).toBe(before + 1));
  });
});
