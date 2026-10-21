import { StrictMode, useState } from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

// Typed so the mock's return isn't `any` — the repo lints tests too, and
// @typescript-eslint/no-unsafe-return rejects an untyped vi.fn() passthrough.
const composeReply = vi.fn<
  (...args: unknown[]) => Promise<{
    data: {
      text: string | null;
      language?: string;
      groundedInKb?: boolean;
      envelope?: unknown;
    };
  }>
>();

vi.mock('@/services/message.service', () => ({
  messageService: {
    composeReply: (...args: unknown[]) => composeReply(...args),
  },
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const aiConfigured = { value: true };
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: aiConfigured.value, isLoading: false }),
}));

const aiDrafts = { off: false };
const refreshAiDrafts = vi.fn();
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true }),
  useRefreshAiDrafts: () => refreshAiDrafts,
}));

import { ComposerAiActions, MAX_INSTRUCTIONS } from '@/components/messages/ComposerAiActions';
import { apiError } from '@/test/apiError';

const onApplied =
  vi.fn<
    (source: string | null, draft?: { text: string; mode?: string; language?: string }) => void
  >();
const onBusyChange = vi.fn<(busy: boolean) => void>();

/** The composer as the host holds it — state, so a draft, an undo and a retry all chain. */
let composerNow = '';
let setComposerFromTest: (html: string) => void = () => undefined;
const Host = ({ initial }: { initial: string }) => {
  const [composer, setComposer] = useState(initial);
  composerNow = composer;
  setComposerFromTest = setComposer;
  return (
    <ComposerAiActions
      messageId={42}
      composer={composer}
      setComposer={setComposer}
      onApplied={onApplied}
      onBusyChange={onBusyChange}
    />
  );
};

const draftButton = () => screen.getByRole('button', { name: /AI draft|Drafting/ });
const pressDraft = () => fireEvent.click(draftButton());
const lastRequest = () => composeReply.mock.calls.at(-1)?.[1];

