/**
 * Platform Defaults → AI drafts (2026-10-21): the KB-only draft similarity bar and the drafting
 * time limit, saved as a PARTIAL PUT /settings/drafts. A backend without the block: no inputs,
 * only why.
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

const { AiDraftsCard, AI_DRAFTS_NOT_DEPLOYED } = await import('../AiDraftsCard');
const { normalizeDrafts } = await import('@/services/platformSettings.service');

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

const SETTING = {
  kbOnlyDraftMinSimilarity: { value: 0.85, source: 'default' as const, min: 0.7, max: 0.99 },
  suggestionPipelineTimeoutMs: {
    value: 90_000,
    source: 'db' as const,
    min: 30_000,
    max: 180_000,
  },
};
const similarity = () => screen.getByLabelText(/Similarity to draft from one KB entry/);
const seconds = () => screen.getByLabelText(/Drafting time limit/);
const save = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  puts.length = 0;
  putFails = null;
  toastFailure.mockReset();
});
afterEach(cleanup);

describe('AiDraftsCard', () => {
  it('shows the saved values (the time limit in seconds) and their sources', () => {
    wrap(<AiDraftsCard drafts={SETTING} />);
    expect(similarity()).toHaveValue(0.85);
    expect(seconds()).toHaveValue(90);
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Console')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('saves only the field that changed, with PUT /settings/drafts', async () => {
    wrap(<AiDraftsCard drafts={SETTING} />);
    fireEvent.change(similarity(), { target: { value: '0.9' } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: '/api/admin/platform/settings/drafts',
      body: { kbOnlyDraftMinSimilarity: 0.9 },
    });
  });

  it('the time limit is typed in seconds and sent in milliseconds', async () => {
    wrap(<AiDraftsCard drafts={SETTING} />);
    fireEvent.change(seconds(), { target: { value: '120' } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ suggestionPipelineTimeoutMs: 120_000 });
  });

  it('both changed together are sent together', async () => {
    wrap(<AiDraftsCard drafts={SETTING} />);
    fireEvent.change(similarity(), { target: { value: '0.75' } });
    fireEvent.change(seconds(), { target: { value: '60' } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({
      kbOnlyDraftMinSimilarity: 0.75,
      suggestionPipelineTimeoutMs: 60_000,
    });
  });

  it('a similarity outside the bounds or blank is blocked with the bounds said', () => {
    wrap(<AiDraftsCard drafts={SETTING} />);
    for (const bad of ['0.69', '1', '']) {
      fireEvent.change(similarity(), { target: { value: bad } });
      expect(screen.getByText('Enter a number from 0.7 to 0.99.')).toBeInTheDocument();
      expect(save()).toBeDisabled();
    }
    // CONTROL: a bound itself is allowed.
    fireEvent.change(similarity(), { target: { value: '0.7' } });
    expect(save()).toBeEnabled();
    expect(puts).toHaveLength(0);
  });

  it('a time limit outside the bounds or blank is blocked with the bounds said', () => {
    wrap(<AiDraftsCard drafts={SETTING} />);
    for (const bad of ['29', '181', '']) {
      fireEvent.change(seconds(), { target: { value: bad } });
      expect(screen.getByText('Enter a number of seconds from 30 to 180.')).toBeInTheDocument();
      expect(save()).toBeDisabled();
    }
    fireEvent.change(seconds(), { target: { value: '180' } });
    expect(save()).toBeEnabled();
    expect(puts).toHaveLength(0);
  });

  it('a refusal from the server (400) is reported, not swallowed', async () => {
    putFails = Object.assign(new Error('out of range'), { status: 400 });
    wrap(<AiDraftsCard drafts={SETTING} />);
    fireEvent.change(similarity(), { target: { value: '0.9' } });
    fireEvent.click(save());
    await waitFor(() => expect(toastFailure).toHaveBeenCalledTimes(1));
    expect(toastFailure.mock.calls[0][0]).toMatch(/AI draft settings/);
  });

  it('no block (older backend): no inputs, says it arrives with the next release', () => {
    wrap(<AiDraftsCard drafts={undefined} />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText(AI_DRAFTS_NOT_DEPLOYED)).toBeInTheDocument();
  });
});

describe('normalizeDrafts', () => {
  it('keeps the block, with a fractional similarity and its fractional bounds', () => {
    expect(normalizeDrafts(SETTING)).toEqual(SETTING);
  });

  it('either field missing or malformed: absent (an older backend)', () => {
    expect(
      normalizeDrafts({ kbOnlyDraftMinSimilarity: SETTING.kbOnlyDraftMinSimilarity })
    ).toBeUndefined();
    expect(
      normalizeDrafts({
        ...SETTING,
        kbOnlyDraftMinSimilarity: { value: '0.85', source: 'db', min: 0.7, max: 0.99 },
      })
    ).toBeUndefined();
    expect(
      normalizeDrafts({
        ...SETTING,
        suggestionPipelineTimeoutMs: { value: 60_000.5, source: 'db', min: 30_000, max: 180_000 },
      })
    ).toBeUndefined();
    expect(normalizeDrafts(undefined)).toBeUndefined();
  });

  it('an unknown source reads as default rather than being trusted', () => {
    expect(
      normalizeDrafts({
        ...SETTING,
        kbOnlyDraftMinSimilarity: { ...SETTING.kbOnlyDraftMinSimilarity, source: 'weird' },
      })?.kbOnlyDraftMinSimilarity.source
    ).toBe('default');
  });
});
