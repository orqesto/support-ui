/**
 * A Gmail mailbox held down because Google rejected its sign-in shows "Not syncing — sign-in
 * rejected" AND a Reconnect button next to it (review 2026-11-03): the badge alone sent the admin
 * looking for the row menu.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SourceRowBadges } from '@/features/settings/components/integrations/SourceRowBadges';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);
const held = (reason: 'auth_failed' | 'unreachable') => ({
  syncHold: { reason, retryInMs: 3_600_000, since: Date.now() },
});

afterEach(cleanup);

describe('SourceRowBadges — Reconnect beside a rejected sign-in', () => {
  it('auth_failed + a reconnect handler ⇒ the button, which calls it', () => {
    const onReconnect = vi.fn();
    render(<SourceRowBadges source={held('auth_failed')} onReconnect={onReconnect} />);
    expect(screen.getByText('Not syncing — sign-in rejected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: no handler (an IMAP row, fixed by its credentials) ⇒ the badge only', () => {
    render(<SourceRowBadges source={held('auth_failed')} />);
    expect(screen.getByText('Not syncing — sign-in rejected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
  });

  it('CONTROL: any other hold ⇒ no Reconnect', () => {
    render(<SourceRowBadges source={held('unreachable')} onReconnect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
  });
});
