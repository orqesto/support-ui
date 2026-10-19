/**
 * Platform Defaults → Hourly AI calls (2026-10-19): limit + live reserve, saved as a PARTIAL PUT
 * /settings/analysis-hourly. A backend without the block: no inputs, only why.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const puts: { url: string; body: unknown }[] = [];
let putFails: Error | null = null;
const toastFailure = vi.fn<(scope: string, error: unknown) => void>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (url: string, body: unknown) => {
      puts.push({ url, body });
      return putFails ? Promise.reject(putFails) : Promise.resolve({ data: { success: true } });
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

const { AnalysisHourlyCard, ANALYSIS_HOURLY_NOT_DEPLOYED } = await import('../AnalysisHourlyCard');
const { normalizeAnalysisHourly } = await import('@/services/platformSettings.service');

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

const SETTING = {
  callsPerHour: { value: 1000, source: 'default' as const, min: 50, max: 100000 },
  liveReserveCallsPerHour: { value: 200, source: 'db' as const, min: 0, max: 999 },
  kbCallsPerHour: 800,
};
const limit = () => screen.getByLabelText(/AI calls per hour/);
const reserve = () => screen.getByLabelText(/Reserved for live mail/);
const save = () => screen.getByRole('button', { name: 'Save' });
const kbLine = () => screen.getByTestId('kb-calls-line').textContent;

beforeEach(() => {
  puts.length = 0;
  putFails = null;
  toastFailure.mockReset();
});
afterEach(cleanup);

describe('AnalysisHourlyCard', () => {
  it('shows the saved values, their sources and what the knowledge base can use', () => {
    wrap(<AnalysisHourlyCard analysisHourly={SETTING} />);
    expect(limit()).toHaveValue(1000);
    expect(reserve()).toHaveValue(200);
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Console')).toBeInTheDocument();
    expect(kbLine()).toBe('Knowledge base can use up to 800 calls per hour.');
    expect(save()).toBeDisabled();
    expect(screen.queryByTestId('reserve-clamped')).toBeNull();
  });

  it('an env source reads "Server setting"', () => {
    wrap(
      <AnalysisHourlyCard
        analysisHourly={{ ...SETTING, callsPerHour: { ...SETTING.callsPerHour, source: 'env' } }}
      />
    );
    expect(screen.getByText('Server setting')).toBeInTheDocument();
    expect(screen.queryByText('Environment')).toBeNull();
  });

  it('the knowledge-base line follows the inputs live', () => {
    wrap(<AnalysisHourlyCard analysisHourly={SETTING} />);
    fireEvent.change(limit(), { target: { value: '2000' } });
    expect(kbLine()).toBe('Knowledge base can use up to 1,800 calls per hour.');
    fireEvent.change(reserve(), { target: { value: '500' } });
    expect(kbLine()).toBe('Knowledge base can use up to 1,500 calls per hour.');
  });

  it('saves only the field that changed, with PUT /settings/analysis-hourly', async () => {
    wrap(<AnalysisHourlyCard analysisHourly={SETTING} />);
    fireEvent.change(reserve(), { target: { value: '300' } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: '/api/admin/platform/settings/analysis-hourly',
      body: { liveReserveCallsPerHour: 300 },
    });
  });

  it('both changed together are sent together (a reserve above the old limit is fine)', async () => {
    wrap(<AnalysisHourlyCard analysisHourly={SETTING} />);
    fireEvent.change(limit(), { target: { value: '5000' } });
    fireEvent.change(reserve(), { target: { value: '1500' } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ callsPerHour: 5000, liveReserveCallsPerHour: 1500 });
  });

  it('a reserve at or above the limit is blocked here, nothing is sent', () => {
    wrap(<AnalysisHourlyCard analysisHourly={SETTING} />);
    for (const value of ['1000', '1500']) {
      fireEvent.change(reserve(), { target: { value } });
      expect(
        screen.getByText('The reserve must be lower than the calls per hour.')
      ).toBeInTheDocument();
      expect(save()).toBeDisabled();
    }
    fireEvent.change(reserve(), { target: { value: '999' } });
    expect(save()).toBeEnabled();
    expect(puts).toHaveLength(0);
  });

  it('a limit outside the bounds, a fraction or blank is blocked with the bounds said', () => {
    wrap(<AnalysisHourlyCard analysisHourly={SETTING} />);
    for (const bad of ['49', '100001', '1.5', '']) {
      fireEvent.change(limit(), { target: { value: bad } });
      expect(screen.getByText('Enter a whole number from 50 to 100000.')).toBeInTheDocument();
      expect(save()).toBeDisabled();
    }
    expect(puts).toHaveLength(0);
  });

  it('a refusal from the server (400) is reported, not swallowed', async () => {
    putFails = Object.assign(new Error('reserve must be lower than the limit'), { status: 400 });
    wrap(<AnalysisHourlyCard analysisHourly={SETTING} />);
    fireEvent.change(reserve(), { target: { value: '300' } });
    fireEvent.click(save());
    await waitFor(() => expect(toastFailure).toHaveBeenCalledTimes(1));
    expect(toastFailure.mock.calls[0][0]).toMatch(/hourly AI call/);
  });

  it('a clamped saved reserve is said, with the value in use', () => {
    wrap(
      <AnalysisHourlyCard
        analysisHourly={{
          ...SETTING,
          liveReserveCallsPerHour: { ...SETTING.liveReserveCallsPerHour, value: 999, saved: 5000 },
        }}
      />
    );
    expect(screen.getByTestId('reserve-clamped').textContent).toMatch(/saved reserve of 5,000/);
    expect(screen.getByTestId('reserve-clamped').textContent).toMatch(/999 is in use/);
  });

  it('no block (older backend): no inputs, says it arrives with the next release', () => {
    wrap(<AnalysisHourlyCard analysisHourly={undefined} />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText(ANALYSIS_HOURLY_NOT_DEPLOYED)).toBeInTheDocument();
  });
});

describe('normalizeAnalysisHourly', () => {
  it('keeps the block, including the clamp note', () => {
    expect(normalizeAnalysisHourly(SETTING)).toEqual(SETTING);
    expect(
      normalizeAnalysisHourly({
        ...SETTING,
        liveReserveCallsPerHour: { ...SETTING.liveReserveCallsPerHour, saved: 5000 },
      })?.liveReserveCallsPerHour.saved
    ).toBe(5000);
  });

  it('either field missing or malformed: absent', () => {
    expect(normalizeAnalysisHourly({ callsPerHour: SETTING.callsPerHour })).toBeUndefined();
    expect(
      normalizeAnalysisHourly({ ...SETTING, callsPerHour: { value: '1000', source: 'db' } })
    ).toBeUndefined();
    expect(normalizeAnalysisHourly(undefined)).toBeUndefined();
  });
});
