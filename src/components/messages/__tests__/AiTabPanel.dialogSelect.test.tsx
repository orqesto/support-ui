import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AiTabPanel } from '../AiTabPanel';
import type { Message } from '@/types';

/**
 * The three source dialogs the AI tab opens (KB sources, lead KB sources, "View original
 * message") may only offer to put an answer in the reply when there IS a reply to put it in —
 * that is, when the host passed `onGhostClick`. Without it they are read-only.
 */

vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSimilarResolvedMessages: () =>
      Promise.resolve({
        success: true,
        data: [
          {
            documentationId: 3,
            documentTitle: 'Sizing guide',
            directReply: 'Our sizing guide covers this.',
            similarity: 0.8,
            source: 'documentation',
            references: [
              { documentationId: 3, documentTitle: 'Sizing guide', similarity: 0.8 },
              { documentationId: 4, documentTitle: 'Returns', similarity: 0.6 },
            ],
          },
          {
            messageId: 77,
            content: 'My order arrived in the wrong size.',
            directReply: 'Sorry about the size.',
            similarity: 0.7,
            source: 'message',
            sender: 'joy@example.net',
          },
        ],
      }),
  },
}));
// Stand-in for the dialog: what this test is about is the wiring AiTabPanel hands it.
vi.mock('@/components/modals/SimilarMessagesDialog', () => ({
  SimilarMessagesDialog: ({
    preloadedTitle,
    onSelectAnswer,
  }: {
    preloadedTitle?: string;
    onSelectAnswer?: (answer: string) => void;
  }) => (
    <div role="dialog" aria-label={preloadedTitle}>
      {onSelectAnswer && (
        <button type="button" onClick={() => onSelectAnswer('Picked answer')}>
          Use This Answer
        </button>
      )}
    </div>
  ),
}));

let nextId = 9100;
const onGhostClick = vi.fn<(answer: string, source: string) => void>();
const renderPanel = (withHandler: boolean) => {
  const message = {
    id: nextId++, // a fresh id per test: the panel caches results per conversation
    sender: 'a@b.example',
    channel: 'email',
    createdAt: '2026-09-22T10:00:00Z',
    metadata: {
      suggestedAnswer: {
        answer: 'Our plans start at 10 EUR.',
        source: 'lead_qualification',
        kbSources: [{ id: 5, type: 'documentation', title: 'Pricing', similarity: 0.9 }],
      },
    },
  } as unknown as Message;
  render(
    <MemoryRouter>
      <AiTabPanel
        message={message}
        onGhostClick={withHandler ? onGhostClick : undefined}
        section="suggested"
      />
    </MemoryRouter>
  );
};

const pick = async (pill: RegExp) => {
  const group = await screen.findByRole('group', { name: 'Suggestion source' });
  await userEvent.click(within(group).getByRole('button', { name: pill }));
};

const DIALOGS = [
  {
    name: 'KB sources',
    pill: /^KB/,
    opener: 'Sizing guide',
    title: 'Knowledge Base Sources',
    source: 'documentation',
  },
  {
    name: 'lead KB sources',
    pill: /^LEAD/,
    opener: 'Pricing',
    title: 'Lead KB Sources',
    source: 'lead_qualification',
  },
  {
    name: 'View original message',
    pill: /^PAST REPLY/,
    opener: 'View original message',
    title: 'Original Message',
    source: 'message',
  },
];

describe('AiTabPanel — the source dialogs offer "use" only with a reply to use it in', () => {
  for (const { name, pill, opener, title, source } of DIALOGS) {
    it(`${name}: without onGhostClick the dialog has no insert control`, async () => {
      renderPanel(false);
      await pick(pill);
      await userEvent.click(screen.getByRole('button', { name: opener }));
      const dialog = await screen.findByRole('dialog', { name: title });
      expect(within(dialog).queryByText('Use This Answer')).toBeNull();
    });

    it(`CONTROL ${name}: with onGhostClick the dialog offers it`, async () => {
      renderPanel(true);
      await pick(pill);
      await userEvent.click(screen.getByRole('button', { name: opener }));
      const dialog = await screen.findByRole('dialog', { name: title });
      expect(within(dialog).getByText('Use This Answer')).toBeInTheDocument();
    });

    it(`${name}: picking an answer hands it to the reply under its source, and closes the dialog`, async () => {
      // Mutation batch: the three `onSelectAnswer` wirings had no coverage — the answer, the source
      // tag the reply records, and the close were all unproven.
      onGhostClick.mockClear();
      renderPanel(true);
      await pick(pill);
      await userEvent.click(screen.getByRole('button', { name: opener }));
      const dialog = await screen.findByRole('dialog', { name: title });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Use This Answer' }));
      expect(onGhostClick).toHaveBeenCalledTimes(1);
      expect(onGhostClick).toHaveBeenCalledWith('Picked answer', source);
      expect(screen.queryByRole('dialog', { name: title })).toBeNull();
    });
  }
});

describe('AiTabPanel — the selected source pill is drawn as selected', () => {
  /** The 1.5px own-colour border of v4 `.k-pill.on` (PILL_ACTIVE); the others keep PILL_BASE. */
  const isDrawnActive = (pill: HTMLElement) => {
    const tokens = pill.className.split(/\s+/);
    return tokens.includes('border-[1.5px]') && tokens.includes('border-current');
  };

  it('only the pressed pill carries the active style — and it moves with the selection', async () => {
    renderPanel(true);
    const group = await screen.findByRole('group', { name: 'Suggestion source' });
    const pills = within(group).getAllByRole('button');
    expect(pills.length).toBeGreaterThanOrEqual(2);
    const drawn = () => pills.filter(isDrawnActive);
    const pressed = () => pills.filter((pill) => pill.getAttribute('aria-pressed') === 'true');
    expect(pressed()).toHaveLength(1);
    expect(drawn()).toEqual(pressed());
    const kb = within(group).getByRole('button', { name: /^KB/ });
    expect(isDrawnActive(kb)).toBe(false);
    // Unselected, each pill still wears its own source colour (PILL_BASE).
    expect(kb.className.split(/\s+/)).toContain('text-primary');
    await userEvent.click(kb);
    expect(drawn()).toEqual([kb]);
    expect(pressed()).toEqual([kb]);
    expect(kb.className.split(/\s+/)).toContain('text-primary');
  });
});
