import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * With AI drafts off the backend answers the suggested-answer call with search results and
 * `reason: 'ai-drafts-off'` — and no `aiConfigured`, since a provider is not the question. The
 * dialog must say drafts are off and still show the matches; "connect a provider" would send an
 * admin to fix something that is not broken.
 */

const getSuggestedAnswer = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getSuggestedAnswer: (...args: unknown[]) => getSuggestedAnswer(...args) },
}));
vi.mock('@/hooks/useTranslation', () => ({
  useSupportedLanguages: () => ({ languages: [], fetchLanguages: () => Promise.resolve() }),
}));
// The AI card's language picker needs the app's ThemeProvider; it plays no part in these tests.
vi.mock('@/components/ui/Select', () => ({ Select: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { SimilarMessagesDialog } from '../SimilarMessagesDialog';

const MATCH = 'You can reset your password from the login page.';

const respond = (extra: Record<string, unknown>) =>
  getSuggestedAnswer.mockResolvedValue({
    success: true,
    data: {
      mode: 'search-results',
      sources: [
        {
          type: 'knowledge_base',
          id: 7,
          title: 'Password reset',
          content: 'How do I reset my password?',
          answer: MATCH,
          similarity: 0.9,
        },
      ],
      searchPerformed: { documentation: true, tickets: true, messages: true },
      ...extra,
    },
  });

const renderDialog = () =>
  render(
    <MemoryRouter>
      <SimilarMessagesDialog messageId={3} open onClose={() => {}} onSelectAnswer={() => {}} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SimilarMessagesDialog — AI drafts off', () => {
  it('says drafts are off, not "connect a provider", and still shows the matches', async () => {
    respond({ reason: 'ai-drafts-off' });
    renderDialog();
    expect(
      await screen.findByText(/AI drafts are switched off for this workspace/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/need a provider/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No reply was drafted for this message\./i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/reset your password/i).length).toBeGreaterThan(0);
  });

  it('an empty knowledge base still reads as a content gap (control)', async () => {
    respond({ reason: 'no-sources' });
    renderDialog();
    expect(await screen.findByText(/Nothing in the knowledge base matched/i)).toBeInTheDocument();
    expect(screen.queryByText(/AI drafts are switched off/i)).not.toBeInTheDocument();
  });
});

/*
  Every reason the backend can send (BE NoSuggestionReason, suggestedAnswerService.ts) has its own
  line — none falls back to the generic "No reply was drafted". 'no-ai-provider' is the exception:
  it arrives with aiConfigured: false and shows the connect-a-provider banner instead.
*/
describe('SimilarMessagesDialog — every no-draft reason has its own text', () => {
  it('a draft rejected as poorly grounded says the KB did not cover it, not "no reply was drafted"', async () => {
    respond({ reason: 'poorly-grounded' });
    renderDialog();
    expect(
      await screen.findByText(
        /knowledge base didn't cover this well enough to write a reliable reply/i
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/No reply was drafted for this message\./i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/reset your password/i).length).toBeGreaterThan(0);
  });

  it.each([
    'no-sources',
    'sources-unusable',
    'generation-empty',
    'generation-failed',
    'poorly-grounded',
    'search-failed',
    'ai-drafts-off',
  ])('reason %s shows a specific line, not the generic fallback', async (reason) => {
    respond({ reason });
    renderDialog();
    await screen.findAllByText(/reset your password/i);
    expect(screen.queryByText(/No reply was drafted for this message\./i)).not.toBeInTheDocument();
  });

  it('CONTROL: an unknown reason still falls back to the generic line', async () => {
    respond({ reason: 'some-future-reason' });
    renderDialog();
    expect(await screen.findByText(/No reply was drafted for this message\./i)).toBeInTheDocument();
  });

  it('no-ai-provider (aiConfigured false) shows the provider banner', async () => {
    respond({ reason: 'no-ai-provider', aiConfigured: false });
    renderDialog();
    expect(await screen.findByText(/need a provider/i)).toBeInTheDocument();
    expect(screen.queryByText(/No reply was drafted for this message\./i)).not.toBeInTheDocument();
  });
});

describe('SimilarMessagesDialog — read-only without an answer handler', () => {
  it('no onSelectAnswer (no reply to put it in): the matches show, no "use" button', async () => {
    respond({ reason: 'no-sources' });
    render(
      <MemoryRouter>
        <SimilarMessagesDialog messageId={3} open onClose={() => {}} />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Nothing in the knowledge base matched/i)).toBeInTheDocument();
    expect(screen.getAllByText(/reset your password/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Use |Insert source text/i })).toBeNull();
    // The footer's button closes (the dialog's X is the other "Close"); there is nothing to cancel.
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('with onSelectAnswer but no AI reply, there is still nothing to use: matches are reference only', async () => {
    respond({ reason: 'no-sources' });
    renderDialog();
    expect(await screen.findByText(/Nothing in the knowledge base matched/i)).toBeInTheDocument();
    expect(screen.getAllByText(/reset your password/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Use |Insert source text/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
  });
});

/*
  Audit pass 10: read-only used to hide only the two "use" buttons and still offer every card as
  a choice — role=button, a tab stop, a ring and a "Selected" badge on click, the raw-source
  "read it before sending" caution, and a lone "Cancel". Nothing is sent from here, so nothing is
  choosable.
*/
describe('SimilarMessagesDialog — read-only offers nothing to choose', () => {
  const RAW = 'INTERNAL — hand to legal, never answer this yourself.';
  const respondAi = () =>
    getSuggestedAnswer.mockResolvedValue({
      success: true,
      data: {
        mode: 'ai-generated',
        aiResponse: { text: 'Here is how to reset it.', confidence: 0.8 },
        sources: [
          {
            type: 'documentation',
            id: 9,
            title: 'Internal runbook',
            content: RAW,
            similarity: 0.9,
          },
        ],
        searchPerformed: { documentation: true, tickets: true, messages: true },
      },
    });
  const renderWith = (onSelectAnswer?: () => void) =>
    render(
      <MemoryRouter>
        <SimilarMessagesDialog
          messageId={3}
          open
          onClose={() => {}}
          onSelectAnswer={onSelectAnswer}
        />
      </MemoryRouter>
    );
  const card = (title: string) =>
    screen.getByRole('heading', { name: title }).closest('.rounded-lg') as HTMLElement;
  // The dialog's own X is also named "Close"; read-only adds the footer's as a second one.
  const closeButtons = () => screen.getAllByRole('button', { name: 'Close' }).length;

  it('no handler: the AI card and source cards are plain content — no button, no tab stop', async () => {
    respondAi();
    renderWith();
    await screen.findByRole('heading', { name: 'Internal runbook' });
    for (const el of [card('AI-Generated Response'), card('Internal runbook')]) {
      expect(el.closest('[role="button"]')).toBeNull();
      // No TAB STOP: the Dialog container itself carries tabindex="-1" (the modal layer focuses
      // it on open), which is not reachable by Tab and not the card's.
      expect(el.closest('[tabindex]:not([tabindex="-1"])')).toBeNull();
      expect(el.className).not.toMatch(/cursor-pointer/);
    }
    expect(screen.getByText('Sources:')).toBeInTheDocument();
    expect(screen.queryByText(/choose from sources/i)).toBeNull();
  });

  it('no handler: clicking a raw source shows no "Selected", no ring, no send caution; footer says Close', async () => {
    respondAi();
    renderWith();
    await screen.findByRole('heading', { name: 'Internal runbook' });
    fireEvent.click(card('Internal runbook'));
    fireEvent.click(card('AI-Generated Response'));
    expect(screen.queryByText('Selected')).toBeNull();
    expect(card('Internal runbook').className).not.toMatch(/ring-2/);
    expect(screen.queryByText(/read it before sending/i)).toBeNull();
    expect(closeButtons()).toBe(2);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it.each(['Internal runbook', 'AI-Generated Response'])(
    'the handler goes away while open (the thread went inactive): choosing "%s" stops showing as a choice',
    async (chosen) => {
      respondAi();
      const view = renderWith(() => {});
      await screen.findByRole('heading', { name: 'Internal runbook' });
      fireEvent.click(card(chosen));
      expect(screen.getByText('Selected')).toBeInTheDocument();
      view.rerender(
        <MemoryRouter>
          <SimilarMessagesDialog messageId={3} open onClose={() => {}} />
        </MemoryRouter>
      );
      expect(screen.queryByText('Selected')).toBeNull();
      expect(card(chosen).className).not.toMatch(/ring-2/);
      expect(screen.queryByText(/read it before sending/i)).toBeNull();
      expect(closeButtons()).toBe(2);
    }
  );

  it('CONTROL: with a handler only the AI card is the choice; the source stays plain reference', async () => {
    respondAi();
    renderWith(() => {});
    await screen.findByRole('heading', { name: 'Internal runbook' });
    const source = card('Internal runbook');
    expect(source.closest('[role="button"]')).toBeNull();
    expect(source.closest('[tabindex]:not([tabindex="-1"])')).toBeNull();
    expect(screen.getByText('Sources (for reference, not for sending):')).toBeInTheDocument();
    fireEvent.click(source);
    expect(source.className).not.toMatch(/ring-2/);
    expect(card('AI-Generated Response').className).toMatch(/ring-2/);
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use AI Response' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use This Answer|Insert source text/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(closeButtons()).toBe(1);
  });
});
