/**
 * Platform Defaults → AI drafts → "No reply needed" (`ai.no_reply_check`, owner 2026-11-18): the two
 * limits and the AI wording are console settings. Only changed, valid fields are sent.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NoReplyCheckFields } from '../NoReplyCheckFields';
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
  const onSave = vi.fn();
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

describe('NoReplyCheckFields — reset to default', () => {
  const saved: NoReplyCheckSettings = {
    ...CHECK,
    instructions: { ...CHECK.instructions, value: `${WORDING} Saved.`, source: 'db' },
  };
  const box = () => screen.getByLabelText(/What counts as needing no reply/);

  it('a reset that SAVED drops the unsaved edit: the default shows, Save stays off', () => {
    // The save succeeds: the card calls back.
    const onSave = vi.fn((_changed: unknown, onSaved?: () => void) => onSaved?.());
    const { rerender } = render(
      <NoReplyCheckFields check={saved} saving={false} onSave={onSave} />
    );
    fireEvent.change(box(), { target: { value: `${WORDING} Unsaved edit.` } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
    expect(onSave).toHaveBeenCalledWith({ instructions: null }, expect.any(Function));
    // The refetch answers the default.
    rerender(<NoReplyCheckFields check={CHECK} saving={false} onSave={onSave} />);
    expect(box()).toHaveValue(WORDING);
    expect(screen.getByRole('button', { name: /Save "No reply needed"/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('a reset that FAILED keeps what was typed (review of #979)', () => {
    const onSave = vi.fn(); // never calls back: the save failed
    render(<NoReplyCheckFields check={saved} saving={false} onSave={onSave} />);
    const typed = `${WORDING} Unsaved edit.`;
    fireEvent.change(box(), { target: { value: typed } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
    expect(box()).toHaveValue(typed);
  });

  it('the same number typed differently ("0300") is no change', () => {
    const { save } = setup();
    fireEvent.change(screen.getByLabelText(/Longest reply checked/), { target: { value: '0300' } });
    expect(save).toHaveAttribute('aria-disabled', 'true');
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

describe('NoReplyCheckFields — typing while a reset saves', () => {
  const saved: NoReplyCheckSettings = {
    ...CHECK,
    instructions: { ...CHECK.instructions, value: `${WORDING} Saved.`, source: 'db' },
  };
  it('stays editable, and text typed after Reset is kept when the reset lands (review of #980)', () => {
    let finish: (() => void) | undefined;
    const onSave = vi.fn((_changed: unknown, onSaved?: () => void) => {
      finish = onSaved;
    });
    const { rerender } = render(
      <NoReplyCheckFields check={saved} saving={false} onSave={onSave} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
    // The save is in flight: the field stays editable.
    rerender(<NoReplyCheckFields check={saved} saving onSave={onSave} />);
    const box = screen.getByLabelText(/What counts as needing no reply/);
    expect(box).not.toBeInactive();
    const later = `${WORDING} Typed after the reset.`;
    fireEvent.change(box, { target: { value: later } });
    finish?.();
    rerender(<NoReplyCheckFields check={CHECK} saving={false} onSave={onSave} />);
    expect(screen.getByLabelText(/What counts as needing no reply/)).toHaveValue(later);
  });

  it('the refetch lands BEFORE the save callback: the default shows', () => {
    let finish: (() => void) | undefined;
    const onSave = vi.fn((_changed: unknown, onSaved?: () => void) => {
      finish = onSaved;
    });
    const { rerender } = render(
      <NoReplyCheckFields check={saved} saving={false} onSave={onSave} />
    );
    fireEvent.change(screen.getByLabelText(/What counts as needing no reply/), {
      target: { value: `${WORDING} Unsaved edit.` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset wording to default' }));
    rerender(<NoReplyCheckFields check={CHECK} saving={false} onSave={onSave} />);
    finish?.();
    rerender(<NoReplyCheckFields check={CHECK} saving={false} onSave={onSave} />);
    expect(screen.getByLabelText(/What counts as needing no reply/)).toHaveValue(WORDING);
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
