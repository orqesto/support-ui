/**
 * The thread RESOLUTION clock (owner 2026-11-11/12, backend 0238 `slaResolutionStartedAt` /
 * `slaResolutionMinutes`): the detail header shows it beside the reply clock; the row badge and the
 * card text show the worse of the two. A backend without the fields shows no resolution clock.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { message as baseMessage, renderHeader } from './md4.header.utils';
import { computeResolutionInfo, getSlaCardText } from '../inboxCardHelpers';
import { MessageSignalBadges } from '../MessageSignalBadges';
import type { Message } from '@/types';

vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));
vi.mock('@/features/tickets/services/category.service', () => ({
  categoryService: { getCategories: () => Promise.resolve([]) },
}));
vi.mock('@/services/settings.service', () => ({
  labelService: { getLabels: () => Promise.resolve([]) },
}));

const NOW = Date.parse('2026-11-12T12:00:00Z');
const MIN = 60 * 1000;
const ago = (minutes: number) => new Date(NOW - minutes * MIN).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Answered (no reply clock running), resolution clock of 4 h started `resolutionAgo` minutes ago. */
const thread = (resolutionAgo: number | null, over: Partial<Message> = {}): Message =>
  ({
    id: 1,
    status: 'open',
    slaResponseMinutes: 60,
    slaResponseBreached: false,
    firstResponseAt: ago(290),
    lastReplyFromClient: false,
    lastReplyAt: ago(290),
    createdAt: ago(300),
    metadata: {},
    slaWaitStartedAt: null,
    slaResolutionMinutes: 240,
    slaResolutionStartedAt: resolutionAgo === null ? null : ago(resolutionAgo),
    ...over,
  }) as unknown as Message;

describe('the resolution clock', () => {
  it('an older backend (fields absent): no resolution clock, the reply clock unchanged', () => {
    const message = thread(300, {
      slaResolutionMinutes: undefined,
      slaResolutionStartedAt: undefined,
    });
    expect(computeResolutionInfo(message, NOW)).toBeNull();
    expect(getSlaCardText(message)).toBeNull();
  });

  it('5 h into a 4 h target: breached, on the chip and the card', () => {
    const message = thread(300);
    expect(computeResolutionInfo(message, NOW)).toMatchObject({
      elapsed: 300,
      target: 240,
      breached: true,
    });
    expect(getSlaCardText(message)).toEqual({
      variant: 'breach',
      label: 'Breached',
      detail: '1h over to resolve',
    });
    render(<MessageSignalBadges message={message} />);
    expect(screen.getByText('SLA')).toBeTruthy();
    cleanup();
    const { container } = render(<MessageSignalBadges message={message} mode="card" />);
    expect(container.textContent).toContain('1h over to resolve');
  });

  it('85% elapsed: at risk', () => {
    const message = thread(204);
    expect(computeResolutionInfo(message, NOW)).toMatchObject({ atRisk: true, breached: false });
    expect(getSlaCardText(message)).toMatchObject({
      variant: 'risk',
      detail: '36m left to resolve',
    });
  });

  it('a reply-clock breach outranks a resolution risk; a resolution breach outranks a reply risk', () => {
    const replyBreached = thread(204, { slaWaitStartedAt: ago(90), lastReplyFromClient: true });
    expect(getSlaCardText(replyBreached)).toMatchObject({ variant: 'breach', detail: '30m over' });
    const replyRisk = thread(300, { slaWaitStartedAt: ago(50), lastReplyFromClient: true });
    expect(getSlaCardText(replyRisk)).toMatchObject({
      variant: 'breach',
      detail: '1h over to resolve',
    });
  });

  it('a resolved or filtered thread, or no running cycle: none', () => {
    expect(computeResolutionInfo(thread(300, { status: 'resolved' }), NOW)).toBeNull();
    expect(computeResolutionInfo(thread(300, { status: 'filtered' }), NOW)).toBeNull();
    expect(computeResolutionInfo(thread(null), NOW)).toBeNull();
  });

  it('the detail header shows the Resolve chip beside the SLA chip', async () => {
    renderHeader({
      message: {
        ...baseMessage,
        status: 'open',
        slaResponseMinutes: 60,
        slaWaitStartedAt: ago(10),
        lastReplyFromClient: true,
        slaResolutionMinutes: 240,
        slaResolutionStartedAt: ago(300),
      } as Message,
    });
    const chip = await screen.findByTestId('sla-resolution-clock');
    expect(chip.textContent).toContain('Resolve');
    expect(chip.textContent).toContain('5h');
    expect(screen.getByTestId('sla-clock')).toBeTruthy();
  });

  it('the Resolve chip goes when the same thread is marked spam (newest isSpam, or confirmed in the Spam lane)', async () => {
    const open = {
      ...baseMessage,
      status: 'open',
      slaResponseMinutes: 60,
      slaWaitStartedAt: null,
      lastReplyFromClient: false,
      slaResolutionMinutes: 240,
      slaResolutionStartedAt: ago(300),
    } as Message;
    const { rerenderHeader } = renderHeader({ message: open });
    await screen.findByTestId('sla-resolution-clock');
    rerenderHeader({ message: { ...open, isSpam: true } as Message });
    expect(screen.queryByTestId('sla-resolution-clock')).toBeNull();
    rerenderHeader({ message: { ...open, isSpam: false } as Message });
    await screen.findByTestId('sla-resolution-clock');
    // Owner 2026-11-13 (one spam rule): a confirmation counts while the thread is in the Spam lane;
    // back in work with a clean newest mail, the clock runs.
    rerenderHeader({
      message: { ...open, isSpam: false, spamConfirmedAt: ago(1) } as Message,
    });
    await screen.findByTestId('sla-resolution-clock');
    rerenderHeader({
      message: { ...open, status: 'filtered', isSpam: false, spamConfirmedAt: ago(1) } as Message,
    });
    expect(screen.queryByTestId('sla-resolution-clock')).toBeNull();
  });
});

