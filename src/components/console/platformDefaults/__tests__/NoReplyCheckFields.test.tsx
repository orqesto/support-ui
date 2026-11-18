/**
 * Platform Defaults → AI drafts → "No reply needed" (`ai.no_reply_check`, owner 2026-11-18): the two
 * limits and the AI wording are console settings. Only changed, valid fields are sent.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NoReplyCheckFields } from '../NoReplyCheckFields';
import { ARMED_RESET_MS } from '../useReseededTexts';
import { normalizeDrafts } from '@/services/platformSettings.service';
import { readNoReplyCheck, type NoReplyCheckSettings } from '@/services/noReplyCheck.settings';
import { readBounded } from '@/services/boundedFieldRead';

const WORDING = 'false only for pure thanks or a confirmation; true for anything else at all.';
const CHECK: NoReplyCheckSettings = {
  ownTextMaxChars: { value: 300, source: 'default', min: 100, max: 1000 },
  inlineLogoMaxBytes: { value: 20000, source: 'default', min: 0, max: 200000 },
  instructions: { value: WORDING, source: 'default', minLength: 40, maxLength: 2000 },
};

const setup = () => {
  const onSave = vi.fn(() => Promise.resolve());
  render(<NoReplyCheckFields check={CHECK} saving={false} onSave={onSave} />);
  const save = screen.getByRole('button', { name: /Save "No reply needed"/ });
  return { onSave, save };
};

/** A backend with #1613: the keyword-reply hold, the total wait and the follow-up question. */
const REPAIR = 'Answer only whether the customer text needs a reply.';
const FULL: NoReplyCheckSettings = {
  ...CHECK,
  keywordReplyDeferMs: { value: 120_000, source: 'default', min: 10_000, max: 600_000 },
  keywordReplyMaxWaitMs: { value: 600_000, source: 'default', min: 60_000, max: 3_600_000 },
  repairTimeoutMs: { value: 15_000, source: 'default', min: 2_000, max: 60_000 },
  repairInstructions: { value: REPAIR, source: 'default', minLength: 10, maxLength: 1000 },
};
const setupFull = (check: NoReplyCheckSettings = FULL) => {
  const onSave = vi.fn(() => Promise.resolve());
  render(<NoReplyCheckFields check={check} saving={false} onSave={onSave} />);
  const save = screen.getByRole('button', { name: /Save "No reply needed"/ });
  return { onSave, save };
};

