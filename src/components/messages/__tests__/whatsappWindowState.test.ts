import { describe, expect, it } from 'vitest';
import {
  resolveComposerWindow,
  type WhatsAppWindow,
} from '@/components/messages/whatsappWindowState';

/**
 * The composer's behaviour around WhatsApp's 24-hour window.
 *
 * The whole point is to tell the agent BEFORE they write. Getting this wrong either
 * blocks a legal reply or lets someone compose one that can never be delivered.
 */
const NOW = new Date('2026-08-19T12:00:00.000Z');
const inMs = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const win = (over: Partial<WhatsAppWindow>): WhatsAppWindow => ({
  open: true,
  expiresAt: inMs(20 * 60 * 60 * 1000),
  reason: 'open',
  ...over,
});

describe('resolveComposerWindow', () => {
  it('does nothing for a non-WhatsApp conversation', () => {
    // Absent window = not applicable. Every other channel must be untouched.
    expect(resolveComposerWindow(null, 'reply', NOW).blocked).toBe(false);
    expect(resolveComposerWindow(undefined, 'reply', NOW).notice).toBeNull();
  });

  it('NEVER blocks an internal note, even with the window shut', () => {
    // A note is not delivered to the customer, so the rule does not apply — and blocking
    // notes would stop an agent recording context on exactly the threads that need it.
    const state = resolveComposerWindow(win({ open: false, reason: 'expired' }), 'note', NOW);
    expect(state.blocked).toBe(false);
    expect(state.notice).toBeNull();
  });

  it('blocks when the window has expired, and says templates are the way through', () => {
    const state = resolveComposerWindow(win({ open: false, reason: 'expired' }), 'reply', NOW);
    expect(state.blocked).toBe(true);
    expect(state.notice).toContain('template');
    expect(state.tone).toBe('blocked');
  });

  it('distinguishes "customer never wrote" from "window expired"', () => {
    // Different situations, different remedies: wait for them, versus send a template.
    const state = resolveComposerWindow(win({ open: false, reason: 'no_inbound', expiresAt: null }), 'reply', NOW);
    expect(state.blocked).toBe(true);
    expect(state.notice).toContain('written to you');
    expect(state.notice).not.toContain('24-hour reply window has closed');
  });

  it('BLOCKS when the clock has passed expiry even though the server said open', () => {
    // The payload was built minutes or hours ago. Trusting the stale flag would let an
    // agent write a reply that cannot be delivered — the exact failure this removes.
    const state = resolveComposerWindow(
      win({ open: true, reason: 'open', expiresAt: inMs(-1000) }),
      'reply',
      NOW
    );
    expect(state.blocked).toBe(true);
  });

  it('warns with a countdown when the window is closing soon', () => {
    const state = resolveComposerWindow(win({ expiresAt: inMs(2 * 60 * 60 * 1000 + 30 * 60 * 1000) }), 'reply', NOW);
    expect(state.blocked).toBe(false);
    expect(state.tone).toBe('warning');
    expect(state.remaining).toBe('2h 30m');
  });

  it('CONTROL: stays quiet when there is a full day left', () => {
    // A permanent "23h left" banner is noise and trains agents to ignore the space.
    const state = resolveComposerWindow(win({ expiresAt: inMs(23 * 60 * 60 * 1000) }), 'reply', NOW);
    expect(state.tone).toBe('info');
    expect(state.notice).toBeNull();
    expect(state.blocked).toBe(false);
  });

  it('never shows "0m" while the send still works', () => {
    const state = resolveComposerWindow(win({ expiresAt: inMs(20_000) }), 'reply', NOW);
    expect(state.blocked).toBe(false);
    expect(state.remaining).toBe('1m');
  });
});
