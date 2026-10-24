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

const { AiDraftsCard, AI_DRAFTS_NOT_DEPLOYED, DRAFT_PIPELINE_NOT_DEPLOYED } = await import(
  '../AiDraftsCard'
);
const { chooseOption } = await import('@/test/chooseOption');
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
const WITH_PIPELINE = {
  ...SETTING,
  draftPipeline: {
    value: 'single' as const,
    source: 'default' as const,
    options: ['single' as const, 'legacy' as const],
  },
};
const pipeline = () => screen.getByRole('combobox', { name: 'Draft pipeline' });
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

describe('AiDraftsCard — the draft pipeline switch (ai.draft_pipeline)', () => {
  it('shows the pipeline in effect and that it is the built-in default', () => {
    wrap(<AiDraftsCard drafts={WITH_PIPELINE} />);
    expect(pipeline()).toBeInTheDocument();
    expect(
      screen.getByText(/Single pass: one draft over the top knowledge-base entries/)
    ).toBeInTheDocument();
    expect(screen.getByText(/In effect: single-pass, the built-in default/)).toBeInTheDocument();
  });

  it('a pipeline switched in the console says so (source db)', () => {
    wrap(
      <AiDraftsCard
        drafts={{
          ...WITH_PIPELINE,
          draftPipeline: { ...WITH_PIPELINE.draftPipeline, value: 'legacy', source: 'db' },
        }}
      />
    );
    expect(screen.getByText(/Legacy: a draft per knowledge-base entry/)).toBeInTheDocument();
    expect(screen.getByText(/In effect: legacy, switched here/)).toBeInTheDocument();
    expect(screen.getAllByText('Console').length).toBeGreaterThanOrEqual(2);
  });

  it('a change is confirmed first, then saved on its own with PUT /settings/drafts', async () => {
    wrap(<AiDraftsCard drafts={WITH_PIPELINE} />);
    await chooseOption(pipeline(), /Legacy/);
    // Nothing is sent before the confirmation.
    expect(puts).toHaveLength(0);
    expect(screen.getByText('Switch the draft pipeline?')).toBeInTheDocument();
    expect(screen.getByText(/written by the legacy pipeline/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: '/api/admin/platform/settings/drafts',
      body: { draftPipeline: 'legacy' },
    });
  });

  it('the switch saves only the pipeline, never a number edited but not saved', async () => {
    wrap(<AiDraftsCard drafts={WITH_PIPELINE} />);
    fireEvent.change(similarity(), { target: { value: '0.9' } });
    await chooseOption(pipeline(), /Legacy/);
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ draftPipeline: 'legacy' });
  });

  it('CONTROL — cancelling the confirmation saves nothing', async () => {
    wrap(<AiDraftsCard drafts={WITH_PIPELINE} />);
    await chooseOption(pipeline(), /Legacy/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Switch the draft pipeline?')).toBeNull());
    expect(puts).toHaveLength(0);
  });

  it('CONTROL — picking the pipeline already in effect asks nothing and saves nothing', async () => {
    wrap(<AiDraftsCard drafts={WITH_PIPELINE} />);
    await chooseOption(pipeline(), /Single pass/);
    expect(screen.queryByText('Switch the draft pipeline?')).toBeNull();
    expect(puts).toHaveLength(0);
  });

  it('a backend without the switch: the numbers stay, the switch says it arrives later', () => {
    wrap(<AiDraftsCard drafts={SETTING} />);
    expect(similarity()).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Draft pipeline' })).toBeNull();
    expect(screen.getByText(DRAFT_PIPELINE_NOT_DEPLOYED)).toBeInTheDocument();
  });
});

describe('normalizeDrafts — draftPipeline', () => {
  it('keeps the pipeline the backend sends', () => {
    expect(normalizeDrafts(WITH_PIPELINE)).toEqual(WITH_PIPELINE);
  });

  it('an unknown mode drops the switch but keeps the numbers', () => {
    const normalized = normalizeDrafts({
      ...SETTING,
      draftPipeline: { value: 'turbo', source: 'db', options: ['single', 'turbo'] },
    });
    expect(normalized).toEqual(SETTING);
  });

  it('unknown options are not offered; an unknown source reads as default', () => {
    expect(
      normalizeDrafts({
        ...SETTING,
        draftPipeline: { value: 'legacy', source: 'weird', options: ['legacy', 'turbo'] },
      })?.draftPipeline
    ).toEqual({ value: 'legacy', source: 'default', options: ['legacy'] });
    expect(
      normalizeDrafts({ ...SETTING, draftPipeline: { value: 'single', source: 'db' } })
        ?.draftPipeline?.options
    ).toEqual(['single', 'legacy']);
  });
});