describe('NoReplyCheckFields — the keyword-reply hold and the follow-up question (backend #1613)', () => {
  it('an older backend sends none of them: none is shown', () => {
    setup();
    expect(screen.queryByLabelText(/Hold a keyword reply/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Follow-up question to the AI/)).not.toBeInTheDocument();
  });

  it('shown in seconds; a change is saved in milliseconds, only what changed', () => {
    const { onSave, save } = setupFull();
    expect(screen.getByLabelText(/Hold a keyword reply/)).toHaveValue(120);
    expect(screen.getByLabelText(/Longest total hold/)).toHaveValue(600);
    expect(screen.getByLabelText(/Follow-up question time limit/)).toHaveValue(15);
    expect(save).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(screen.getByLabelText(/Hold a keyword reply/), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/Follow-up question time limit/), {
      target: { value: '20' },
    });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ keywordReplyDeferMs: 30_000, repairTimeoutMs: 20_000 });
  });

  it('out of bounds, or not whole seconds: an error in seconds, Save disabled', () => {
    const { save } = setupFull();
    const hold = screen.getByLabelText(/Hold a keyword reply/);
    fireEvent.change(hold, { target: { value: '5' } });
    expect(screen.getByText('Enter a whole number of seconds from 10 to 600.')).toBeInTheDocument();
    expect(save).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(hold, { target: { value: '12.5' } });
    expect(save).toHaveAttribute('aria-disabled', 'true');
  });

  it('the total hold can never be shorter than one hold', () => {
    const { onSave, save } = setupFull();
    fireEvent.change(screen.getByLabelText(/Hold a keyword reply/), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText(/Longest total hold/), { target: { value: '120' } });
    expect(screen.getByText('Must be at least the hold time above.')).toBeInTheDocument();
    expect(save).toHaveAttribute('aria-disabled', 'true');
    // Also against the SAVED hold, when only the total is changed.
    fireEvent.change(screen.getByLabelText(/Hold a keyword reply/), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText(/Longest total hold/), { target: { value: '60' } });
    expect(screen.getByText('Must be at least the hold time above.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Longest total hold/), { target: { value: '900' } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ keywordReplyMaxWaitMs: 900_000 });
  });

  it('the follow-up wording: too short is an error; a valid one is sent trimmed', () => {
    const { onSave, save } = setupFull();
    const box = screen.getByLabelText(/Follow-up question to the AI/);
    fireEvent.change(box, { target: { value: 'short' } });
    expect(screen.getByText('Write 10 to 1000 characters.')).toBeInTheDocument();
    expect(save).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(box, { target: { value: `  ${REPAIR} Answer in JSON.  ` } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ repairInstructions: `${REPAIR} Answer in JSON.` });
  });

  it('a saved value offers Reset, which sends null for that field only', () => {
    const { onSave } = setupFull({
      ...FULL,
      keywordReplyDeferMs: { value: 30_000, source: 'db', min: 10_000, max: 600_000 },
      repairInstructions: { value: REPAIR, source: 'db', minLength: 10, maxLength: 1000 },
    });
    const resets = screen.getAllByRole('button', { name: 'Reset to default' });
    expect(resets).toHaveLength(1);
    fireEvent.click(resets[0]);
    expect(onSave).toHaveBeenCalledWith({ keywordReplyDeferMs: null });
    fireEvent.click(screen.getByRole('button', { name: 'Reset follow-up wording to default' }));
    expect(onSave).toHaveBeenCalledWith({ repairInstructions: null });
  });

  it('the reader keeps the new fields when well-formed and drops a malformed one alone', () => {
    const raw = {
      ownTextMaxChars: { value: 300, source: 'default', min: 100, max: 1000 },
      inlineLogoMaxBytes: { value: 20000, source: 'default', min: 0, max: 200000 },
      instructions: { value: WORDING, source: 'default', minLength: 40, maxLength: 2000 },
      keywordReplyDeferMs: { value: 120_000, source: 'db', min: 10_000, max: 600_000 },
      keywordReplyMaxWaitMs: { value: 'soon', source: 'db', min: 60_000, max: 3_600_000 },
      repairInstructions: { value: REPAIR, source: 'default', minLength: 10, maxLength: 1000 },
    };
    const read = readNoReplyCheck(raw);
    expect(read?.keywordReplyDeferMs).toEqual({
      value: 120_000,
      source: 'db',
      min: 10_000,
      max: 600_000,
    });
    expect(read && 'keywordReplyMaxWaitMs' in read).toBe(false);
    expect(read && 'repairTimeoutMs' in read).toBe(false);
    expect(read?.repairInstructions?.value).toBe(REPAIR);
    // An older backend: the card still reads (the original three fields only).
    const older = readNoReplyCheck({
      ownTextMaxChars: raw.ownTextMaxChars,
      inlineLogoMaxBytes: raw.inlineLogoMaxBytes,
      instructions: raw.instructions,
    });
    expect(older).toBeDefined();
    expect(older && 'repairInstructions' in older).toBe(false);
  });
});

describe('NoReplyCheckFields', () => {
  it('nothing changed: Save is disabled', () => {
    expect(setup().save).toHaveAttribute('aria-disabled', 'true');
  });

  it('sends only the field that changed', () => {
    const { onSave, save } = setup();
    fireEvent.change(screen.getByLabelText(/Longest reply checked/), { target: { value: '450' } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ ownTextMaxChars: 450 });
  });

  it('out of bounds or not whole: an error, Save disabled', () => {
    const { save } = setup();
    fireEvent.change(screen.getByLabelText(/Signature logo size/), { target: { value: '-1' } });
    expect(screen.getByText('Enter a whole number from 0 to 200000.')).toBeInTheDocument();
    expect(save).toHaveAttribute('aria-disabled', 'true');
  });

  it('wording too short: an error; a valid one is sent trimmed', () => {
    const { onSave, save } = setup();
    const box = screen.getByLabelText(/What counts as needing no reply/);
    fireEvent.change(box, { target: { value: 'too short' } });
    expect(screen.getByText('Write 40 to 2000 characters.')).toBeInTheDocument();
    expect(save).toHaveAttribute('aria-disabled', 'true');
    const next = `  ${WORDING} Also treat a bare OK as no reply.  `;
    fireEvent.change(box, { target: { value: next } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ instructions: next.trim() });
  });
});

