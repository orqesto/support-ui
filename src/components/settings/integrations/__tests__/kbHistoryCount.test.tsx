import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

/**
 * A KB mailbox's count says how much of it is HISTORY — mail from before the knowledge-base
 * cutoff, the only part mined for Q&A pairs. Owner, 2026-10-05: the caption said "everything
 * counted here will also be mined", which was false for every message after the cutoff — on
 * taco's DeusPower, all 2,597 counted were live work and none were mined.
 */
const countGmailMessages = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    countGmailMessages: (...args: unknown[]) => countGmailMessages(...args),
    update: vi.fn(),
  },
}));

import { GmailCountReview } from '@/components/settings/integrations/GmailCountReview';
import {
  ImapReconciliationResult,
  kbHistoryNote,
} from '@/components/settings/integrations/MailboxReconciliation';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);
const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const FROM = '2026-09-09T10:34:55.000Z';
const TO = '2026-09-16T10:34:55.000Z';

describe('kbHistoryNote', () => {
  it('names how many are history, the range, and that the rest is regular work', () => {
    expect(kbHistoryNote({ count: 2100, capped: false, from: FROM, to: TO })).toBe(
      `2,100 are knowledge-base history (${day(FROM)} – ${day(TO)}, before the cutoff): the history sweep reads them for Q&A pairs, which is billed AI usage. The rest is imported as regular work.`
    );
  });

  it('none from before the cutoff: says nothing will be mined — the DeusPower case', () => {
    expect(kbHistoryNote({ count: 0, capped: false, from: FROM, to: TO })).toBe(
      `None of these are from before the knowledge-base cutoff (${day(TO)}), so nothing here will be mined for Q&A pairs — it is all regular work.`
    );
  });

  it('a capped history count is "at least", never exact', () => {
    expect(kbHistoryNote({ count: 500, capped: true, from: FROM, to: TO })).toMatch(
      /^At least 500 are/
    );
  });

  it('not counted at all (capped with nothing listed) is never a confident zero', () => {
    const note = kbHistoryNote({ count: 0, capped: true, from: FROM, to: TO });
    expect(note).toMatch(/could not be counted/);
    expect(note).not.toMatch(/None of these/);
  });

  it('"All Time": the range is everything before the cutoff', () => {
    expect(kbHistoryNote({ count: 1, capped: false, from: null, to: TO })).toBe(
      `1 is knowledge-base history (everything before the cutoff, ${day(TO)}): the history sweep reads it for Q&A pairs, which is billed AI usage. The rest is imported as regular work.`
    );
  });
});

describe('kbHistoryNote — true in every state the backend reports (audit pass 1)', () => {
  it('no cutoff: nothing is mined NOW, and saving sets one — then the sweep reads the range', () => {
    const note = kbHistoryNote({
      count: 40,
      capped: false,
      from: FROM,
      to: TO,
      miningOff: true,
      sweepOwed: true,
    });
    expect(note).toMatch(
      /^This mailbox has no knowledge-base cutoff yet, so nothing is mined now\./
    );
    expect(note).toMatch(
      /Saving its settings \(Start sync included\) sets the cutoff to that moment\./
    );
    expect(note).toMatch(/history sweep then reads/);
  });

  it('no cutoff AND already swept: saving sets a cutoff, but nothing is read again', () => {
    const note = kbHistoryNote({
      count: 40,
      capped: false,
      from: FROM,
      to: TO,
      miningOff: true,
      sweepOwed: false,
    });
    expect(note).toMatch(/already swept, so it is not read for Q&A pairs again/);
    expect(note).not.toMatch(/billed AI usage/);
  });

  it('an approximate count that was also capped is never "at least"', () => {
    expect(
      kbHistoryNote({
        count: 500,
        capped: true,
        from: FROM,
        to: TO,
        approximate: true,
        sweepOwed: true,
      })
    ).toMatch(/^Roughly 500 or more are knowledge-base history/);
  });

  it('the sweep already ran: the history is NOT read again, and the note says so', () => {
    const note = kbHistoryNote({ count: 40, capped: false, from: FROM, to: TO, sweepOwed: false });
    expect(note).toMatch(/already swept, so it is not read for Q&A pairs again/);
    expect(note).not.toMatch(/billed AI usage/);
  });

  it('a Gmail count is day-granular: "About", never an exact claim', () => {
    expect(
      kbHistoryNote({
        count: 40,
        capped: false,
        from: FROM,
        to: TO,
        approximate: true,
        sweepOwed: true,
      })
    ).toMatch(/^About 40 are knowledge-base history/);
  });
});

