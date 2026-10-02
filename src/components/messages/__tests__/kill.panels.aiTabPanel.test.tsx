import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AiTabPanel } from '../AiTabPanel';
import type { Message } from '@/types';

/**
 * AiTabPanel: the analysis facets appear only for the fields the backend sent, read the words the
 * agent sees, stay out of the suggested (KB) section, and the flags list their humanized text.
 */

vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));

const similar = vi.hoisted(() => ({ rows: [] as unknown[], calls: 0 }));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSimilarResolvedMessages: () => {
      similar.calls += 1;
      return Promise.resolve({ success: true, data: similar.rows });
    },
  },
}));

let nextId = 91000;
const makeMessage = (metadata: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({
    id: (nextId += 1),
    sender: 'a@b.example',
    channel: 'email',
    createdAt: '2026-09-22T10:00:00Z',
    metadata,
    ...extra,
  }) as unknown as Message;

const renderPanel = (message: Message, section?: 'suggested' | 'analysis') =>
  render(
    <MemoryRouter>
      <AiTabPanel message={message} onGhostClick={() => {}} section={section} />
    </MemoryRouter>
  );

const settle = async () => {
  await waitFor(() => expect(similar.calls).toBeGreaterThan(0));
  await new Promise((resolve) => setTimeout(resolve, 20));
};

const facetLabels = () =>
  Array.from(screen.getByTestId('ai-facets').children).map(
    (card) => card.querySelector('span')?.textContent ?? ''
  );

describe('AiTabPanel facets — only the fields the backend sent', () => {
  it('an analysis carrying only a summary renders no facet grid at all', async () => {
    similar.rows = [];
    similar.calls = 0;
    renderPanel(makeMessage({ analysis: { summary: 'Asks about a refund.' } }), 'analysis');
    await settle();
    expect(screen.getByTestId('ai-summary').textContent).toContain('Asks about a refund.');
    expect(screen.queryByTestId('ai-facets')).toBeNull();
  });

  it('each present field adds exactly its own facet card', async () => {
    similar.rows = [];
    similar.calls = 0;
    renderPanel(
      makeMessage({
        analysis: { summary: 's', isTicketWorthy: false, needsMoreInfo: true },
      }),
      'analysis'
    );
    await settle();
    expect(facetLabels()).toEqual(['Ticket', 'Info']);
    const cards = Array.from(screen.getByTestId('ai-facets').children);
    expect(cards.map((card) => card.querySelector('b')?.textContent)).toEqual(['No', 'Needs more']);
  });

  it('a full analysis lists every facet in order with its value', async () => {
    similar.rows = [];
    similar.calls = 0;
    renderPanel(
      makeMessage(
        {
          spamCheck: { isSpam: false, category: 'legitimate' },
          analysis: {
            suggestedCategory: 'Billing',
            confidence: 0.87,
            isTicketWorthy: true,
            needsMoreInfo: false,
            suggestedPriority: 'high',
          },
        },
        { detectedLanguage: 'de' }
      ),
      'analysis'
    );
    await settle();
    expect(facetLabels()).toEqual([
      'Class',
      'Category',
      'Confidence',
      'Ticket',
      'Info',
      'Language',
      'Priority',
    ]);
  });

  it('section=suggested shows no facets even with a populated analysis; analysis section does', async () => {
    similar.rows = [];
    similar.calls = 0;
    const metadata = {
      spamCheck: { isSpam: false, category: 'legitimate' },
      analysis: { suggestedCategory: 'Billing', confidence: 0.5 },
    };
    const { unmount } = renderPanel(makeMessage(metadata), 'suggested');
    await settle();
    expect(screen.queryByTestId('ai-facets')).toBeNull();
    unmount();
    // CONTROL: the same data in the analysis section renders the grid.
    renderPanel(makeMessage(metadata), 'analysis');
    expect(await screen.findByTestId('ai-facets')).toBeTruthy();
  });
});

describe('AiTabPanel flags — the humanized flag text is listed', () => {
  it('red and green flags list their humanized words under their headings', async () => {
    similar.rows = [];
    similar.calls = 0;
    renderPanel(
      makeMessage({
        spamCheck: {
          isSpam: false,
          category: 'legitimate',
          redFlags: ['all-caps-subject'],
          greenFlags: ['dmarc-pass'],
        },
      }),
      'analysis'
    );
    await settle();
    const red = screen.getByText('Red flags').parentElement as HTMLElement;
    expect(
      within(red)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['All-caps subject line']);
    const green = screen.getByText('Green flags').parentElement as HTMLElement;
    expect(
      within(green)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['DMARC passed']);
  });
});

describe('AiTabPanel suggested reply card', () => {
  it('the header label carries flex-1 so "Use in reply" sits at the right edge', async () => {
    similar.rows = [
      { messageId: 5, directReply: 'Thanks', similarity: 0.7, source: 'message', sender: 'x@y.z' },
    ];
    similar.calls = 0;
    renderPanel(makeMessage({}), 'suggested');
    const label = await screen.findByText('Suggested reply');
    expect(label.className.split(' ')).toContain('flex-1');
    expect(label.className).toContain('text-faint-foreground');
  });

  it('a lone source pill keeps the pill shape and its source colour', async () => {
    similar.rows = [
      { messageId: 6, directReply: 'Thanks', similarity: 0.7, source: 'message', sender: 'x@y.z' },
    ];
    similar.calls = 0;
    renderPanel(makeMessage({}), 'suggested');
    const pillLabel = await screen.findByText('PAST REPLY');
    const pill = pillLabel.parentElement as HTMLElement;
    expect(screen.queryByRole('group', { name: 'Suggestion source' })).toBeNull();
    expect(pill.className).toContain('rounded-[6px]');
    expect(pill.className).toContain('cursor-default');
    expect(pill.className).toContain('text-warning');
  });

  it('an AI suggestion alone (type similar, id suggested) shows no past-reply hint', async () => {
    similar.rows = [];
    similar.calls = 0;
    renderPanel(
      makeMessage({ suggestedAnswer: { answer: 'Generated answer here', confidence: 0.9 } }),
      'suggested'
    );
    await settle();
    expect(await screen.findByText('AI')).toBeTruthy();
    expect(screen.queryByTestId('past-reply-hint')).toBeNull();
  });
});
