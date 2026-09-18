import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const countGmailMessages = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const countImapMessages = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    countGmailMessages: (...args: unknown[]) => countGmailMessages(...args),
    countImapMessages: (...args: unknown[]) => countImapMessages(...args),
    update: vi.fn(),
    getIntegrations: vi.fn().mockResolvedValue({ success: true, data: [] }),
  },
}));

import { GmailCountReview } from '@/components/settings/integrations/GmailCountReview';
import { EmailIntegrationCard } from '@/components/settings/integrations/EmailIntegrationCard';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const gmailSource = {
  id: 68,
  email: 'orders@example.com',
  enabled: false,
  isKnowledgeBase: false,
  searchQuery: '',
  bulkImportDays: 7,
};
const renderGmail = () =>
  render(
    <GmailCountReview
      source={gmailSource}
      onStarted={vi.fn()}
      onClose={vi.fn()}
      onShowAlert={vi.fn()}
    />
  );
const sample = {
  id: 'm1',
  from: 'simon@client.com',
  subject: 'Refund request #42',
  date: '2026-09-10',
};

describe('Gmail count compared with Odly', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows In Odly / Missing and lists a missing sample', async () => {
    countGmailMessages.mockResolvedValue({
      count: 120,
      capped: false,
      query: 'q',
      inOdly: 117,
      missing: 3,
      missingSamples: [sample],
    });
    renderGmail();
    expect(await screen.findByText('In Odly: 117 · Missing: 3')).toBeInTheDocument();
    expect(screen.getByText('Not in Odly, for example:')).toBeInTheDocument();
    expect(screen.getByText(/Refund request #42/)).toBeInTheDocument();
  });

  it('missing 0 on a complete count says all in Odly', async () => {
    countGmailMessages.mockResolvedValue({
      count: 50,
      capped: false,
      query: 'q',
      inOdly: 50,
      missing: 0,
      missingSamples: [],
    });
    renderGmail();
    expect(await screen.findByText(/all in Odly/)).toBeInTheDocument();
    expect(screen.queryByText('Not in Odly, for example:')).not.toBeInTheDocument();
  });

  it('a capped count is called partial and never "all in Odly"', async () => {
    countGmailMessages.mockResolvedValue({
      count: 5000,
      capped: true,
      query: 'q',
      inOdly: 5000,
      missing: 0,
      missingSamples: [],
    });
    renderGmail();
    expect(
      await screen.findByText(
        /Partial comparison: only the first 5,000 messages Gmail listed \(newest first, in practice\)/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/all in Odly/)).not.toBeInTheDocument();
  });
});

