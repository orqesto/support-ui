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
const toastSuccess = vi.fn<(message: string) => void>();
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
    success: (message: string) => toastSuccess(message),
  },
}));

const {
  AiDraftsCard,
  AI_DRAFTS_NOT_DEPLOYED,
  DRAFT_PIPELINE_NOT_DEPLOYED,
  AGENT_NOTE_FACTS_NOT_DEPLOYED,
} = await import('../AiDraftsCard');
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
  toastSuccess.mockReset();
});
afterEach(cleanup);

describe('AiDraftsCard', () => {
  it('shows the saved values (the time limit in seconds) and their sources', () => {
    wrap(<AiDraftsCard drafts={SETTING} />);
    expect(similarity()).toHaveValue(0.85);
    expect(seconds()).toHaveValue(90);
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Console')).toBeInTheDocument();
    expect(save()).toBeInactive();
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
      expect(save()).toBeInactive();
    }
    // CONTROL: a bound itself is allowed.
    fireEvent.change(similarity(), { target: { value: '0.7' } });
    expect(save()).not.toBeInactive();
    expect(puts).toHaveLength(0);
  });

  it('a time limit outside the bounds or blank is blocked with the bounds said', () => {
    wrap(<AiDraftsCard drafts={SETTING} />);
    for (const bad of ['29', '181', '']) {
      fireEvent.change(seconds(), { target: { value: bad } });
      expect(screen.getByText('Enter a number of seconds from 30 to 180.')).toBeInTheDocument();
      expect(save()).toBeInactive();
    }
    fireEvent.change(seconds(), { target: { value: '180' } });
    expect(save()).not.toBeInactive();
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

describe('AiDraftsCard — fact-check thresholds (ai.agent_note_facts)', () => {
  const FACTS = {
    minDigits: { value: 3, source: 'default' as const, min: 2, max: 6 },
    minJoinedLength: { value: 6, source: 'default' as const, min: 4, max: 12 },
    maxRequiredFactsChars: { value: 600, source: 'db' as const, min: 200, max: 1000 },
  };
  const WITH_FACTS = { ...WITH_PIPELINE, agentNoteFacts: FACTS };
  const digits = () => screen.getByLabelText(/Digits that make a fact/);
  const joined = () => screen.getByLabelText(/Length to accept re-spacing/);
  const saveFacts = () => screen.getByRole('button', { name: 'Save fact check' });

  it('shows the three thresholds in effect', () => {
    wrap(<AiDraftsCard drafts={WITH_FACTS} />);
    expect(digits()).toHaveValue(3);
    expect(joined()).toHaveValue(6);
    expect(screen.getByLabelText(/Left-out list size/)).toHaveValue(600);
    expect(saveFacts()).toBeInactive();
  });

  it('saves only the threshold that changed, under agentNoteFacts', async () => {
    wrap(<AiDraftsCard drafts={WITH_FACTS} />);
    fireEvent.change(digits(), { target: { value: '4' } });
    fireEvent.click(saveFacts());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: '/api/admin/platform/settings/drafts',
      body: { agentNoteFacts: { minDigits: 4 } },
    });
  });

  it('the same number typed differently ("03") is no change (review of #979)', () => {
    wrap(<AiDraftsCard drafts={WITH_FACTS} />);
    fireEvent.change(digits(), { target: { value: '03' } });
    expect(saveFacts()).toBeInactive();
  });

  it('a value outside the bounds, a fraction or blank is blocked with the bounds said', () => {
    wrap(<AiDraftsCard drafts={WITH_FACTS} />);
    for (const value of ['1', '7', '3.5', '']) {
      fireEvent.change(digits(), { target: { value } });
      expect(screen.getByText('Enter a whole number from 2 to 6.')).toBeInTheDocument();
      expect(saveFacts()).toBeInactive();
    }
    // CONTROL: a bound itself is allowed.
    fireEvent.change(digits(), { target: { value: '6' } });
    expect(saveFacts()).not.toBeInactive();
  });

  it('CONTROL — the main Save never sends a threshold edited but not saved', async () => {
    wrap(<AiDraftsCard drafts={WITH_FACTS} />);
    fireEvent.change(digits(), { target: { value: '4' } });
    fireEvent.change(similarity(), { target: { value: '0.9' } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ kbOnlyDraftMinSimilarity: 0.9 });
  });

  it('a successful save says so (it changes every workspace)', async () => {
    wrap(<AiDraftsCard drafts={WITH_FACTS} />);
    fireEvent.change(digits(), { target: { value: '4' } });
    fireEvent.click(saveFacts());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess.mock.calls[0][0]).toMatch(/Fact check saved/);
  });

  it('an edit typed while another field saved survives the refetch (review of #926)', () => {
    const view = wrap(<AiDraftsCard drafts={WITH_FACTS} />);
    fireEvent.change(digits(), { target: { value: '4' } });
    const listSize = screen.getByLabelText(/Left-out list size/);
    fireEvent.change(listSize, { target: { value: '800' } });
    // The refetch after saving minDigits brings 4 back as the saved value.
    const refetched = {
      ...WITH_FACTS,
      agentNoteFacts: {
        ...FACTS,
        minDigits: { ...FACTS.minDigits, value: 4, source: 'db' as const },
      },
    };
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AiDraftsCard drafts={refetched} />
      </QueryClientProvider>
    );
    expect(digits()).toHaveValue(4);
    expect(screen.getByLabelText(/Left-out list size/)).toHaveValue(800);
    expect(saveFacts()).not.toBeInactive();
  });

  it('CONTROL: a field NOT edited takes the new saved value on refetch', () => {
    const view = wrap(<AiDraftsCard drafts={WITH_FACTS} />);
    const refetched = {
      ...WITH_FACTS,
      agentNoteFacts: { ...FACTS, minJoinedLength: { ...FACTS.minJoinedLength, value: 9 } },
    };
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AiDraftsCard drafts={refetched} />
      </QueryClientProvider>
    );
    expect(joined()).toHaveValue(9);
  });

  it("a saved value outside today's bounds does not block saving another field", async () => {
    const narrowed = {
      ...WITH_FACTS,
      agentNoteFacts: {
        ...FACTS,
        minJoinedLength: { value: 4, source: 'db' as const, min: 5, max: 12 },
      },
    };
    wrap(<AiDraftsCard drafts={narrowed} />);
    fireEvent.change(digits(), { target: { value: '4' } });
    fireEvent.click(saveFacts());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ agentNoteFacts: { minDigits: 4 } });
  });

  it('no block (older backend): no inputs, says it arrives with the next release', () => {
    wrap(<AiDraftsCard drafts={WITH_PIPELINE} />);
    expect(screen.getByText(AGENT_NOTE_FACTS_NOT_DEPLOYED)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save fact check' })).toBeNull();
  });
});

