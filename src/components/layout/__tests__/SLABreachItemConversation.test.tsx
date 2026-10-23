/**
 * The backend's newer SLA entity types: a `conversation` breach is a thread's — labelled and linked
 * as one, never "Notification" with a link to /tickets/<thread id>.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SLABreachItem, typeLabel } from '../SLABreachItem';
import type { SLABreachNotification } from '@/hooks/useSLANotifications';

const breach = (type: SLABreachNotification['type']) =>
  ({
    id: 1,
    entityId: 77,
    type,
    organizationId: 3,
    severity: 'warning',
    breachAmount: 30,
    createdAt: '2026-10-23T10:00:00Z',
    details: { subject: 'Late reply' },
    isRead: false,
  }) as unknown as SLABreachNotification;

describe('SLA breach of the newer entity types', () => {
  it('labels a conversation breach as a thread and a ticket breach as a ticket', () => {
    expect(typeLabel('conversation')).toBe('Thread SLA');
    expect(typeLabel('ticket')).toBe('Ticket SLA');
  });

  it('links a conversation breach to the thread, a ticket breach to the ticket', () => {
    const { unmount } = render(
      <MemoryRouter>
        <SLABreachItem notification={breach('conversation')} onDismiss={() => {}} />
      </MemoryRouter>
    );
    expect(document.querySelector('a[href="/threads/77"]')).not.toBeNull();
    unmount();
    render(
      <MemoryRouter>
        <SLABreachItem notification={breach('ticket')} onDismiss={() => {}} />
      </MemoryRouter>
    );
    expect(document.querySelector('a[href="/tickets/77"]')).not.toBeNull();
    expect(screen.getAllByText('Ticket SLA').length).toBeGreaterThan(0);
  });
});