describe('Gmail: messages that cannot be verified', () => {
  beforeEach(() => vi.clearAllMocks());
  const base = { count: 50, capped: false, query: 'q', missingSamples: [] };

  it('unverifiable > 0 is shown like IMAP and never reads "all in Odly"', async () => {
    countGmailMessages.mockResolvedValue({ ...base, inOdly: 47, missing: 0, unverifiable: 3 });
    renderGmail();
    expect(
      await screen.findByText("In Odly: 47 · Missing: 0 · Can't verify: 3")
    ).toBeInTheDocument();
    expect(screen.queryByText(/all in Odly/)).not.toBeInTheDocument();
    expect(screen.getByText(/sent within minutes/)).toBeInTheDocument();
  });

  it('an older backend without the field reads as 0 — no "Can\'t verify", no NaN', async () => {
    countGmailMessages.mockResolvedValue({ ...base, inOdly: 50, missing: 0 });
    renderGmail();
    expect(await screen.findByText('In Odly: 50 · Missing: 0 — all in Odly')).toBeInTheDocument();
    expect(screen.queryByText(/Can't verify/)).not.toBeInTheDocument();
  });

  it('an unfinished sent-copy check says some missing may be sent copies', async () => {
    countGmailMessages.mockResolvedValue({
      ...base,
      inOdly: 40,
      missing: 10,
      unverifiable: 0,
      sentOnlyCapped: true,
    });
    renderGmail();
    expect(await screen.findByText(/check for sent copies did not finish/)).toBeInTheDocument();
    expect(screen.queryByText(/check again/i)).not.toBeInTheDocument();
  });

  it('states HOW MANY sent messages were not checked, and never promises a retry finishes', async () => {
    countGmailMessages.mockResolvedValue({
      ...base,
      inOdly: 40,
      missing: 310,
      unverifiable: 0,
      sentOnlyCapped: true,
      sentOnlyUnchecked: 300,
    });
    renderGmail();
    // "At least": the sent listing may not have finished either — and the general reason stays.
    expect(
      await screen.findByText(/At least 300 sent messages were not checked/)
    ).toBeInTheDocument();
    expect(screen.getByText(/check for sent copies did not finish/)).toBeInTheDocument();
    expect(screen.queryByText(/check again/i)).not.toBeInTheDocument();
  });
});

describe('Gmail: a partial comparison says why it stopped', () => {
  beforeEach(() => vi.clearAllMocks());
  const partial = {
    count: 5000,
    capped: true,
    query: 'q',
    inOdly: 4990,
    missing: 10,
    missingSamples: [],
  };

  it('stopped on the time budget: says so plainly, and promises no retry', async () => {
    countGmailMessages.mockResolvedValue({ ...partial, timedOut: true, cappedBy: 'time' });
    renderGmail();
    expect(await screen.findByText(/stopped on the time limit after 5,000/)).toBeInTheDocument();
    expect(screen.queryByText(/Narrow the range/)).not.toBeInTheDocument();
    expect(screen.getByText(/only the first 5,000/)).toBeInTheDocument();
    expect(screen.queryByText(/again may finish/)).not.toBeInTheDocument();
  });

  it.each([
    ['quota', /Gmail refused further requests \(quota\) after 5,000/],
    ['error', /Gmail failed on a later page after 5,000/],
    ['size', /Narrow the range/],
    [undefined, /Narrow the range/],
  ])(
    'cappedBy %s says its own reason, and only the size cap says "narrow the range"',
    async (cappedBy, text) => {
      countGmailMessages.mockResolvedValue({ ...partial, cappedBy });
      renderGmail();
      expect(await screen.findByText(text)).toBeInTheDocument();
      if (cappedBy === 'quota' || cappedBy === 'error') {
        expect(screen.queryByText(/Narrow the range/)).not.toBeInTheDocument();
      }
    }
  );

  it.each([
    ['listing', /while listing — fewer messages were compared/],
    ['sentCheck', /during the sent-copy check — some of the missing may be sent messages/],
    ['samples', /while fetching examples — the counts are unaffected/],
    [undefined, /Gmail refused requests \(quota\) — the check stopped early/],
  ])('a quota refusal in %s says what it cost', async (quotaHitIn, text) => {
    // The backend sends cappedBy 'quota' exactly when the LISTING was refused.
    countGmailMessages.mockResolvedValue({
      ...partial,
      quotaHit: true,
      quotaHitIn,
      ...(quotaHitIn === 'listing' ? { cappedBy: 'quota' } : {}),
    });
    renderGmail();
    expect(await screen.findByText(text)).toBeInTheDocument();
    if (quotaHitIn === 'listing') {
      expect(screen.queryByText(/Narrow the range/)).not.toBeInTheDocument();
    }
    if (quotaHitIn === 'samples') {
      expect(screen.queryByText(/fewer messages were compared/)).not.toBeInTheDocument();
    }
  });

  it('a LISTING refusal does not also show the sent-check note (it never ran)', async () => {
    countGmailMessages.mockResolvedValue({
      ...partial,
      quotaHit: true,
      quotaHitIn: 'listing',
      sentOnlyCapped: true,
      sentOnlyUnchecked: 0,
    });
    renderGmail();
    expect(
      await screen.findByText(/while listing — fewer messages were compared/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/check for sent copies did not finish/)).not.toBeInTheDocument();
  });

  it('CONTROL — a sent-check refusal still says the missing may be sent copies (once, in the quota line)', async () => {
    countGmailMessages.mockResolvedValue({
      ...partial,
      quotaHit: true,
      quotaHitIn: 'sentCheck',
      sentOnlyCapped: true,
    });
    renderGmail();
    expect(
      await screen.findByText(
        /during the sent-copy check — some of the missing may be sent messages/
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText(/some of the missing may be sent messages/)).toHaveLength(1);
  });

  it('CONTROL — an unfinished sent check WITHOUT a quota refusal keeps its own note', async () => {
    countGmailMessages.mockResolvedValue({ ...partial, sentOnlyCapped: true });
    renderGmail();
    expect(await screen.findByText(/check for sent copies did not finish/)).toBeInTheDocument();
  });

  it('a sent-check refusal with NOTHING missing does not say "some of the missing"', async () => {
    countGmailMessages.mockResolvedValue({
      ...partial,
      missing: 0,
      quotaHit: true,
      quotaHitIn: 'sentCheck',
    });
    renderGmail();
    expect(
      await screen.findByText(/during the sent-copy check, so it stopped early/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/some of the missing/)).not.toBeInTheDocument();
  });

  // Shapes the backend produces: count = inOdly + missing + unverifiable + notCompared.
  it('COMPLETE listing, comparison cut: no "at least", no "counting stopped", no "all in Odly"', async () => {
    countGmailMessages.mockResolvedValue({
      count: 3000,
      capped: false,
      timedOut: false,
      cappedBy: null,
      query: 'q',
      inOdly: 1000,
      missing: 0,
      unverifiable: 0,
      notCompared: 2000,
      compared: 1000,
      missingSamples: [],
    });
    renderGmail();
    expect(
      await screen.findByText(
        /1,000 of 3,000 listed messages were compared; 2,000 were not compared before the time limit/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Found 3,000 messages matching/)).toBeInTheDocument();
    expect(screen.queryByText(/At least/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Counting stopped/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Partial comparison: only the first/)).not.toBeInTheDocument();
    expect(screen.queryByText(/all in Odly/)).not.toBeInTheDocument();
  });

  it('TIME-capped listing AND a cut comparison: both said, each about its own part', async () => {
    countGmailMessages.mockResolvedValue({
      count: 5000,
      capped: true,
      timedOut: true,
      cappedBy: 'time',
      query: 'q',
      inOdly: 990,
      missing: 10,
      unverifiable: 0,
      notCompared: 4000,
      compared: 1000,
      missingSamples: [],
    });
    renderGmail();
    expect(await screen.findByText(/At least 5,000 messages match/)).toBeInTheDocument();
    expect(screen.getByText(/Counting stopped on the time limit after 5,000/)).toBeInTheDocument();
    expect(
      screen.getByText(/1,000 of 5,000 listed messages were compared; 4,000 were not compared/)
    ).toBeInTheDocument();
    // The partial line names what was CHECKED (compared), not what was listed.
    expect(
      screen.getByText(/Partial comparison: only the first 1,000 messages Gmail listed/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/only the first 5,000/)).not.toBeInTheDocument();
  });

  it('a sent-check quota refusal and an unfinished sent check do not say the same sentence twice', async () => {
    countGmailMessages.mockResolvedValue({
      ...partial,
      quotaHit: true,
      quotaHitIn: 'sentCheck',
      sentOnlyCapped: true,
      sentOnlyUnchecked: 150,
    });
    renderGmail();
    expect(
      await screen.findByText(/during the sent-copy check — some of the missing/)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/some of the missing may be sent messages/)).toHaveLength(1);
    expect(screen.getByText(/At least 150 sent messages were not checked/)).toBeInTheDocument();
  });

  it('a sent-check refusal with nothing unchecked renders NO empty note paragraph', async () => {
    countGmailMessages.mockResolvedValue({
      ...partial,
      quotaHit: true,
      quotaHitIn: 'sentCheck',
      sentOnlyCapped: true,
      sentOnlyUnchecked: 0,
    });
    const { container } = renderGmail();
    await screen.findByText(/during the sent-copy check/);
    const empty = [...container.querySelectorAll('p')].filter(
      (paragraph) => paragraph.textContent?.trim() === ''
    );
    expect(empty).toHaveLength(0);
  });

  it('CONTROL — no quota refusal, no quota line', async () => {
    countGmailMessages.mockResolvedValue({ ...partial, quotaHit: false });
    renderGmail();
    expect(await screen.findByText(/Partial comparison/)).toBeInTheDocument();
    expect(screen.queryByText(/Gmail refused requests/)).not.toBeInTheDocument();
  });

  it('CONTROL — stopped on the size cap: no time-limit wording', async () => {
    countGmailMessages.mockResolvedValue({ ...partial, timedOut: false });
    renderGmail();
    expect(await screen.findByText(/Partial comparison/)).toBeInTheDocument();
    expect(screen.queryByText(/stopped on the time limit/)).not.toBeInTheDocument();
  });
});

const imapRow = {
  id: 12,
  name: 'Email-info@shop.eu',
  type: 'email' as const,
  enabled: true,
  isKnowledgeBase: false,
  hasCredentials: true,
  config: {
    email: { host: 'mail.shop.eu', port: 993, user: 'info@shop.eu', password: 'x', secure: true },
  },
};
const renderCard = () =>
  render(
    <EmailIntegrationCard
      integrations={[imapRow] as never}
      onRefresh={vi.fn()}
      onShowAlert={vi.fn()}
    />
  );
const imapResult = (over: Record<string, unknown> = {}) => ({
  count: 160,
  inOdly: 150,
  missing: 4,
  unverifiable: 0,
  capped: false,
  folders: [
    { name: 'INBOX', count: 120 },
    { name: 'Sent', count: 40 },
  ],
  missingSamples: [sample],
  windowDays: 30,
  perRunLimit: 500,
  ...over,
});

describe('IMAP "Compare with Odly" on a saved source', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the row id and shows mailbox, per-folder counts, in Odly and missing', async () => {
    countImapMessages.mockResolvedValue(imapResult());
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    await waitFor(() => expect(countImapMessages).toHaveBeenCalledWith(12));
    expect(
      await screen.findByText('Mailbox (last 30 days): 160 messages (INBOX 120 · Sent 40)')
    ).toBeInTheDocument();
    expect(screen.getByText('In Odly: 150 · Missing: 4')).toBeInTheDocument();
    expect(screen.queryByText(/Can't verify/)).not.toBeInTheDocument();
    expect(screen.getByText(/Refund request #42/)).toBeInTheDocument();
  });

  it("shows Can't verify only when > 0, and never adds it into missing", async () => {
    countImapMessages.mockResolvedValue(imapResult({ unverifiable: 6, windowDays: 0 }));
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(
      await screen.findByText("In Odly: 150 · Missing: 4 · Can't verify: 6")
    ).toBeInTheDocument();
    expect(screen.getByText(/Mailbox \(all time\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Missing: 10/)).not.toBeInTheDocument();
  });

  it('nothing missing but some unverifiable is NOT "all in Odly"; the caption covers encoded ids', async () => {
    countImapMessages.mockResolvedValue(
      imapResult({ count: 156, inOdly: 150, missing: 0, unverifiable: 6, missingSamples: [] })
    );
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(
      await screen.findByText("In Odly: 150 · Missing: 0 · Can't verify: 6")
    ).toBeInTheDocument();
    expect(screen.queryByText(/all in Odly/)).not.toBeInTheDocument();
    expect(screen.getByText(/encoded form/)).toBeInTheDocument();
  });

  it('a Sent folder whose search FAILED reads "could not be searched", never "Sent 0"', async () => {
    countImapMessages.mockResolvedValue(
      imapResult({
        count: 120,
        capped: true,
        folders: [
          { name: 'INBOX', count: 120, found: 120, capped: false },
          { name: 'Sent', count: 0, found: 0, capped: true, failed: true, cappedBy: 'failed' },
        ],
      })
    );
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(
      await screen.findByText(/INBOX 120 · Sent: could not be opened or searched/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Sent 0/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Sent could not be opened or searched, so nothing in it was compared/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/the mailbox holds more/)).not.toBeInTheDocument();
  });

  it('Sent not reached on the time limit is SAID, not silently absent', async () => {
    countImapMessages.mockResolvedValue(
      imapResult({
        count: 120,
        capped: true,
        timedOut: true,
        sentKnown: true,
        folders: [{ name: 'INBOX', count: 120, found: 120, capped: false }],
      })
    );
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(await screen.findByText(/Sent: not reached \(time limit\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/The time limit was reached before the Sent folder/)
    ).toBeInTheDocument();
  });

  it('a size-capped folder shows compared OF found', async () => {
    countImapMessages.mockResolvedValue(
      imapResult({
        count: 20040,
        capped: true,
        folders: [
          { name: 'INBOX', count: 20000, found: 25000, capped: true, cappedBy: 'size' },
          { name: 'Sent', count: 40, found: 40, capped: false },
        ],
      })
    );
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(await screen.findByText(/INBOX 20,000 of 25,000 · Sent 40/)).toBeInTheDocument();
    expect(
      screen.getByText(/INBOX matched more messages than one comparison reads/)
    ).toBeInTheDocument();
  });

  it('a SHORT FETCH (found > count, not the size cap) says so — never "only the newest"', async () => {
    countImapMessages.mockResolvedValue(
      imapResult({
        // Distinct total across folders: 118 + 40 (no message in both).
        count: 158,
        inOdly: 154,
        missing: 4,
        capped: true,
        folders: [
          { name: 'INBOX', count: 118, found: 120, capped: true, cappedBy: 'shortFetch' },
          { name: 'Sent', count: 40, found: 40, capped: false },
        ],
      })
    );
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(
      await screen.findByText(/returned fewer messages from INBOX than its search found/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/only the most recently added were checked/)).not.toBeInTheDocument();
  });

  it('out of time on a mailbox with NO Sent folder: never "Sent: not reached"', async () => {
    countImapMessages.mockResolvedValue(
      imapResult({
        count: 120,
        capped: true,
        timedOut: true,
        sentKnown: false,
        folders: [{ name: 'INBOX', count: 120, found: 150, capped: true, cappedBy: 'time' }],
      })
    );
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(await screen.findByText(/INBOX 120 of 150/)).toBeInTheDocument();
    expect(screen.queryByText(/Sent: not reached/)).not.toBeInTheDocument();
    expect(screen.queryByText(/before the Sent folder/)).not.toBeInTheDocument();
    // The cut was INBOX itself — say so.
    expect(
      screen.getByText(/INBOX was only partly read before the time limit/)
    ).toBeInTheDocument();
  });

  it('LIST failed and time ran out: says the Sent folder could not be identified, not "looked for"', async () => {
    countImapMessages.mockResolvedValue(
      imapResult({
        count: 120,
        capped: true,
        timedOut: true,
        sentKnown: null,
        folders: [{ name: 'INBOX', count: 120, found: 120, capped: false }],
      })
    );
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(
      await screen.findByText(/Sent folder could not be identified before the time limit/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/looked for/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sent: not reached/)).not.toBeInTheDocument();
  });

  it('the stand-in Sent entry after a failed LIST says "could not be identified", never "could not be opened"', async () => {
    countImapMessages.mockResolvedValue(
      imapResult({
        count: 120,
        capped: true,
        sentKnown: null,
        folders: [
          { name: 'INBOX', count: 120, found: 120, capped: false },
          { name: 'Sent', count: 0, found: 0, capped: true, failed: true, cappedBy: 'failed' },
        ],
      })
    );
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(
      await screen.findByText(/INBOX 120 · Sent folder: could not be identified/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The Sent folder could not be identified, so it was not compared/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/could not be opened or searched/)).not.toBeInTheDocument();
  });

  it('a Sent folder the deadline cut mid-fetch gets its own time reason', async () => {
    countImapMessages.mockResolvedValue(
      imapResult({
        count: 5,
        inOdly: 5,
        missing: 0,
        capped: true,
        timedOut: true,
        sentKnown: true,
        folders: [
          { name: 'INBOX', count: 3, found: 3, capped: false },
          { name: 'Sent', count: 2, found: 3, capped: true, cappedBy: 'time' },
        ],
        missingSamples: [],
      })
    );
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(
      await screen.findByText(/Sent was only partly read before the time limit/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/before every message was read/)).not.toBeInTheDocument();
    expect(screen.queryByText(/INBOX was only partly read/)).not.toBeInTheDocument();
  });

  it.each([
    ['UNSEEN', 'unread'],
    ['FLAGGED', 'flagged'],
  ])(
    'a %s source warns that mail outside the filter can show as missing',
    async (criteria, label) => {
      countImapMessages.mockResolvedValue(imapResult({ searchCriteria: criteria }));
      renderCard();
      fireEvent.click(screen.getByLabelText('Compare with Odly'));
      expect(
        await screen.findByText(
          new RegExp(`This mailbox imports only ${label} mail, so messages outside that filter`)
        )
      ).toBeInTheDocument();
    }
  );

  it.each([['ALL'], [undefined]])('CONTROL — criteria %s: no filter warning', async (criteria) => {
    countImapMessages.mockResolvedValue(imapResult({ searchCriteria: criteria }));
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    await screen.findByText(/In Odly: 150/);
    expect(screen.queryByText(/This mailbox imports only/)).not.toBeInTheDocument();
  });
});
