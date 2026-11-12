/**
 * A thread's RESOLUTION breach (backend 0238, entity type `message_resolution`) is a thread SLA
 * row: it follows the thread SLA line, is labelled as a resolution breach and links to the thread
 * (an unknown type used to fall through to /tickets/<id>).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { matchesPrefs, type SLABreachNotification, type UserPrefs } from '../useSLANotifications';
import { SLABreachItem, typeLabel } from '@/components/layout/SLABreachItem';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));

const prefs = (overrides: Partial<UserPrefs> = {}): UserPrefs => ({
  minSeverity: 'warning',
  notifyMessages: true,
  notifyTicketFirstResponse: true,
  notifyTicketResolution: true,
  onlyAssignedToMe: false,
  ...overrides,
});

const breach = {
  id: 9,
  entityId: 42,
  type: 'message_resolution',
  organizationId: 1,
  severity: 'critical',
  breachAmount: 60,
  details: {
    subject: 'Where is my order',
    sender: 'customer@example.com',
    targetMinutes: 240,
    actualMinutes: 300,
  },
  createdAt: '2026-11-12T10:00:00.000Z',
  receivedAt: 0,
} as unknown as SLABreachNotification;

describe('thread resolution breaches in the bell and the breach list', () => {
  beforeEach(() => get.mockReset());

  it('follows the thread SLA line: hidden when thread SLA alerts are off', () => {
    expect(matchesPrefs(breach, prefs())).toBe(true);
    expect(matchesPrefs(breach, prefs({ notifyMessages: false }))).toBe(false);
    expect(
      matchesPrefs(breach, prefs(), [{ key: 'kind:sla_message_breach', value: false } as never])
    ).toBe(false);
  });

  it('is labelled a thread resolution breach and links to the thread, never /tickets', () => {
    expect(typeLabel('message_resolution')).toBe('Thread — Resolution');
    render(
      <MemoryRouter>
        <SLABreachItem notification={breach} onDismiss={() => undefined} />
      </MemoryRouter>
    );
    const link = screen.getAllByRole('link')[0];
    expect(link.getAttribute('href')).toBe('/threads/42');
  });
});
