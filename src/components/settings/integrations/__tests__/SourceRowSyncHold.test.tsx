/**
 * A mailbox that is not syncing has to say so on its own row.
 *
 * `mailto:` in an IMAP username failed authentication, held the source down for an hour at
 * a time, and every surface reported success — the card renders from the `message_sources`
 * row and the hold-down lives in redis, so the row had nothing to render.
 *
 * 🔑 The control is the LAST test: a source with no `syncHold` field must render NOTHING.
 * The field is absent on any backend older than the release that added it (BE ships on a
 * tag, this deploys on push), and drawing "healthy" from "no information" is the exact
 * class of bug this whole change exists to remove.
 */
import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SourceRowBadges } from '@/components/settings/integrations/SourceRowBadges';
import {
  describeHold,
  formatRetry,
  holdSeverity,
  HOLD_LABEL,
} from '@/components/settings/integrations/syncHold';
import { normalizeSyncHold } from '@/services/integrations.service';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

describe('formatRetry', () => {
  it('rounds to whole minutes and gets the plural right', () => {
    expect(formatRetry(60_000)).toBe('in 1 minute');
    expect(formatRetry(42 * 60_000)).toBe('in 42 minutes');
  });

  it('splits an hour-long hold into hours and minutes', () => {
    expect(formatRetry(60 * 60_000)).toBe('in 1 hour');
    expect(formatRetry(65 * 60_000)).toBe('in 1 hour 5 min');
  });

  // 🪤 A null countdown is not zero. Rendering "in 0 minutes" would be a timer that never moves.
  it('says "shortly" rather than inventing a zero', () => {
    expect(formatRetry(null)).toBe('shortly');
    expect(formatRetry(undefined)).toBe('shortly');
    expect(formatRetry(0)).toBe('shortly');
    expect(formatRetry(-5)).toBe('shortly');
  });

  it('does not round a few seconds down to nothing', () => {
    expect(formatRetry(5_000)).toBe('in under a minute');
  });
});

describe('holdSeverity', () => {
  // A rejected sign-in will never fix itself; everything else might.
  it('is loud only for the failure a human has to go and fix', () => {
    expect(holdSeverity('auth_failed')).toBe('danger');
    expect(holdSeverity('unreachable')).toBe('warning');
    expect(holdSeverity('run_failures')).toBe('warning');
    expect(holdSeverity('unknown')).toBe('warning');
  });
});

describe('normalizeSyncHold', () => {
  it('keeps a well-formed hold', () => {
    expect(normalizeSyncHold({ reason: 'auth_failed', retryInMs: 1_000, since: 5 })).toEqual({
      reason: 'auth_failed',
      retryInMs: 1_000,
      since: 5,
    });
  });

  // ⛔ CONTROL — the version-skew case. An older backend sends no field at all.
  it('reports nothing for a backend that does not send the field', () => {
    expect(normalizeSyncHold(undefined)).toBeNull();
    expect(normalizeSyncHold(null)).toBeNull();
  });

  it('survives a reason a newer backend invented', () => {
    expect(normalizeSyncHold({ reason: 'sunspots', retryInMs: 1 })?.reason).toBe('unknown');
  });

  it('refuses a non-positive countdown instead of passing it to the formatter', () => {
    expect(normalizeSyncHold({ reason: 'unreachable', retryInMs: -2 })?.retryInMs).toBeNull();
  });
});

describe('describeHold', () => {
  it('says what is wrong and when it will be tried again', () => {
    expect(describeHold({ reason: 'auth_failed', retryInMs: 42 * 60_000, since: null })).toBe(
      'Not syncing — sign-in rejected. Retrying in 42 minutes.'
    );
  });
});

describe('SourceRowBadges', () => {
  it('says a source is not syncing, and why', () => {
    render(
      <SourceRowBadges
        source={{ syncHold: { reason: 'auth_failed', retryInMs: 42 * 60_000, since: null } }}
      />
    );
    expect(screen.getByText(HOLD_LABEL.auth_failed)).toBeInTheDocument();
  });

  it('renders a held-down Gmail row the same way — both channels can be held down', () => {
    render(
      <SourceRowBadges
        source={{ syncHold: { reason: 'unreachable', retryInMs: null, since: null } }}
      />
    );
    expect(screen.getByText(HOLD_LABEL.unreachable)).toBeInTheDocument();
  });

  // ⛔ THE CONTROL. No information must draw nothing at all.
  it('says NOTHING about syncing when there is no hold to report', () => {
    const { container } = render(<SourceRowBadges source={{ isKnowledgeBase: true }} />);
    expect(container.textContent).not.toContain('Not syncing');
    // ...and the row still renders what it does know.
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
  });
});