describe('getSlaCardText with a given time', () => {
  it('decides the reply clock AND the resolution clock at nowMs, not at Date.now()', () => {
    // At NOW: reply 50m of 60 (at risk), resolution 150m of 240 (fine).
    // At NOW + 20m: reply 70m (10m over), resolution 170m — so only the reply card can show.
    const message = thread(150, { slaWaitStartedAt: ago(50), lastReplyFromClient: true });
    expect(getSlaCardText(message, NOW)).toMatchObject({ variant: 'risk', detail: '10m left' });
    expect(getSlaCardText(message, NOW + 20 * MIN)).toMatchObject({
      variant: 'breach',
      detail: '10m over',
    });
    // Resolution at NOW + 100m: 250m of 240 — breached; reply also breached (wins on a tie).
    expect(getSlaCardText(message, NOW + 100 * MIN)).toMatchObject({
      variant: 'breach',
      detail: '1h 30m over',
    });
  });

  it('the older-backend reply clock (no slaWaitStartedAt field) also reads nowMs', () => {
    const message = thread(null, {
      slaWaitStartedAt: undefined,
      slaResolutionMinutes: undefined,
      slaResolutionStartedAt: undefined,
      lastReplyFromClient: true,
      lastReplyAt: ago(30),
    });
    expect(getSlaCardText(message, NOW)).toBeNull();
    expect(getSlaCardText(message, NOW + 40 * MIN)).toMatchObject({
      variant: 'breach',
      detail: '10m over',
    });
  });

  it('the row badge reads BOTH clocks at one time', () => {
    // At NOW: reply 50m of 60 (at risk), resolution 230m of 240 (at risk) → the reply's amber badge.
    // A second Date.now() 20 minutes later would read the resolution as breached (red).
    const message = thread(230, { slaWaitStartedAt: ago(50), lastReplyFromClient: true });
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(NOW)
      .mockReturnValue(NOW + 20 * MIN);
    const { container } = render(<MessageSignalBadges message={message} />);
    expect(container.querySelector('.text-warning')).toBeTruthy();
    expect(container.querySelector('.text-destructive')).toBeNull();
  });
});

describe('the header SLA record', () => {
  it('re-reads the recorded seconds when only actualResponseSeconds changes', async () => {
    const answered = {
      ...baseMessage,
      status: 'resolved',
      slaResponseMinutes: 60,
      slaWaitStartedAt: null,
      slaResponseBreached: false,
      createdAt: ago(300),
      firstResponseAt: ago(280),
      actualResponseSeconds: 18 * 60,
    } as Message;
    const { rerenderHeader } = renderHeader({ message: answered });
    expect((await screen.findByTestId('sla-record')).textContent).toContain('met');
    rerenderHeader({ message: { ...answered, actualResponseSeconds: 75 * 60 } as Message });
    expect(screen.getByTestId('sla-record').textContent).toContain('missed');
  });
});
