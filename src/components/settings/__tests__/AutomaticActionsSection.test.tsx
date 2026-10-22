/**
 * Settings › AI › Automatic actions (owner decision 2026-10-22: the page moved here from the
 * sidebar). Shown to a KB manager only, and only when the backend has the routes — the FE reaches
 * production on merge, the backend on a tag. It sits between Learning activity and Learning Trust.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const perms = vi.hoisted(() => ({ manageKb: true, orgAdmin: true }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isOrgAdmin: perms.orgAdmin,
    hasPermission: (permission: string) =>
      permission === 'manage_knowledge_base' ? perms.manageKb : perms.orgAdmin,
    hasAnyPermission: () => perms.orgAdmin,
  }),
}));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => ({ data: undefined }) }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: () => Promise.reject(new Error('no plan in this test')) },
}));
const overviewCall = vi.hoisted(() => ({ getOverview: vi.fn() }));
vi.mock('@/services/kbAutoActions.service', () => ({ kbAutoActionsService: overviewCall }));
const nothing = () => null;
vi.mock('../PromptsSettings', () => ({ PromptsSettings: nothing }));
vi.mock('../AutoReplyConfiguration', () => ({ AutoReplyConfiguration: nothing }));
vi.mock('../AiDraftsSettings', () => ({ AiDraftsSettings: nothing }));
vi.mock('../LeadQualificationSection', () => ({ LeadQualificationSection: nothing }));
vi.mock('../LearningNotificationsInbox', () => ({ LearningNotificationsInbox: nothing }));
vi.mock('../LearningEvidenceCard', () => ({ LearningEvidenceCard: nothing }));
vi.mock('../LearningSuggestionsSettings', () => ({ LearningSuggestionsSettings: nothing }));
vi.mock('../LearningTrustSettings', () => ({ LearningTrustSettings: nothing }));
vi.mock('@/components/kb/autoActions/KbAutoActionsPanel', () => ({
  KbAutoActionsPanel: () => <div data-testid="auto-actions-panel" />,
}));

const { AIConfigSettings } = await import('../AIConfigSettings');
const { resetAutoActionsAvailability } = await import('@/hooks/useAutoActionsAvailable');

const renderAt = (section?: string) =>
  render(
    <MemoryRouter initialEntries={[`/settings#ai/${section ?? ''}`]}>
      <AIConfigSettings section={section} />
    </MemoryRouter>
  );

beforeEach(() => {
  perms.manageKb = true;
  perms.orgAdmin = true;
  resetAutoActionsAvailability();
  overviewCall.getOverview.mockReset();
  overviewCall.getOverview.mockResolvedValue({});
});
afterEach(cleanup);

const tabLabels = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.textContent ?? '')
    .filter((text) =>
      ['Learning activity', 'Automatic actions', 'Learning Trust'].some((label) =>
        text.includes(label)
      )
    );

describe('Settings › AI › Automatic actions', () => {
  it('a deep link opens the section for a KB manager, between Learning activity and Learning Trust', async () => {
    renderAt('automatic-actions');
    expect(await screen.findByTestId('auto-actions-panel')).toBeInTheDocument();
    const labels = tabLabels();
    const at = (label: string) => labels.findIndex((text) => text.includes(label));
    expect(at('Automatic actions')).toBeGreaterThan(at('Learning activity'));
    expect(at('Automatic actions')).toBeLessThan(at('Learning Trust'));
  });

  it('a KB manager who is not an org admin sees it too', async () => {
    perms.orgAdmin = false;
    renderAt('automatic-actions');
    expect(await screen.findByTestId('auto-actions-panel')).toBeInTheDocument();
  });

  it('hidden without MANAGE_KNOWLEDGE_BASE, and the backend is not even asked', async () => {
    perms.manageKb = false;
    renderAt('automatic-actions');
    await screen.findAllByRole('button', { name: /AI Prompts/ });
    expect(screen.queryByTestId('auto-actions-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Automatic actions/ })).not.toBeInTheDocument();
    expect(overviewCall.getOverview).not.toHaveBeenCalled();
  });

  it('hidden on a backend without the routes (404)', async () => {
    overviewCall.getOverview.mockRejectedValue(
      Object.assign(new Error('Request failed'), { status: 404, data: '<pre>Cannot GET</pre>' })
    );
    renderAt('automatic-actions');
    await waitFor(() => expect(overviewCall.getOverview).toHaveBeenCalled());
    expect(screen.queryByTestId('auto-actions-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Automatic actions/ })).not.toBeInTheDocument();
  });
});
