/**
 * Platform Defaults → Routing proposals (2026-10-14): seven numbers, PATCH /settings/routing with
 * only the changed ones, the backend's ranges enforced in the form. An older backend: only why.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { RoutingSettingField } from '@/services/routingSettings';

const patches: { url: string; body: unknown }[] = [];
let patchFails: Error | null = null;
const toastFailure = vi.fn<(scope: string, error: unknown) => void>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    patch: (url: string, body: unknown) => {
      patches.push({ url, body });
      return patchFails ? Promise.reject(patchFails) : Promise.resolve({ data: { success: true } });
    },
    get: () => new Promise(() => undefined),
  },
}));
vi.mock('@/lib/toast', () => ({
  toast: {
    failure: (scope: string, error: unknown) => toastFailure(scope, error),
    success: () => undefined,
  },
}));

const { RoutingProposalsCard, ROUTING_NOT_DEPLOYED } = await import('../RoutingProposalsCard');
const { ROUTING_SETTING_SPECS, ROUTING_SETTING_FIELDS, normalizeRouting } = await import(
  '@/services/routingSettings'
);

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

const field = (value: number, source: 'db' | 'default' = 'default') => ({ value, source });
const ROUTING = {
  proposalMinConversations: field(3),
  rerouteUndoMinutes: field(10),
  dormantArchiveDays: field(90),
  autoacceptMinConversations: field(5),
  autoacceptMinDays: field(5),
  autoacceptMinReplayRatio: field(0.9),
  replayMinMatches: field(5, 'db'),
};
const input = (name: RoutingSettingField) =>
  screen.getByLabelText<HTMLInputElement>(ROUTING_SETTING_SPECS[name].label);
const saveButton = () => screen.getByRole('button', { name: 'Save routing settings' });

beforeEach(() => {
  patches.length = 0;
  patchFails = null;
  toastFailure.mockReset();
});
afterEach(cleanup);

describe('RoutingProposalsCard', () => {
  it('shows all seven values and saves only the changed ones with PATCH /settings/routing', async () => {
    wrap(<RoutingProposalsCard routing={ROUTING} />);
    expect(ROUTING_SETTING_FIELDS.map((key) => input(key).value)).toEqual([
      '3',
      '10',
      '90',
      '5',
      '5',
      '0.9',
      '5',
    ]);
    expect(saveButton()).toBeDisabled();
    fireEvent.change(input('proposalMinConversations'), { target: { value: '4' } });
    fireEvent.change(input('autoacceptMinReplayRatio'), { target: { value: '0.85' } });
    // Edited and put back: still drafted, but equal to the saved value, so it is not sent.
    fireEvent.change(input('dormantArchiveDays'), { target: { value: '91' } });
    fireEvent.change(input('dormantArchiveDays'), { target: { value: '90' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      url: '/api/admin/platform/settings/routing',
      body: { proposalMinConversations: 4, autoacceptMinReplayRatio: 0.85 },
    });
  });

  it('a value typed back to the saved one is not sent', () => {
    wrap(<RoutingProposalsCard routing={ROUTING} />);
    fireEvent.change(input('rerouteUndoMinutes'), { target: { value: '20' } });
    fireEvent.change(input('rerouteUndoMinutes'), { target: { value: '10' } });
    expect(saveButton()).toBeDisabled();
  });

  it('refuses a value outside the backend range or not whole, and sends nothing', () => {
    wrap(<RoutingProposalsCard routing={ROUTING} />);
    const cases: [RoutingSettingField, string][] = [
      ['proposalMinConversations', '0'],
      ['proposalMinConversations', '51'],
      ['proposalMinConversations', '2.5'],
      ['proposalMinConversations', ''],
      ['rerouteUndoMinutes', '241'],
      ['rerouteUndoMinutes', ''],
      ['rerouteUndoMinutes', '-1'],
      ['dormantArchiveDays', '6'],
      ['autoacceptMinReplayRatio', '0.49'],
      ['autoacceptMinReplayRatio', '1.01'],
    ];
    for (const [name, bad] of cases) {
      fireEvent.change(input(name), { target: { value: bad } });
      expect(saveButton(), `${name}=${bad}`).toBeDisabled();
      fireEvent.change(input(name), { target: { value: String(ROUTING[name].value) } });
    }
    expect(patches).toHaveLength(0);
  });

  it('accepts the range edges (0 minutes, ratio 0.5 and 1)', () => {
    wrap(<RoutingProposalsCard routing={ROUTING} />);
    fireEvent.change(input('rerouteUndoMinutes'), { target: { value: '0' } });
    expect(saveButton()).toBeEnabled();
    fireEvent.change(input('autoacceptMinReplayRatio'), { target: { value: '0.5' } });
    expect(saveButton()).toBeEnabled();
    fireEvent.change(input('autoacceptMinReplayRatio'), { target: { value: '1' } });
    expect(saveButton()).toBeEnabled();
  });

  it('shows the default and range for each field', () => {
    wrap(<RoutingProposalsCard routing={ROUTING} />);
    expect(screen.getByText(/Default 90; allowed 7 to 3650\./)).toBeInTheDocument();
    expect(screen.getByText(/Default 0\.9; allowed 0\.5 to 1\./)).toBeInTheDocument();
  });

  it('a failed save is reported, not swallowed', async () => {
    patchFails = Object.assign(new Error('nope'), { status: 400 });
    wrap(<RoutingProposalsCard routing={ROUTING} />);
    fireEvent.change(input('replayMinMatches'), { target: { value: '7' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(toastFailure).toHaveBeenCalledTimes(1));
    expect(toastFailure.mock.calls[0][0]).toMatch(/routing settings/);
  });

  it('an older backend: no inputs, says it arrives with the next backend release', () => {
    wrap(<RoutingProposalsCard routing={undefined} />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save routing settings' })).toBeNull();
    expect(screen.getByText(ROUTING_NOT_DEPLOYED)).toBeInTheDocument();
  });
});

describe('normalizeRouting', () => {
  it('keeps all seven numeric fields; a missing or non-numeric one makes the block absent', () => {
    expect(normalizeRouting(ROUTING)).toEqual(ROUTING);
    const { replayMinMatches: _omit, ...six } = ROUTING;
    expect(normalizeRouting(six)).toBeUndefined();
    expect(
      normalizeRouting({ ...ROUTING, rerouteUndoMinutes: { value: '10', source: 'db' } })
    ).toBeUndefined();
    expect(normalizeRouting(undefined)).toBeUndefined();
  });

  it('an unknown source reads as the default', () => {
    expect(
      normalizeRouting({ ...ROUTING, dormantArchiveDays: { value: 90, source: 'x' } })
        ?.dormantArchiveDays.source
    ).toBe('default');
  });
});