/** A response the test releases by hand — for what happens while one is in flight. */
const deferred = () => {
  let resolve: (value: { data: { text: string; language?: string } }) => void = () => undefined;
  const promise = new Promise<{ data: { text: string; language?: string } }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('ComposerAiActions — the editor is the only input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiConfigured.value = true;
    aiDrafts.off = false;
    composeReply.mockResolvedValue({
      data: { text: 'Your parcel is at the border.', language: 'en' },
    });
  });
  afterEach(cleanup);

  describe('what the editor text means', () => {
    it('empty editor → a reply from the knowledge base (generate), nothing else sent', async () => {
      render(<Host initial="<p></p>" />);
      pressDraft();
      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(1));
      expect(composeReply).toHaveBeenCalledWith(42, { mode: 'generate' });
    });

    it('text in the editor → that text is the note (guided), as plain text', async () => {
      render(
        <Host initial="<p>Refund sent <strong>today</strong>.</p><p>Arrives in 3 days.</p>" />
      );
      pressDraft();
      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(1));
      const request = lastRequest() as { mode: string; instructions: string };
      expect(request.mode).toBe('guided');
      expect(request.instructions).toContain('Refund sent');
      expect(request.instructions).toContain('Arrives in 3 days.');
      expect(request.instructions).not.toMatch(/<[a-z]/i);
    });

    it('🔴 an editor whose only "text" is empty markup asks the knowledge base — never an empty note', async () => {
      render(<Host initial="<p></p><div> &nbsp; </div>" />);
      pressDraft();
      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(1));
      expect(composeReply).toHaveBeenCalledWith(42, { mode: 'generate' });
    });

    it('🔴 a link in the note keeps its URL — "see the guide" alone says nothing', async () => {
      render(<Host initial='<p>See <a href="https://help.example/guide">the guide</a>.</p>' />);
      pressDraft();
      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(1));
      expect(composeReply).toHaveBeenCalledWith(42, {
        mode: 'guided',
        instructions: 'See the guide (https://help.example/guide).',
      });
    });

    it('text with no paragraph markup at all is still read (never an empty note)', async () => {
      render(<Host initial="refund issued today" />);
      pressDraft();
      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(1));
      expect(composeReply).toHaveBeenCalledWith(42, {
        mode: 'guided',
        instructions: 'refund issued today',
      });
    });

    it('a reply template (placeholders) → adapted as a draft (polish), HTML and tokens intact', async () => {
      const template = '<p>Hi {first_name|there}, your ticket {{ticket_id}} is closed.</p>';
      render(<Host initial={template} />);
      pressDraft();
      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(1));
      expect(composeReply).toHaveBeenCalledWith(42, { mode: 'polish', draft: template });
    });

    it('CONTROL: braces that are not a placeholder are an ordinary note', async () => {
      render(<Host initial="<p>Use code {SPRING} at checkout</p>" />);
      pressDraft();
      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(1));
      expect((lastRequest() as { mode: string }).mode).toBe('guided');
    });

    it('⛔ text longer than a note is a reply the agent wrote → polish, never cut as a note', async () => {
      const long = `<p>${'x'.repeat(MAX_INSTRUCTIONS + 1)}</p>`;
      render(<Host initial={long} />);
      pressDraft();
      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(1));
      expect(composeReply).toHaveBeenCalledWith(42, { mode: 'polish', draft: long });
    });

    it('CONTROL: a note exactly at the cap is still a note', async () => {
      render(<Host initial={`<p>${'x'.repeat(MAX_INSTRUCTIONS)}</p>`} />);
      pressDraft();
      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(1));
      expect((lastRequest() as { mode: string }).mode).toBe('guided');
    });

    it('over the polish limit too: refused with a message, nothing sent, text untouched', () => {
      const huge = `<p>${'x'.repeat(8001)}</p>`;
      render(<Host initial={huge} />);
      pressDraft();
      expect(composeReply).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toMatch(/Too long for AI draft/);
      expect(composerNow).toBe(huge);
    });
  });

  describe('the draft lands in the editor', () => {
    it('replaces the editor content as editor HTML and reports its source', async () => {
      render(<Host initial="<p>refund ok</p>" />);
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('Your parcel is at the border.'));
      expect(composerNow).toMatch(/^<p>/);
      expect(onApplied).toHaveBeenCalledWith('ai_compose_guided', {
        text: composerNow,
        mode: 'guided',
        language: 'en',
      });
      expect(screen.getByTestId('ai-draft-status').textContent).toContain('EN');
    });

    it('while drafting: the button says so, is disabled, and the host is told (lock the editor)', async () => {
      const pending = deferred();
      composeReply.mockReturnValueOnce(pending.promise);
      render(<Host initial="" />);
      pressDraft();
      expect(draftButton().textContent).toContain('Drafting');
      expect((draftButton() as HTMLButtonElement).disabled).toBe(true);
      expect(onBusyChange).toHaveBeenLastCalledWith(true);
      await act(async () => {
        pending.resolve({ data: { text: 'Done.' } });
        await pending.promise;
      });
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
      expect(draftButton().textContent).toContain('AI draft');
    });

    it('Undo puts the agent’s own text back and un-stamps the reply', async () => {
      render(<Host initial="<p>refund ok</p>" />);
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('border'));
      fireEvent.click(screen.getByTitle('Restore what you had written'));
      expect(composerNow).toBe('<p>refund ok</p>');
      expect(onApplied).toHaveBeenLastCalledWith(null);
      expect(screen.queryByTestId('ai-draft-status')).toBeNull();
    });

    it('Try again re-asks with the ORIGINAL note (not the draft now in the editor); Undo still restores it', async () => {
      render(<Host initial="<p>refund ok</p>" />);
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('border'));
      composeReply.mockResolvedValueOnce({ data: { text: 'Second version.', language: 'en' } });
      fireEvent.click(screen.getByTitle('Write another version from the same text'));
      await waitFor(() => expect(composerNow).toContain('Second version.'));
      expect(composeReply).toHaveBeenLastCalledWith(42, {
        mode: 'guided',
        instructions: 'refund ok',
      });
      fireEvent.click(screen.getByTitle('Restore what you had written'));
      expect(composerNow).toBe('<p>refund ok</p>');
    });

    it('AI draft pressed again over a draft: Undo still reaches the agent’s OWN text', async () => {
      render(<Host initial="<p>refund ok</p>" />);
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('border'));
      composeReply.mockResolvedValueOnce({ data: { text: 'Second.', language: 'en' } });
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('Second.'));
      fireEvent.click(screen.getByTitle('Restore what you had written'));
      expect(composerNow).toBe('<p>refund ok</p>');
    });

    it('the language badge holds only while the draft is as it landed (Translate changes it)', async () => {
      render(<Host initial="" />);
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('border'));
      expect(screen.getByTestId('ai-draft-status').textContent).toContain('EN');
      act(() => setComposerFromTest('<p>Ihr Paket ist an der Grenze.</p>'));
      expect(screen.getByTestId('ai-draft-status').textContent).not.toContain('EN');
    });

    it('🔴 a draft with a link goes in as EDITOR HTML: the record and the badge match it', async () => {
      composeReply.mockResolvedValue({
        data: { text: 'See the guide: https://help.example/guide\n\n- one\n- two', language: 'en' },
      });
      render(<Host initial="" />);
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('help.example/guide'));
      // What the editor itself would hold: the link's attributes, <p> inside each <li>.
      expect(composerNow).toContain('target="_blank"');
      expect(composerNow).toContain('<li><p>one</p></li>');
      // reply_style gets exactly what the composer holds, so an untouched draft is no "edit".
      expect(onApplied).toHaveBeenLastCalledWith('ai_compose_generate', {
        text: composerNow,
        mode: 'generate',
        language: 'en',
      });
      expect(screen.getByTestId('ai-draft-status').textContent).toContain('EN');
    });

    it('Try again on a knowledge-base draft stays generate — the draft is not read as a note', async () => {
      render(<Host initial="" />);
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('border'));
      fireEvent.click(screen.getByTitle('Write another version from the same text'));
      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(2));
      expect(composeReply).toHaveBeenLastCalledWith(42, { mode: 'generate' });
    });

    it('⛔ the reply changed while drafting (a template, a lookup record): not overwritten', async () => {
      const pending = deferred();
      composeReply.mockReturnValueOnce(pending.promise);
      render(<Host initial="<p>refund ok</p>" />);
      pressDraft();
      act(() => setComposerFromTest('<p>refund ok</p><p>Order 1001.</p>'));
      await act(async () => {
        pending.resolve({ data: { text: 'Drafted.' } });
        await pending.promise;
      });
      expect(composerNow).toBe('<p>refund ok</p><p>Order 1001.</p>');
      expect(screen.getByRole('alert').textContent).toMatch(/changed while drafting/);
      expect(onApplied).not.toHaveBeenCalled();
    });

    it('⛔ a response for a thread the agent already left never lands', async () => {
      const pending = deferred();
      composeReply.mockReturnValueOnce(pending.promise);
      const setComposer = vi.fn<(html: string) => void>();
      const { unmount } = render(
        <ComposerAiActions messageId={42} composer="" setComposer={setComposer} />
      );
      pressDraft();
      unmount();
      await act(async () => {
        pending.resolve({ data: { text: 'For the other customer.' } });
        await pending.promise;
      });
      expect(setComposer).not.toHaveBeenCalled();
    });
  });

  describe('failures never touch the agent’s text', () => {
    it('no inbound message (409) on a note: falls back to making the text sendable (polish)', async () => {
      composeReply
        .mockRejectedValueOnce(
          await apiError(409, { error: 'This conversation has no customer message to answer' })
        )
        .mockResolvedValueOnce({ data: { text: 'Polished.', language: 'en' } });
      render(<Host initial="<p>refund ok</p>" />);
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('Polished.'));
      expect(composeReply).toHaveBeenLastCalledWith(42, {
        mode: 'polish',
        draft: '<p>refund ok</p>',
      });
      expect(onApplied).toHaveBeenCalledWith('ai_compose_polish', expect.anything());
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('no inbound message (409) on an empty editor: the backend sentence plus the way out', async () => {
      composeReply.mockRejectedValue(
        await apiError(409, { error: 'This conversation has no customer message to answer' })
      );
      render(<Host initial="" />);
      pressDraft();
      const alert = await screen.findByRole('alert');
      // Two sentences, not one run-on: the backend's has no full stop of its own.
      expect(alert.textContent).toContain(
        'no customer message to answer. Write the reply yourself'
      );
    });

    it('a backend sentence that already ends in "…" gets no second full stop', async () => {
      composeReply.mockRejectedValue(await apiError(409, { error: 'Nothing to answer here…' }));
      render(<Host initial="" />);
      pressDraft();
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Nothing to answer here… Write the reply yourself in the editor, then press AI draft.'
      );
    });

    it('429: the limit line; the text is unchanged', async () => {
      composeReply.mockRejectedValue(await apiError(429, { error: 'Rate limit exceeded' }));
      render(<Host initial="<p>mine</p>" />);
      pressDraft();
      expect((await screen.findByRole('alert')).textContent).toMatch(/AI limit reached/);
      expect(composerNow).toBe('<p>mine</p>');
    });

    it('a 5xx reads as unavailable, never a stack trace', async () => {
      composeReply.mockRejectedValue(await apiError(500, { error: 'at db.select (x.ts:1)' }));
      render(<Host initial="" />);
      pressDraft();
      expect((await screen.findByRole('alert')).textContent).toMatch(/unavailable/);
    });

    it('drafts switched off mid-session (409 AI_DRAFTS_OFF): re-reads the setting', async () => {
      composeReply.mockRejectedValue(
        await apiError(409, { code: 'AI_DRAFTS_OFF', error: 'AI drafts are switched off.' })
      );
      render(<Host initial="" />);
      pressDraft();
      await screen.findByRole('alert');
      expect(refreshAiDrafts).toHaveBeenCalled();
    });

    it('an empty response says so and leaves the editor alone', async () => {
      composeReply.mockResolvedValue({ data: { text: null } });
      render(<Host initial="<p>mine</p>" />);
      pressDraft();
      expect((await screen.findByRole('alert')).textContent).toMatch(/Nothing could be drafted/);
      expect(composerNow).toBe('<p>mine</p>');
    });
  });

  describe('says when the email was not written to the team', () => {
    it.each([
      [{ position: 'cc', senderIsColleague: false }, /only on Cc/],
      [{ position: 'not_listed', senderIsColleague: false }, /isn't among the recipients/],
      [{ position: 'cc', senderIsColleague: true }, /A colleague wrote this to the customer/],
    ])('%o → explains the draft', async (envelope, expected) => {
      composeReply.mockResolvedValue({ data: { text: 'Noted, thank you.', envelope } });
      render(<Host initial="" />);
      pressDraft();
      expect(await screen.findByText(expected)).toBeTruthy();
    });

    it('a KB-free generate draft for Cc mail does not ask the agent to "add the answer"', async () => {
      composeReply.mockResolvedValue({
        data: { text: 'Noted.', groundedInKb: false, envelope: { position: 'cc' } },
      });
      render(<Host initial="" />);
      pressDraft();
      expect(await screen.findByText(/only on Cc/)).toBeTruthy();
      expect(screen.queryByText(/acknowledges the question without answering/)).toBeNull();
    });

    it('CONTROL: a guided draft for Cc mail keeps "check the facts"', async () => {
      composeReply.mockResolvedValue({
        data: { text: 'Noted.', groundedInKb: false, envelope: { position: 'cc' } },
      });
      render(<Host initial="<p>we are on copy</p>" />);
      pressDraft();
      expect(await screen.findByText(/Written from what you said/)).toBeTruthy();
    });

    it.each([
      ['addressed to the team', { position: 'to', senderIsColleague: false }],
      ['an older backend (no envelope)', undefined],
      ['a malformed envelope', { position: 'bcc' }],
    ])('CONTROL: %s → no hint', async (_name, envelope) => {
      composeReply.mockResolvedValue({ data: { text: 'Answer.', envelope } });
      render(<Host initial="" />);
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('Answer.'));
      expect(screen.queryByTestId('ai-draft-envelope-hint')).toBeNull();
    });
  });

  describe('says when a draft is not backed by the knowledge base', () => {
    it('guided: written from what you said — check the facts', async () => {
      composeReply.mockResolvedValue({ data: { text: 'Refund sent.', groundedInKb: false } });
      render(<Host initial="<p>refund sent</p>" />);
      pressDraft();
      expect(await screen.findByText(/Written from what you said/)).toBeTruthy();
    });

    it('generate: acknowledges without answering — add the answer', async () => {
      composeReply.mockResolvedValue({ data: { text: 'We got it.', groundedInKb: false } });
      render(<Host initial="" />);
      pressDraft();
      expect(await screen.findByText(/acknowledges the question without answering/)).toBeTruthy();
    });

    it('CONTROL: a grounded draft carries no warning', async () => {
      composeReply.mockResolvedValue({ data: { text: 'Answer.', groundedInKb: true } });
      render(<Host initial="" />);
      pressDraft();
      await waitFor(() => expect(composerNow).toContain('Answer.'));
      expect(screen.queryByText(/knowledge base/)).toBeNull();
    });
  });

  describe('AI drafts off / no provider', () => {
    it('drafts off: the notice instead of the button', () => {
      aiDrafts.off = true;
      render(<Host initial="" />);
      expect(screen.getByTestId('ai-drafts-off-note')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /AI draft/ })).toBeNull();
    });

    it('no provider: nothing rendered', () => {
      aiConfigured.value = false;
      const { container } = render(<Host initial="" />);
      expect(container.innerHTML).toBe('');
    });
  });
});