describe('NoReplyCheckFields — reset to default (driven by the refetch)', () => {
  const saved: NoReplyCheckSettings = {
    ...CHECK,
    instructions: { ...CHECK.instructions, value: `${WORDING} Saved.`, source: 'db' },
  };
  const box = () => screen.getByLabelText(/What counts as needing no reply/);
  /** The save's promise, settled by the test (the mutation awaits its refetch before resolving). */
  const deferred = () => {
    let settle: { resolve: () => void; reject: (error: Error) => void } | undefined;
    const promise = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
    return { promise, ...settle! };
  };
  const mount = (check: NoReplyCheckSettings = saved) => {
    const save = deferred();
    const onSave = vi.fn(() => save.promise);
    const view = render(<NoReplyCheckFields check={check} saving={false} onSave={onSave} />);
    const refetch = (next: NoReplyCheckSettings, saving = false) =>
      view.rerender(<NoReplyCheckFields check={next} saving={saving} onSave={onSave} />);
    return { onSave, save, refetch };
  };
  const otherAdminsWording: NoReplyCheckSettings = {
    ...saved,
    instructions: { ...saved.instructions, value: `${WORDING} Other.` },
  };

  it('the refetch after a reset shows the default once the save succeeded; Save stays off', async () => {
    const { onSave, save, refetch } = mount();
    fireEvent.change(box(), { target: { value: `${WORDING} Unsaved edit.` } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
    expect(onSave).toHaveBeenCalledWith({ instructions: null });
    // The mutation awaits its own refetch, then resolves.
    refetch(CHECK);
    save.resolve();
    await waitFor(() => expect(box()).toHaveValue(WORDING));
    expect(screen.getByRole('button', { name: /Save "No reply needed"/ })).toBeInactive();
  });

  it('a save that succeeds before its refetch: the refetch shows the default', async () => {
    const { save, refetch } = mount();
    fireEvent.change(box(), { target: { value: `${WORDING} Unsaved edit.` } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
    save.resolve();
    await act(() => save.promise);
    refetch(CHECK);
    expect(box()).toHaveValue(WORDING);
  });

  it('a reset whose own refetch never came: on expiry the values are fetched again and show the default', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const save = deferred();
      const shown: { view?: ReturnType<typeof render> } = {};
      const onSave = vi.fn(() => save.promise);
      // The second fetch works: it brings the default.
      const onRefetch = vi.fn(() => {
        shown.view?.rerender(
          <NoReplyCheckFields check={CHECK} saving={false} onSave={onSave} onRefetch={onRefetch} />
        );
        return Promise.resolve();
      });
      shown.view = render(
        <NoReplyCheckFields check={saved} saving={false} onSave={onSave} onRefetch={onRefetch} />
      );
      fireEvent.change(box(), { target: { value: `${WORDING} Unsaved edit.` } });
      fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
      // The save succeeds, but its own refetch failed: the field does not change yet.
      save.resolve();
      await act(() => save.promise);
      expect(onRefetch).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(ARMED_RESET_MS + 1));
      expect(onRefetch).toHaveBeenCalledTimes(1);
      expect(box()).toHaveValue(WORDING);
      expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a reset whose value cannot be loaded even after expiry: marked unknown, Save blocked (never the stale wording as live)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const save = deferred();
      const onSave = vi.fn(() => save.promise);
      const onRefetch = vi.fn(() => Promise.reject(new Error('offline')));
      const view = render(
        <NoReplyCheckFields check={saved} saving={false} onSave={onSave} onRefetch={onRefetch} />
      );
      fireEvent.change(box(), { target: { value: `${WORDING} Unsaved edit.` } });
      fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
      save.resolve();
      await act(() => save.promise);
      await act(() => vi.advanceTimersByTimeAsync(ARMED_RESET_MS + 1));
      expect(screen.getByText(/could not be loaded. Reload the page/)).toBeInTheDocument();
      // Nothing may be saved over a value nobody could read: Reset is blocked as well.
      for (const reset of screen.getAllByRole('button', { name: /^Reset / })) {
        expect(reset).toBeInactive();
      }
      fireEvent.change(box(), { target: { value: `${WORDING} Typed again.` } });
      expect(screen.getByRole('button', { name: /Save "No reply needed"/ })).toBeInactive();
      // Once the saved value arrives (another refetch), the field is known again.
      view.rerender(
        <NoReplyCheckFields check={CHECK} saving={false} onSave={onSave} onRefetch={onRefetch} />
      );
      expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a reset whose field landed has no timer left: unmounting leaves nothing scheduled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { save, refetch } = mount();
      fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
      save.resolve();
      await act(() => save.promise);
      // Armed: one expiry timer. The field's refetch lands and uses the reset: the timer is cleared.
      expect(vi.getTimerCount()).toBe(1);
      refetch(CHECK);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('text typed after Reset is kept when the refetch lands; the fields stay editable', async () => {
    const { save, refetch } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
    refetch(saved, true);
    expect(box()).not.toBeInactive();
    const later = `${WORDING} Typed after the reset.`;
    fireEvent.change(box(), { target: { value: later } });
    refetch(CHECK);
    save.resolve();
    await act(() => save.promise);
    expect(box()).toHaveValue(later);
  });

  it('a failed reset keeps the edit, also across a refetch of another field', async () => {
    const { save, refetch } = mount();
    const typed = `${WORDING} Unsaved edit.`;
    fireEvent.change(box(), { target: { value: typed } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
    save.reject(new Error('save failed'));
    await act(() => save.promise.catch(() => undefined));
    refetch({ ...saved, ownTextMaxChars: { ...saved.ownTextMaxChars, value: 400, source: 'db' } });
    expect(box()).toHaveValue(typed);
  });

  it("another admin's save landing while the reset is in flight does not apply it; its failure keeps the edit", async () => {
    const { save, refetch } = mount();
    const typed = `${WORDING} Unsaved edit.`;
    fireEvent.change(box(), { target: { value: typed } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
    // Another admin changes the wording itself before this reset's save settles.
    refetch(otherAdminsWording);
    expect(box()).toHaveValue(typed);
    save.reject(new Error('save failed'));
    await act(() => save.promise.catch(() => undefined));
    expect(box()).toHaveValue(typed);
    // And a later refetch of the wording does not apply the dropped reset either.
    refetch(CHECK);
    expect(box()).toHaveValue(typed);
  });

  it('a default equal to the stored value: the source change still drops the edit', async () => {
    const { save, refetch } = mount({
      ...CHECK,
      instructions: { ...CHECK.instructions, source: 'db' },
    });
    fireEvent.change(box(), { target: { value: `${WORDING} Unsaved edit.` } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
    refetch(CHECK);
    save.resolve();
    await waitFor(() => expect(box()).toHaveValue(WORDING));
  });

  it('a failed main Save is caught (the mutation reports it): no unhandled rejection', async () => {
    const onSave = vi.fn(() => Promise.reject(new Error('save failed')));
    render(<NoReplyCheckFields check={saved} saving={false} onSave={onSave} />);
    fireEvent.change(box(), { target: { value: `${WORDING} Edited.` } });
    fireEvent.click(screen.getByRole('button', { name: /Save "No reply needed"/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    // An unhandled rejection would fail the run; let it surface before the test ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('"0300" is 300: Save stays off, and the refetch re-seeds it (one rule)', () => {
    const onSave = vi.fn(() => Promise.resolve());
    const view = render(<NoReplyCheckFields check={CHECK} saving={false} onSave={onSave} />);
    const field = () => screen.getByLabelText(/Longest reply checked/);
    fireEvent.change(field(), { target: { value: '0300' } });
    expect(screen.getByRole('button', { name: /Save "No reply needed"/ })).toBeInactive();
    view.rerender(
      <NoReplyCheckFields
        check={{
          ...CHECK,
          ownTextMaxChars: { ...CHECK.ownTextMaxChars, value: 350, source: 'db' },
        }}
        saving={false}
        onSave={onSave}
      />
    );
    expect(field()).toHaveValue(350);
  });
});

describe('readNoReplyCheck — an unknown source', () => {
  it('reads as default, as every console reader does — never "not deployed" (review of #980)', () => {
    const raw = {
      ...CHECK,
      ownTextMaxChars: { ...CHECK.ownTextMaxChars, source: 'platform' },
      instructions: { ...CHECK.instructions, source: 'platform' },
    };
    const read = readNoReplyCheck(raw);
    expect(read?.instructions.source).toBe('default');
    expect(read?.ownTextMaxChars.source).toBe('default');
  });
});

describe('readBounded — one reader for every bounded field', () => {
  it('a source this build does not know reads as default; a fraction is not a bound', () => {
    expect(readBounded({ value: 3, source: 'platform', min: 1, max: 9 })).toEqual({
      value: 3,
      source: 'default',
      min: 1,
      max: 9,
    });
    expect(readBounded({ value: 3, source: 'db', min: 1, max: 2.5 })).toBeUndefined();
    expect(readBounded({ value: 2.5, source: 'db', min: 1, max: 9 })).toBeUndefined();
  });
});

describe('normalizeDrafts — noReplyCheck', () => {
  const RAW = {
    kbOnlyDraftMinSimilarity: { value: 0.85, source: 'default', min: 0.7, max: 0.99 },
    suggestionPipelineTimeoutMs: { value: 60_000, source: 'default', min: 30_000, max: 180_000 },
  };

  it('reads a well-formed block', () => {
    expect(normalizeDrafts({ ...RAW, noReplyCheck: CHECK })?.noReplyCheck).toEqual(CHECK);
  });

  it('a malformed or missing block (older backend) is absent — the card says not deployed', () => {
    const { instructions: _dropped, ...noWording } = CHECK;
    expect(normalizeDrafts({ ...RAW, noReplyCheck: noWording })?.noReplyCheck).toBeUndefined();
    expect(normalizeDrafts(RAW)?.noReplyCheck).toBeUndefined();
  });
});
