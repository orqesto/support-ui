/**
 * `auto_reply_check_unreadable` (the reply check could not be read, so automatic replies are being
 * held) lands in the bell's fail-open list. It is not a breach: it reads as an automatic-replies
 * problem with the backend's own title, shows no "…m over", and links to the AI settings — never
 * to /tickets/<workspace id>.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SLABreachItem } from '../SLABreachItem';
import type { SLABreachNotification } from '@/hooks/useSLANotifications';

const TITLE =
  'The reply check could not be read 5 times in the last hour — automatic replies are being held';
const row = (type: string, details: Record<string, unknown>) =>
  ({
    id: 5,
    entityId: 3,
    type,
    organizationId: 3,
    severity: 'critical',
    breachAmount: 0,
    details,
    createdAt: '2026-11-23T10:00:00Z',
    receivedAt: 0,
    isRead: false,
  }) as unknown as SLABreachNotification;
const show = (notification: SLABreachNotification) =>
  render(
    <MemoryRouter>
      <SLABreachItem notification={notification} onDismiss={() => {}} />
    </MemoryRouter>
  );

describe('the unreadable reply check in the bell', () => {
  it('reads as an automatic-replies problem, with no overrun, and links to the AI settings', () => {
    show(
      row('auto_reply_check', {
        title: TITLE,
        count: 5,
        windowMinutes: 60,
        lastReason: 'reply_unchecked',
      })
    );
    expect(screen.getByText('Automatic replies')).toBeInTheDocument();
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText(/kept as drafts for a person, not sent/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/over|reply_unchecked/);
    expect(screen.getByRole('link', { name: 'Automatic replies' })).toHaveAttribute(
      'href',
      '/settings#ai'
    );
  });

  it('CONTROL: a thread breach keeps its overrun and its thread link', () => {
    show(row('conversation', { subject: 'Late reply', minutesOverdue: 30 }));
    expect(screen.getByRole('link', { name: 'Thread SLA' })).toHaveAttribute('href', '/threads/3');
    expect(document.body.textContent).toMatch(/over/);
  });
});