describe('normalizeDrafts — agentNoteFacts', () => {
  const RAW = {
    kbOnlyDraftMinSimilarity: { value: 0.85, source: 'default', min: 0.7, max: 0.99 },
    suggestionPipelineTimeoutMs: { value: 60_000, source: 'default', min: 30_000, max: 180_000 },
  };
  const FACTS_RAW = {
    minDigits: { value: 3, source: 'default', min: 2, max: 6 },
    minJoinedLength: { value: 6, source: 'default', min: 4, max: 12 },
    maxRequiredFactsChars: { value: 600, source: 'db', min: 200, max: 1000 },
  };

  it('keeps the block when all three thresholds are well-formed', () => {
    expect(normalizeDrafts({ ...RAW, agentNoteFacts: FACTS_RAW })?.agentNoteFacts).toEqual(
      FACTS_RAW
    );
  });

  it('a missing or malformed threshold drops the block, never the rest of the card', () => {
    const { minJoinedLength: _dropped, ...twoOnly } = FACTS_RAW;
    for (const agentNoteFacts of [
      undefined,
      'x',
      twoOnly,
      { ...FACTS_RAW, minDigits: { value: 3 } },
    ]) {
      const drafts = normalizeDrafts({ ...RAW, agentNoteFacts });
      expect(drafts?.agentNoteFacts).toBeUndefined();
      expect(drafts?.kbOnlyDraftMinSimilarity.value).toBe(0.85);
    }
  });
});

