/**
 * Platform Defaults → AI drafts → "No reply needed" (`ai.no_reply_check`, owner 2026-11-18): the two
 * limits and the AI wording are console settings. Only changed, valid fields are sent.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NoReplyCheckFields } from '../NoReplyCheckFields';
import { normalizeDrafts } from '@/services/platformSettings.service';
import type { NoReplyCheckSettings } from '@/services/noReplyCheck.settings';

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
