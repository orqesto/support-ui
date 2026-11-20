/**
 * The bell shows how far over a breach is NOW, not when the server last wrote the row: since
 * 1.1.329 the row carries the wait start and is no longer rewritten every 5 minutes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SLABreachItem } from '../SLABreachItem';
import type { SLABreachNotification } from '@/hooks/useSLANotifications';

afterEach(cleanup);

const breach = (details: SLABreachNotification['details'], breachAmount: number) =>
  ({
    id: 1,
    entityId: 77,
    type: 'message',
    organizationId: 3,
    severity: 'warning',
    breachAmount,
    createdAt: '2026-11-19T10:00:00Z',
    details: { subject: 'Late reply', ...details },
    isRead: false,
  }) as unknown as SLABreachNotification;

describe('the bell counts a growing breach itself', () => {
  it('a wait that started 2 h ago against a 60 min target reads "1h over", not the stored 5m', () => {
    const waitStartedAt = new Date(Date.now() - 120 * 60_000).toISOString();
    render(
      <MemoryRouter>
        <SLABreachItem
          notification={breach({ waitStartedAt, targetMinutes: 60 }, 5)}
          onDismiss={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('1h over')).toBeTruthy();
    expect(screen.queryByText('5m over')).toBeNull();
  });

  it('CONTROL: a row without a wait start shows its stored minutes', () => {
    render(
      <MemoryRouter>
        <SLABreachItem notification={breach({ targetMinutes: 60 }, 5)} onDismiss={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText('5m over')).toBeTruthy();
  });
});
