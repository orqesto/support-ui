import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// Typed so the mock's return isn't `any` — the repo lints tests too, and
// @typescript-eslint/no-unsafe-return rejects an untyped vi.fn() passthrough.
const composeReply =
  vi.fn<(...args: unknown[]) => Promise<{ data: { text: string | null; language?: string } }>>();
const translateText =
  vi.fn<(...args: unknown[]) => Promise<{ data: { translated: { content: string } } }>>();

vi.mock('@/services/message.service', () => ({
  messageService: {
    composeReply: (...args: unknown[]) => composeReply(...args),
    translateText: (...args: unknown[]) => translateText(...args),
  },
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const aiConfigured = { value: true };
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: aiConfigured.value, isLoading: false }),
}));

import { ComposerAiActions } from '@/components/messages/ComposerAiActions';

const setComposer = vi.fn();

const openPanel = (composer = '') => {
  const utils = render(
    <ComposerAiActions messageId={42} composer={composer} setComposer={setComposer} />
  );
  fireEvent.click(screen.getByTitle('Draft this reply with AI'));
  return utils;
};

describe('ComposerAiActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiConfigured.value = true;
    composeReply.mockResolvedValue({
      data: { text: 'Your parcel is at the border.', language: 'en' },
    });
  });
  afterEach(cleanup);

  describe('which action is offered (state-aware — never a mystery disabled button)', () => {
    it('empty composer → asks what the reply should say, offers only "Write reply"', () => {
      openPanel('');
      expect(screen.getByText('What should the reply say?')).toBeInTheDocument();
      expect(screen.getByText('Write reply')).toBeInTheDocument();
      expect(screen.queryByText('Make it customer-ready')).not.toBeInTheDocument();
    });

    it('composer with your text → offers to clean it up and shows what it will act on', () => {
      openPanel('<p>parcel stuck, we send new one</p>');
      expect(screen.getByText('Your text:')).toBeInTheDocument();
      expect(screen.getByText(/parcel stuck, we send new one/)).toBeInTheDocument();
      // The original bug: this button rendered but was disabled for reasons the
      // agent could not see, because it read a field outside the panel.
      expect(screen.getByText('Make it customer-ready').closest('button')).toBeEnabled();
    });

    it('a markup-only composer counts as empty', () => {
      openPanel('<p></p>');
      expect(screen.getByText('What should the reply say?')).toBeInTheDocument();
    });

    it('"write a new reply instead" switches views without discarding your text', () => {
      openPanel('<p>my rough note</p>');
      fireEvent.click(screen.getByText('Write a new reply instead →'));

      expect(screen.getByText('What should the reply say?')).toBeInTheDocument();
      expect(screen.getByText(/kept until you choose/i)).toBeInTheDocument();
      expect(setComposer).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('← Back to my text'));
      expect(screen.getByText('Your text:')).toBeInTheDocument();
    });
  });

  describe('request shape', () => {
    it('no instructions → generate', async () => {
      openPanel('');
      fireEvent.click(screen.getByText('Write reply'));
      await waitFor(() => expect(composeReply).toHaveBeenCalledWith(42, { mode: 'generate' }));
    });

    it('instructions typed → guided', async () => {
      openPanel('');
      fireEvent.change(screen.getByPlaceholderText(/leave empty and I'll answer/i), {
        target: { value: 'parcel is at the border' },
      });
      fireEvent.click(screen.getByText('Write reply'));
      await waitFor(() =>
        expect(composeReply).toHaveBeenCalledWith(42, {
          mode: 'guided',
          instructions: 'parcel is at the border',
        })
      );
    });

    it('cleaning up your own text → polish, sending the composer content', async () => {
      openPanel('<p>parcel stuck</p>');
      fireEvent.click(screen.getByText('Make it customer-ready'));
      await waitFor(() =>
        expect(composeReply).toHaveBeenCalledWith(42, {
          mode: 'polish',
          draft: '<p>parcel stuck</p>',
        })
      );
    });
  });

  describe('preview before anything is replaced', () => {
    it('shows the draft and does NOT touch the composer until accepted', async () => {
      openPanel('');
      fireEvent.click(screen.getByText('Write reply'));

      expect(await screen.findByText('Use it')).toBeInTheDocument();
      expect(screen.getByText('Your parcel is at the border.')).toBeInTheDocument();
      expect(setComposer).not.toHaveBeenCalled();
    });

    it('"Use it" writes the draft into the composer as HTML', async () => {
      openPanel('');
      fireEvent.click(screen.getByText('Write reply'));
      fireEvent.click(await screen.findByText('Use it'));

      expect(setComposer).toHaveBeenCalledTimes(1);
      expect(setComposer.mock.calls[0][0]).toContain('Your parcel is at the border.');
    });

    it('"Discard" leaves the composer alone and returns to the input', async () => {
      openPanel('');
      fireEvent.click(screen.getByText('Write reply'));
      fireEvent.click(await screen.findByText('Discard'));

      expect(setComposer).not.toHaveBeenCalled();
      expect(screen.getByText('What should the reply say?')).toBeInTheDocument();
    });

    it('"Try again" re-runs the same action', async () => {
      openPanel('<p>rough</p>');
      fireEvent.click(screen.getByText('Make it customer-ready'));
      fireEvent.click(await screen.findByText('Try again'));

      await waitFor(() => expect(composeReply).toHaveBeenCalledTimes(2));
      expect(composeReply.mock.calls[1][1]).toMatchObject({ mode: 'polish' });
    });

    it('offers undo after accepting, restoring the exact previous text', async () => {
      openPanel('<p>my rough note</p>');
      fireEvent.click(screen.getByText('Make it customer-ready'));
      fireEvent.click(await screen.findByText('Use it'));

      fireEvent.click(await screen.findByTitle('Restore what you had written'));
      expect(setComposer).toHaveBeenLastCalledWith('<p>my rough note</p>');
    });
  });

  describe('reading a draft written in the customer language', () => {
    it('offers a translation when the draft is not in the agent language', async () => {
      composeReply.mockResolvedValue({ data: { text: 'Ihr Paket ist im Zoll.', language: 'de' } });
      translateText.mockResolvedValue({
        data: { translated: { content: 'Your parcel is at customs.' } },
      });

      openPanel('');
      fireEvent.click(screen.getByText('Write reply'));

      expect(await screen.findByText(/DE \(customer's language\)/)).toBeInTheDocument();
      fireEvent.click(screen.getByText('Show in English'));

      expect(await screen.findByText('Your parcel is at customs.')).toBeInTheDocument();
      expect(translateText).toHaveBeenCalledWith('Ihr Paket ist im Zoll.', 'en');
      // The original stays authoritative — the translation is only for checking.
      expect(screen.getByText(/version is what/i)).toBeInTheDocument();
    });

    it('does not offer a translation when the draft is already in the agent language', async () => {
      openPanel('');
      fireEvent.click(screen.getByText('Write reply'));
      await screen.findByText('Use it');
      expect(screen.queryByText('Show in English')).not.toBeInTheDocument();
    });
  });

  describe('failures never destroy the agent text', () => {
    it('request error → message shown, composer untouched', async () => {
      composeReply.mockRejectedValue(new Error('boom'));
      openPanel('<p>my rough note</p>');
      fireEvent.click(screen.getByText('Make it customer-ready'));

      expect(await screen.findByText(/text is unchanged/i)).toBeInTheDocument();
      expect(setComposer).not.toHaveBeenCalled();
    });

    it('429 is reported as a limit, not a generic failure', async () => {
      composeReply.mockRejectedValue({ response: { status: 429 } });
      openPanel('<p>note</p>');
      fireEvent.click(screen.getByText('Make it customer-ready'));
      expect(await screen.findByText(/AI limit reached/i)).toBeInTheDocument();
    });

    it('403 names the missing provider', async () => {
      composeReply.mockRejectedValue({ response: { status: 403 } });
      openPanel('<p>note</p>');
      fireEvent.click(screen.getByText('Make it customer-ready'));
      expect(await screen.findByText(/No AI provider is connected/i)).toBeInTheDocument();
    });

    it('an empty result explains itself instead of blanking the composer', async () => {
      composeReply.mockResolvedValue({ data: { text: null } });
      openPanel('');
      fireEvent.click(screen.getByText('Write reply'));

      expect(await screen.findByText(/Nothing could be drafted/i)).toBeInTheDocument();
      expect(setComposer).not.toHaveBeenCalled();
    });

    it('renders nothing when the workspace has no AI provider', () => {
      aiConfigured.value = false;
      render(<ComposerAiActions messageId={42} composer="" setComposer={setComposer} />);
      expect(screen.queryByTitle('Draft this reply with AI')).not.toBeInTheDocument();
    });
  });
});
