/**
 * An SLA item of a website chat whose visitor left no email: where the item falls back to the
 * sender (no title, no subject) it reads "Website visitor (no email)", never the placeholder.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SLABreachItem } from '../SLABreachItem';
import type { SLABreachNotification } from '@/hooks/useSLANotifications';

const breach = (sender: string) =>
  ({
    id: 1,
    entityId: 77,
    type: 'conversation',
    organizationId: 3,
    severity: 'warning',
    breachAmount: 30,
    createdAt: '2026-10-23T10:00:00Z',
    details: { sender },
    isRead: false,
  }) as unknown as SLABreachNotification;

const show = (sender: string) =>
  render(
    <MemoryRouter>
      <SLABreachItem notification={breach(sender)} onDismiss={() => {}} />
    </MemoryRouter>
  );

describe('SLA item of a website visitor with no email', () => {
  it('names the visitor and never prints the placeholder', () => {
    show('anonymous@chat-widget.local');
    expect(screen.getByText('Website visitor (no email)')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('chat-widget.local');
  });

  it('CONTROL: a real address is shown', () => {
    show('ada@example.com');
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });
});
