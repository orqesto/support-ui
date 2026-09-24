/**
 * Message detail v3 — the design gaps built on 2026-09-23 (owner's selection). Each piece renders
 * only what the data says: absent stays absent, never a zero or a guessed name.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { describeResolved } from '../MessageActionStrip';
import { nearMissSentence } from '../MessageDetailHeader';
import { ghostCaption, toGhostOption } from '../messageDetailConstants';
import { languageName } from '@/lib/languageName';
import { customerSince, lifetimeLabel } from '@/components/contacts/contactFacts';
import { ContactFactRows } from '@/components/contacts/ContactFactRows';
import type { ContactProfile } from '@/types/api';
import type { Message } from '@/types';
import { MemoryRouter } from 'react-router-dom';
import { MessageGhostBubble } from '../MessageGhostBubble';
import { AiTabPanel } from '../AiTabPanel';

vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSimilarResolvedMessages: () => Promise.resolve({ success: true, data: [] }),
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('describeResolved — "Resolved 2h ago by Daniel Reiss."', () => {
  it('says when AND who when both are known', () => {
    vi.useFakeTimers({ now: new Date('2026-09-23T12:00:00Z') });
    expect(describeResolved('2026-09-23T10:00:00Z', 'Daniel Reiss')).toBe(
      'Resolved 2h ago by Daniel Reiss.'
    );
  });

  it('stops at the time when the resolver is unknown — an older backend, or automation', () => {
    vi.useFakeTimers({ now: new Date('2026-09-23T12:00:00Z') });
    expect(describeResolved('2026-09-23T10:00:00Z', undefined)).toBe('Resolved 2h ago.');
    expect(describeResolved('2026-09-23T10:00:00Z', null)).toBe('Resolved 2h ago.');
    expect(describeResolved('2026-09-23T10:00:00Z', '   ')).toBe('Resolved 2h ago.');
  });

  it('says nothing at all when neither is known, or the date is unreadable', () => {
    expect(describeResolved(null, null)).toBeNull();
    expect(describeResolved('not a date', null)).toBeNull();
  });
});

describe('nearMissSentence — the routing hint names the departments', () => {
  it.each([
    [['Logistics'], 'Routing also scored this for Logistics.'],
    [['Logistics', 'Billing'], 'Routing also scored this for Logistics or Billing.'],
    [['A', 'B', 'C'], 'Routing also scored this for A, B or C.'],
  ])('%j', (names, sentence) => {
    expect(nearMissSentence(names)).toBe(sentence);
  });

  it('counts a department it cannot name rather than dropping it', () => {
    expect(nearMissSentence(['Logistics', undefined])).toBe(
      'Routing also scored this for Logistics or another department.'
    );
    expect(nearMissSentence(['Logistics', undefined, undefined])).toBe(
      'Routing also scored this for Logistics or 2 other departments.'
    );
  });

  it('CONTROL: none known keeps the generic wording', () => {
    expect(nearMissSentence([undefined])).toBe('Routing also scored this for another department.');
    expect(nearMissSentence([undefined, undefined])).toBe(
      'Routing also scored this for other departments.'
    );
  });
});

describe('ghost caption — "AI suggestion · 87% · Returns policy"', () => {
  it('carries the confidence and the KB title when the writer stored them', () => {
    const option = toGhostOption({
      answer: 'x',
      source: 'lead_qualification_kb',
      confidence: 0.87,
      kbSources: [{ type: 'documentation', title: 'Returns policy' }],
    });
    expect(ghostCaption(option!)).toBe('AI suggestion · 87% · Returns policy');
  });

  it('⛔ absent confidence is omitted, never "0%"; absent title is omitted', () => {
    const option = toGhostOption({ answer: 'x', source: 'documentation' });
    expect(ghostCaption(option!)).toBe('AI suggestion');
  });

  it('a real 0 is a real value and is shown', () => {
    expect(ghostCaption(toGhostOption({ answer: 'x', confidence: 0 })!)).toBe('AI suggestion · 0%');
  });

  it.each([[87], [-0.2], [Number.NaN]])(
    'drops an out-of-range confidence (%s) rather than printing it',
    (confidence) => {
      expect(ghostCaption(toGhostOption({ answer: 'x', confidence })!)).toBe('AI suggestion');
    }
  );
});

describe('languageName', () => {
  it('names a code, and keeps an unknown one as itself', () => {
    expect(languageName('es')).toBe('Spanish');
    expect(languageName('zz')).toBe('ZZ');
    expect(languageName('')).toBeNull();
    expect(languageName(null)).toBeNull();
  });
});

// Deliberately partial stats: an older backend sends fewer fields than the current type declares.
const contact = (over: { createdAt?: string | null; stats?: Record<string, unknown> }) =>
  ({
    createdAt: '2026-09-23T11:57:00Z',
    stats: { messageCount: 14 },
    ...over,
  }) as unknown as ContactProfile;

describe('contact facts — Since / Lifetime', () => {
  it('since = the earliest conversation, not the contact row (created on first VIEW)', () => {
    const facts = contact({ stats: { messageCount: 14, firstMessageAt: '2024-03-01T10:00:00Z' } });
    expect(customerSince(facts)).toBe('2024-03-01T10:00:00Z');
  });

  it('an older backend (field absent) falls back to what the drawer showed before', () => {
    expect(customerSince(contact({}))).toBe('2026-09-23T11:57:00Z');
  });

  it('a backend that sends null means unknown — never the view date', () => {
    expect(customerSince(contact({ stats: { messageCount: 0, firstMessageAt: null } }))).toBeNull();
  });

  it('lifetime names the open count only when the backend sends it', () => {
    expect(lifetimeLabel({ messageCount: 14, openCount: 1 } as never)).toBe(
      '14 conversations · 1 open'
    );
    expect(lifetimeLabel({ messageCount: 1 } as never)).toBe('1 conversation');
    expect(lifetimeLabel(undefined)).toBeNull();
  });

  it('ContactFactRows renders both rows, and nothing when neither is known', () => {
    const { container, rerender } = render(
      <ContactFactRows
        contact={contact({
          stats: { messageCount: 14, openCount: 1, firstMessageAt: '2024-03-01T10:00:00Z' },
        })}
      />
    );
    expect(screen.getByText('SINCE')).toBeTruthy();
    // A month, not a timestamp — no clock time on "customer since".
    expect(
      screen.getByText(
        new Date('2024-03-01T10:00:00Z').toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        })
      )
    ).toBeTruthy();
    expect(screen.queryByText(/\d{1,2}:\d{2}/)).toBeNull();
    expect(screen.getByText('14 conversations · 1 open')).toBeTruthy();
    rerender(
      <ContactFactRows
        contact={{ createdAt: null, stats: undefined } as unknown as ContactProfile}
      />
    );
    expect(container.textContent).toBe('');
  });
});

describe('wiring: the ghost bubble prints the caption', () => {
  it('shows "AI suggestion · 87% · Returns policy", not the type again', () => {
    render(
      <MessageGhostBubble
        aiLoading={false}
        ghostVisible
        ghostOption={toGhostOption({
          answer: 'Hi Marta',
          source: 'lead_qualification_kb',
          confidence: 0.87,
          kbSources: [{ type: 'documentation', title: 'Returns policy' }],
        })}
        autoReply={undefined}
        composer=""
        composerMode="reply"
        resolved={false}
        alternativeCount={0}
        onGhostClick={() => {}}
        onShowAlternatives={() => {}}
      />
    );
    expect(screen.getByText('AI suggestion · 87% · Returns policy')).toBeTruthy();
  });
});

describe('wiring: the AI tab shows the detected language', () => {
  const renderAnalysis = (detectedLanguage: string | null | undefined) =>
    render(
      <MemoryRouter>
        <AiTabPanel
          message={
            {
              id: 7000 + Math.floor(Math.random() * 1000),
              sender: 'a@b.example',
              channel: 'email',
              createdAt: '2026-09-22T10:00:00Z',
              metadata: { analysis: { suggestedCategory: 'Returns', confidence: 0.9 } },
              detectedLanguage,
            } as unknown as Message
          }
          onGhostClick={() => {}}
          section="analysis"
        />
      </MemoryRouter>
    );

  it('names the language when the backend sends one', () => {
    renderAnalysis('es');
    expect(screen.getByText('LANGUAGE')).toBeTruthy();
    expect(screen.getByText('Spanish')).toBeTruthy();
  });

  it('CONTROL: no language → no facet (an older backend sends none)', () => {
    renderAnalysis(undefined);
    expect(screen.queryByText('LANGUAGE')).toBeNull();
    // …and the grid itself still rendered, so the absence is not vacuous.
    expect(screen.getByText('CATEGORY')).toBeTruthy();
  });
});