describe('AiDraftsCard — saves through the real mutateAsync path (fact check, "No reply needed")', () => {
  const WORDING = 'false only for pure thanks or a confirmation; true for anything else at all.';
  const CHECK = {
    ownTextMaxChars: { value: 300, source: 'default' as const, min: 100, max: 1000 },
    inlineLogoMaxBytes: { value: 20000, source: 'default' as const, min: 0, max: 200000 },
    instructions: { value: WORDING, source: 'default' as const, minLength: 40, maxLength: 2000 },
  };
  const FACTS = {
    minDigits: { value: 3, source: 'default' as const, min: 2, max: 6 },
    minJoinedLength: { value: 6, source: 'default' as const, min: 4, max: 12 },
    maxRequiredFactsChars: { value: 600, source: 'db' as const, min: 200, max: 1000 },
  };
  const SAVED_WORDING = {
    ...CHECK,
    instructions: { ...CHECK.instructions, value: `${WORDING} Saved.`, source: 'db' as const },
  };
  const drafts = (check: typeof CHECK | typeof SAVED_WORDING = CHECK) => ({
    ...WITH_PIPELINE,
    agentNoteFacts: FACTS,
    noReplyCheck: check,
  });
  // One client for the whole test: a refetch is a rerender with the new values.
  const mount = (check: typeof CHECK | typeof SAVED_WORDING = CHECK) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <AiDraftsCard drafts={drafts(check)} />
      </QueryClientProvider>
    );
    const refetch = (next: typeof CHECK | typeof SAVED_WORDING) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <AiDraftsCard drafts={drafts(next)} />
        </QueryClientProvider>
      );
    return { refetch };
  };
  const wording = () => screen.getByLabelText(/What counts as needing no reply/);
  const resetWording = () => screen.getByRole('button', { name: 'Reset wording to default' });
  const saveNoReply = () => screen.getByRole('button', { name: /Save "No reply needed"/ });

  it('fact check: a success says so; a failure is reported once, without the success toast', async () => {
    mount();
    fireEvent.change(screen.getByLabelText(/Digits that make a fact/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save fact check' }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Fact check saved. Applies within a minute.')
    );
    putFails = new Error('refused');
    fireEvent.click(screen.getByRole('button', { name: 'Save fact check' }));
    await waitFor(() => expect(toastFailure).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('"No reply needed": a success says so; a rejected save is reported, not thrown', async () => {
    mount();
    fireEvent.change(screen.getByLabelText(/Longest reply checked/), { target: { value: '400' } });
    fireEvent.click(saveNoReply());
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('"No reply needed" saved. Applies within a minute.')
    );
    expect(puts.at(-1)?.body).toEqual({ noReplyCheck: { ownTextMaxChars: 400 } });
    putFails = new Error('refused');
    fireEvent.click(saveNoReply());
    await waitFor(() =>
      expect(toastFailure).toHaveBeenCalledWith('save the AI draft settings', putFails)
    );
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('a reset that saved: the refetch shows the default', async () => {
    const { refetch } = mount(SAVED_WORDING);
    fireEvent.change(wording(), { target: { value: `${WORDING} Unsaved edit.` } });
    fireEvent.click(resetWording());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(puts.at(-1)?.body).toEqual({ noReplyCheck: { instructions: null } });
    refetch(CHECK);
    expect(wording()).toHaveValue(WORDING);
  });

  it('a reset whose save failed is dropped: the edit survives a later refetch of the wording', async () => {
    const { refetch } = mount(SAVED_WORDING);
    const typed = `${WORDING} Unsaved edit.`;
    fireEvent.change(wording(), { target: { value: typed } });
    putFails = new Error('refused');
    fireEvent.click(resetWording());
    await waitFor(() => expect(toastFailure).toHaveBeenCalledTimes(1));
    refetch(CHECK);
    expect(wording()).toHaveValue(typed);
  });
});
