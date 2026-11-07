/**
 * Console → Maintenance › Analytics exclusions: the list is sent whole, a listed workspace the
 * picker doesn't know stays listed, and a backend that predates the list shows no card.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AnalyticsExclusionsCard } from '../AnalyticsExclusionsCard';
import {
  normaliseMaintenance,
  type AnalyticsExclusionsState,
} from '@/services/maintenance.service';

const OPTIONS = [
  { value: '3', label: 'Demo Workspace' },
  { value: '8', label: 'Example Testing' },
];

const renderCard = (state: AnalyticsExclusionsState) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AnalyticsExclusionsCard
        state={state}
        workspaceOptions={OPTIONS}
        queryKey={['platform', 'maintenance']}
      />
    </QueryClientProvider>
  );

beforeEach(() => api.put.mockReset());
afterEach(cleanup);

describe('AnalyticsExclusionsCard', () => {
  it('shows listed workspaces by name, and an unknown id by number so a save keeps it', () => {
    renderCard({ workspaceIds: [3, 99], selfHosted: false });
    expect(screen.getByText('Demo Workspace')).toBeTruthy();
    expect(screen.getByText('Workspace #99')).toBeTruthy();
  });

  it('Save stays off until the list changes, then PUTs the whole list', async () => {
    api.put.mockResolvedValue({ data: { data: { workspaceIds: [99] } } });
    renderCard({ workspaceIds: [3, 99], selfHosted: false });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeInactive();
    fireEvent.click(screen.getByRole('button', { name: /remove demo workspace/i }));
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/system/maintenance/analytics-exclusions', {
        workspaceIds: [99],
      })
    );
  });

  it('says the list changes nothing on a self-hosted server', () => {
    renderCard({ workspaceIds: [], selfHosted: true });
    expect(screen.getByText(/never sends analytics/)).toBeTruthy();
  });

  it('normalises the backend answer; an older backend gives null (no card)', () => {
    expect(normaliseMaintenance({ jobs: [], repairs: {} }).analyticsExclusions).toBeNull();
    expect(
      normaliseMaintenance({
        analyticsExclusions: { workspaceIds: [4, '5', -1, 2.5, 7], selfHosted: true },
      }).analyticsExclusions
    ).toEqual({ workspaceIds: [4, 7], selfHosted: true });
  });
});
