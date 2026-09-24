/**
 * The public tracking page says only what the product does (2026-09-24).
 *
 * Before: it fetched ONCE yet told the customer "no need to refresh" and "this page updates as
 * your request progresses"; it promised an email "at each step" and "a copy of your reply" (no
 * code sends either); it hid the reply box on a resolved request although a reply from here
 * reopens it (BE `REOPENABLE_STATUSES`); in `awaiting_response` the headline said "We're working
 * on your request" under an "Awaiting your reply" badge; that step was drawn as finished; and
 * "Reviewed & categorized" waited for an acknowledgment auto-reply a workspace may never send.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { TrackingPage, TRACKING_REFRESH_MS } = await import('../TrackingPage');

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type Status = 'new' | 'in_progress' | 'awaiting_response' | 'resolved' | 'filtered';
const payload = (
  status: Status,
  opts: { human?: boolean; bot?: boolean; dept?: string | null } = {}
) => {
  const human = opts.human ?? status !== 'new';
  const events = [
    {
      id: 1,
      direction: 'customer',
      isAutomated: false,
      channel: 'email',
      content: '<p>Where is my order?</p>',
      sentAt: ago(4 * HOUR),
    },
    ...(opts.bot
      ? [
          {
            id: 2,
            direction: 'agent',
            isAutomated: true,
            channel: 'email',
            content: '<p>Thanks</p>',
            sentAt: ago(4 * HOUR),
          },
        ]
      : []),
    ...(human
      ? [
          {
            id: 3,
            direction: 'agent',
            isAutomated: false,
            channel: 'email',
            content: '<p>It ships today.</p>',
            sentAt: ago(HOUR),
          },
        ]
      : []),
  ];
  return {
    success: true,
    data: {
      organization: { name: 'Acme' },
      department: { name: opts.dept === undefined ? 'Support' : opts.dept },
      conversation: {
        id: 42,
        publicId: 'SUP-42',
        subject: 'Order',
        status,
        priority: 'medium',
        createdAt: ago(4 * HOUR),
        lastReplyAt: human ? ago(HOUR) : null,
        resolvedAt: status === 'resolved' ? ago(HOUR / 2) : null,
        closedAt: null,
        slaResponseMinutes: 60,
        firstResponseAt: human ? ago(HOUR) : null,
      },
      events,
    },
  };
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/track/:orgSlug/:deptSlug/:conversationId?" element={<TrackingPage />} />
      </Routes>
    </MemoryRouter>
  );
const TOKEN_URL = '/track/acme/support/42?t=tok';

const setVisibility = (value: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  setVisibility('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('it refreshes itself (the page said it did; it fetched once)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  it('re-reads the request every interval while visible, and keeps typed text', async () => {
    get.mockResolvedValue({ data: payload('in_progress') });
    renderAt(TOKEN_URL);
    await screen.findByText("We're working on your request");
    expect(get).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'half-written reply' } });
    get.mockResolvedValue({ data: payload('awaiting_response') });
    await act(async () => {
      vi.advanceTimersByTime(TRACKING_REFRESH_MS);
      await Promise.resolve();
    });
    await screen.findByText("We've replied — over to you");
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'half-written reply');
  });

  it('does not poll a hidden tab, and refreshes the moment it becomes visible', async () => {
    get.mockResolvedValue({ data: payload('in_progress') });
    renderAt(TOKEN_URL);
    await screen.findByText("We're working on your request");
    setVisibility('hidden');
    await act(async () => {
      vi.advanceTimersByTime(TRACKING_REFRESH_MS * 3);
      await Promise.resolve();
    });
    expect(get).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('a failed refresh keeps what the customer was reading', async () => {
    get.mockResolvedValueOnce({ data: payload('in_progress') });
    renderAt(TOKEN_URL);
    await screen.findByText("We're working on your request");
    get.mockRejectedValueOnce(new Error('network'));
    await act(async () => {
      vi.advanceTimersByTime(TRACKING_REFRESH_MS);
      await Promise.resolve();
    });
    expect(screen.getByText("We're working on your request")).toBeTruthy();
    expect(screen.queryByText('Tracking link unavailable')).toBeNull();
  });

  it('CONTROL: preview mode never fetches', async () => {
    renderAt('/track/acme/support');
    await screen.findByText(/Preview mode/);
    await act(async () => {
      vi.advanceTimersByTime(TRACKING_REFRESH_MS * 2);
      await Promise.resolve();
    });
    expect(get).not.toHaveBeenCalled();
  });
});

describe('no promise the product does not keep', () => {
  const FALSE_CLAIMS = [
    /no need to refresh/i,
    /email you at each step/i,
    /copy of your reply/i,
    /channel we currently watch/i,
    /reply to your confirmation email/i,
    /this page updates as your request progresses/i,
  ];

  it.each(['new', 'in_progress', 'awaiting_response', 'resolved'] as const)(
    '%s',
    async (status) => {
      get.mockResolvedValue({ data: payload(status) });
      const { container } = renderAt(TOKEN_URL);
      await screen.findByText('Progress');
      for (const claim of FALSE_CLAIMS) expect(container.textContent ?? '').not.toMatch(claim);
      // CONTROL: the text was actually rendered — this sentence is on every state.
      expect(container.textContent).toMatch(/refreshes on its own while it's open/);
    }
  );

  it('never shows the internal word "Filtered" to the customer', async () => {
    get.mockResolvedValue({ data: payload('filtered', { human: false }) });
    const { container } = renderAt(TOKEN_URL);
    await screen.findByText('Progress');
    expect(container.textContent).not.toMatch(/filtered/i);
  });
});

describe('a resolved request can be reopened from here', () => {
  it('shows the reply box, labelled as reopening', async () => {
    get.mockResolvedValue({ data: payload('resolved') });
    renderAt(TOKEN_URL);
    expect(await screen.findByLabelText('Reply to reopen this request')).toBeTruthy();
    expect(screen.getByText(/Reply below and we'll reopen this request/)).toBeTruthy();
  });

  it('CONTROL: an open request keeps the ordinary label', async () => {
    get.mockResolvedValue({ data: payload('in_progress') });
    renderAt(TOKEN_URL);
    expect(await screen.findByLabelText('Add to this request')).toBeTruthy();
  });
});

describe('the header and the steps agree with the badge', () => {
  const stateOf = (container: HTMLElement, stage: string) =>
    container.querySelector(`[data-stage="${stage}"]`)?.getAttribute('data-state');

  it('awaiting your reply: "over to you", and that step is CURRENT, not done', async () => {
    get.mockResolvedValue({ data: payload('awaiting_response') });
    const { container } = renderAt(TOKEN_URL);
    await screen.findByText("We've replied — over to you");
    expect(screen.queryByText("We're working on your request")).toBeNull();
    expect(stateOf(container, 'awaiting')).toBe('current');
    expect(screen.getByText("We've answered and are waiting to hear from you.")).toBeTruthy();
  });

  it('CONTROL: in progress keeps its headline and no step is current', async () => {
    get.mockResolvedValue({ data: payload('in_progress') });
    const { container } = renderAt(TOKEN_URL);
    await screen.findByText("We're working on your request");
    expect(container.querySelector('[data-state="current"]')).toBeNull();
    expect(stateOf(container, 'awaiting')).toBe('pending');
  });

  it('"Reviewed & categorized" is reached on arrival when a team is known — no ack needed', async () => {
    get.mockResolvedValue({ data: payload('new', { human: false, bot: false, dept: 'Support' }) });
    const { container } = renderAt(TOKEN_URL);
    await screen.findByText('We got your message');
    expect(stateOf(container, 'reviewed')).toBe('done');
  });

  it('CONTROL: with no team, no ack and no reply it is not reached', async () => {
    get.mockResolvedValue({ data: payload('new', { human: false, bot: false, dept: null }) });
    const { container } = renderAt(TOKEN_URL);
    await screen.findByText('We got your message');
    expect(stateOf(container, 'reviewed')).toBe('pending');
  });
});
