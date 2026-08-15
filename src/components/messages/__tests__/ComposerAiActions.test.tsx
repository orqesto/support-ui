import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// Typed so the mock's return isn't `any` — the repo lints tests too, and
// @typescript-eslint/no-unsafe-return rejects an untyped vi.fn() passthrough.
const composeReply = vi.fn<(...args: unknown[]) => Promise<{ data: { text: string | null } }>>();
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

import { ComposerAiActions } from '@/components/messages/ComposerAiActions';

const setComposer = vi.fn();

const renderPanel = (composer = '') => {
  const utils = render(
    <ComposerAiActions messageId={42} composer={composer} setComposer={setComposer} />
  );
  // Open the panel — everything lives behind the AI button.
  fireEvent.click(screen.getByTitle('Draft this reply with AI'));
  return utils;
};

const instructionsBox = () => screen.getByPlaceholderText(/what should the reply say/i);

describe('ComposerAiActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiConfigured.value = true;
    composeReply.mockResolvedValue({ data: { text: 'Your parcel is at the border.' } });
  });
  afterEach(cleanup);

  it('sends mode=generate when no instructions were typed', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Write reply'));

    await waitFor(() => expect(composeReply).toHaveBeenCalled());
    expect(composeReply).toHaveBeenCalledWith(42, { mode: 'generate' });
  });

  it('switches to mode=guided once the agent types what it should say', async () => {
    renderPanel();
    fireEvent.change(instructionsBox(), { target: { value: 'parcel is at the border' } });

    // The button relabels so it is obvious the comments will be used.
    fireEvent.click(screen.getByText('Write reply with these points'));

    await waitFor(() => expect(composeReply).toHaveBeenCalled());
    expect(composeReply).toHaveBeenCalledWith(42, {
      mode: 'guided',
      instructions: 'parcel is at the border',
    });
  });

  it('sends the current draft as mode=polish', async () => {
    renderPanel('<p>parcel stuck, we send new one</p>');
    fireEvent.click(screen.getByText('Make it customer-ready'));

    await waitFor(() => expect(composeReply).toHaveBeenCalled());
    expect(composeReply).toHaveBeenCalledWith(42, {
      mode: 'polish',
      draft: '<p>parcel stuck, we send new one</p>',
    });
  });

  it('disables "make it customer-ready" when there is nothing to rewrite', () => {
    renderPanel('');
    expect(screen.getByText('Make it customer-ready').closest('button')).toBeDisabled();
  });

  it('treats a markup-only composer as empty', () => {
    renderPanel('<p></p>');
    expect(screen.getByText('Make it customer-ready').closest('button')).toBeDisabled();
  });

  it('writes the generated text into the composer as HTML', async () => {
    renderPanel();
    fireEvent.click(screen.getByText('Write reply'));

    await waitFor(() => expect(setComposer).toHaveBeenCalled());
    expect(setComposer.mock.calls[0][0]).toContain('Your parcel is at the border.');
  });

  it('offers undo after applying, and restores the exact previous text', async () => {
    renderPanel('<p>my rough note</p>');
    fireEvent.click(screen.getByText('Make it customer-ready'));

    await waitFor(() => expect(setComposer).toHaveBeenCalled());
    // Panel closes on success; the toolbar undo appears.
    const undo = await screen.findByTitle('Restore what you had written');
    fireEvent.click(undo);

    expect(setComposer).toHaveBeenLastCalledWith('<p>my rough note</p>');
  });

  it('never touches the composer when the request fails', async () => {
    composeReply.mockRejectedValue(new Error('boom'));
    renderPanel('<p>my rough note</p>');
    fireEvent.click(screen.getByText('Make it customer-ready'));

    expect(await screen.findByText(/text is unchanged/i)).toBeInTheDocument();
    expect(setComposer).not.toHaveBeenCalled();
  });

  it('reports a rate-limit distinctly so the agent knows to retry', async () => {
    composeReply.mockRejectedValue({ response: { status: 429 } });
    renderPanel('<p>note</p>');
    fireEvent.click(screen.getByText('Make it customer-ready'));

    expect(await screen.findByText(/AI limit reached/i)).toBeInTheDocument();
    expect(setComposer).not.toHaveBeenCalled();
  });

  it('renders nothing when the workspace has no AI provider connected', () => {
    // The endpoint 403s in that state; showing a button that can only fail is worse
    // than showing none. Verified end-to-end in tests/integration/compose-reply.
    aiConfigured.value = false;
    render(<ComposerAiActions messageId={42} composer="" setComposer={setComposer} />);
    expect(screen.queryByTitle('Draft this reply with AI')).not.toBeInTheDocument();
  });

  it('names the missing provider on a 403 rather than saying "unavailable"', async () => {
    composeReply.mockRejectedValue({ response: { status: 403 } });
    renderPanel('<p>note</p>');
    fireEvent.click(screen.getByText('Make it customer-ready'));

    expect(await screen.findByText(/No AI provider is connected/i)).toBeInTheDocument();
    expect(setComposer).not.toHaveBeenCalled();
  });

  it('explains an empty result instead of blanking the composer', async () => {
    composeReply.mockResolvedValue({ data: { text: null } });
    renderPanel();
    fireEvent.click(screen.getByText('Write reply'));

    expect(await screen.findByText(/No answer could be drafted/i)).toBeInTheDocument();
    expect(setComposer).not.toHaveBeenCalled();
  });
});
