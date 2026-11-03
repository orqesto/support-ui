/**
 * `slack_connection_broken` lands in the bell's fail-open list. It is not a breach: it must read as
 * a Slack problem, show no "0m over", and link to Settings › Slack notifications where the admin
 * reconnects — never to /tickets/<connection id>.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { SLABreachItem } from '../SLABreachItem';
import type { SLABreachNotification } from '@/hooks/useSLANotifications';

const row = (
  type: SLABreachNotification['type'],
  details: SLABreachNotification['details']
): SLABreachNotification => ({
  id: 5,
  entityId: 12,
  type,
  organizationId: 3,
  severity: 'critical',
  breachAmount: 0,
  details,
  createdAt: '2026-11-02T10:00:00Z',
  receivedAt: 0,
  isRead: false,
});

const renderRow = (notification: SLABreachNotification) =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <SLABreachItem notification={notification} onDismiss={() => {}} />
    </MemoryRouter>
  );

describe('Slack connection broken in the bell', () => {
  it('a broken connection reads as Slack and links to Settings › Slack notifications', () => {
    renderRow(
      row('slack_connection', {
        title: 'Slack notifications stopped',
        subject:
          'Slack no longer accepts the connection (token_revoked). Connect Slack again in Settings › Notifications.',
      })
    );
    expect(screen.getAllByText('Slack notifications').length).toBeGreaterThan(0);
    expect(screen.getByText('Slack notifications stopped')).toBeInTheDocument();
    expect(screen.getByText(/token_revoked/)).toBeInTheDocument();
    expect(document.querySelector('a[href="/settings#notifications"]')).not.toBeNull();
    expect(document.querySelector('a[href^="/tickets/"]')).toBeNull();
    expect(screen.queryByText(/over$/)).toBeNull();
  });

  it('one broken channel links to the same settings page', () => {
    renderRow(
      row('slack_channel_route', {
        title: 'Slack team channel stopped',
        subject: 'Slack refused posts to #support (not_in_channel).',
      })
    );
    expect(screen.getByText('Slack team channel stopped')).toBeInTheDocument();
    expect(document.querySelector('a[href="/settings#notifications"]')).not.toBeNull();
  });

  it('control: an SLA breach still shows its overrun and links to the ticket', () => {
    renderRow({ ...row('ticket', { subject: 'Late' }), breachAmount: 30 });
    expect(screen.getByText('30m over')).toBeInTheDocument();
    expect(document.querySelector('a[href="/tickets/12"]')).not.toBeNull();
  });

  it('a channel row without a subject points at the channel, not at reconnecting', () => {
    renderRow(row('slack_channel_route', { title: 'Slack admin channel stopped' }));
    expect(
      screen.getByText('Check the Slack channel in Settings › Slack notifications.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/reconnect Slack/)).toBeNull();
  });
});
