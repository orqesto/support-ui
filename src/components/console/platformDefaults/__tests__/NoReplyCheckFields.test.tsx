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