describe('the Gmail count panel on a KB source', () => {
  beforeEach(() => vi.clearAllMocks());

  const source = {
    id: 68,
    email: 'orders@deuspower.info',
    enabled: false,
    isKnowledgeBase: true,
    searchQuery: '',
    bulkImportDays: 7,
  };

  it('no longer claims everything counted will be mined', async () => {
    countGmailMessages.mockResolvedValue({
      count: 2597,
      capped: false,
      query: 'x',
      inOdly: 2597,
      missing: 0,
      missingSamples: [],
      kbHistory: { count: 0, capped: false, from: FROM, to: TO },
    });
    render(
      <GmailCountReview
        source={source}
        onStarted={vi.fn()}
        onClose={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    expect(
      await screen.findByText(/None of these are from before the knowledge-base cutoff/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/everything counted here will also be mined/)
    ).not.toBeInTheDocument();
    // The general caption gives way to the count's own line, which knows this mailbox's state.
    expect(
      screen.queryByText(/mail from before the knowledge-base cutoff is mined/)
    ).not.toBeInTheDocument();
  });

  it('CONTROL — an older backend (no kbHistory) shows no history line, and no false claim', async () => {
    countGmailMessages.mockResolvedValue({
      count: 10,
      capped: false,
      query: 'x',
      inOdly: 10,
      missing: 0,
      missingSamples: [],
    });
    render(
      <GmailCountReview
        source={source}
        onStarted={vi.fn()}
        onClose={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    expect(await screen.findByText(/Found 10 messages/)).toBeInTheDocument();
    expect(screen.queryByText(/knowledge-base history/)).not.toBeInTheDocument();
  });
});

describe('the IMAP mailbox line on a KB source', () => {
  const base = {
    count: 154,
    inOdly: 150,
    missing: 4,
    unverifiable: 0,
    capped: false,
    folders: [
      { name: 'INBOX', count: 114 },
      { name: 'Sent', count: 40 },
    ],
    missingSamples: [],
    windowDays: 7,
    perRunLimit: 500,
  };

  it('names BOTH windows it listed, and how much is history', () => {
    render(
      <ImapReconciliationResult
        result={{ ...base, kbHistory: { count: 30, capped: false, from: FROM, to: TO } } as never}
      />
    );
    expect(
      screen.getByText(
        `Mailbox (last 7 days + 7 days before the knowledge-base cutoff ${day(TO)}): 154 messages (INBOX 114 · Sent 40)`
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/^30 are knowledge-base history/)).toBeInTheDocument();
  });

  it('CONTROL — not a KB source: the plain window, no history line', () => {
    render(<ImapReconciliationResult result={{ ...base, kbHistory: null } as never} />);
    expect(
      screen.getByText('Mailbox (last 7 days): 154 messages (INBOX 114 · Sent 40)')
    ).toBeInTheDocument();
    expect(screen.queryByText(/knowledge-base history/)).not.toBeInTheDocument();
  });

  it('mining off: the plain window — no "before the cutoff" for a cutoff that does not exist', () => {
    render(
      <ImapReconciliationResult
        result={
          {
            ...base,
            kbHistory: { count: 0, capped: false, from: FROM, to: TO, miningOff: true },
          } as never
        }
      />
    );
    expect(
      screen.getByText('Mailbox (last 7 days): 154 messages (INBOX 114 · Sent 40)')
    ).toBeInTheDocument();
    expect(screen.getByText(/no knowledge-base cutoff yet/)).toBeInTheDocument();
  });

  it('"All Time": the window is all time — nothing is added before the cutoff', () => {
    render(
      <ImapReconciliationResult
        result={
          {
            ...base,
            windowDays: 0,
            kbHistory: { count: 30, capped: false, from: null, to: TO, sweepOwed: true },
          } as never
        }
      />
    );
    expect(
      screen.getByText('Mailbox (all time): 154 messages (INBOX 114 · Sent 40)')
    ).toBeInTheDocument();
  });

  it('an uncountable history on an already-swept mailbox says it will not be read again', () => {
    const note = kbHistoryNote({ count: 0, capped: true, from: FROM, to: TO, sweepOwed: false });
    expect(note).toMatch(/could not be counted/);
    expect(note).toMatch(/already swept, so it is not read for Q&A pairs again/);
    expect(note).not.toMatch(/Only that history is read/);
  });
});