/**
 * 🔴 Found recording a demo (2026-10-15): on the Vite dev server the AI draft button stayed on
 * "Drafting…" although the API returned the draft. StrictMode mounts, cleans up and mounts again;
 * the "still mounted" ref was set false by the cleanup and never back, so the response was
 * dropped as if the agent had left the thread. Production does not double-mount.
 */
describe('ComposerAiActions — under StrictMode (the dev server)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiConfigured.value = true;
    aiDrafts.off = false;
    composeReply.mockResolvedValue({
      data: { text: 'Your parcel is at the border.', language: 'en' },
    });
  });
  afterEach(cleanup);

  it('🔴 the draft lands and the button comes back from "Drafting…"', async () => {
    render(
      <StrictMode>
        <Host initial="<p></p>" />
      </StrictMode>
    );
    pressDraft();
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(composerNow).toContain('Your parcel is at the border.');
    await waitFor(() => expect(draftButton().textContent).toContain('AI draft'));
  });

  it('control: a response that lands after unmount is still dropped', async () => {
    const pending = deferred();
    composeReply.mockReturnValue(pending.promise);
    const { unmount } = render(
      <StrictMode>
        <Host initial="<p></p>" />
      </StrictMode>
    );
    pressDraft();
    await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      pending.resolve({ data: { text: 'Late answer for another thread.' } });
      await Promise.resolve();
    });
    expect(onApplied).not.toHaveBeenCalled();
  });
});
