/**
 * A7 (2026-10-14): each lookup's last result on the settings list. Fixed clock; neutral names.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LookupHealthLine, healthSentence, hostOf } from '../LookupHealthLine';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const health = (over: Record<string, unknown> = {}) =>
  ({
    lastOkAt: null,
    lastNoMatchAt: null,
    lastFailedAt: null,
    lastFailureClass: null,
    noMatchStreak: 0,
    latest: null,
    dot: 'grey',
    streakHint: false,
    ...over,
  }) as never;

const FAILING = {
  latest: 'failed',
  lastFailedAt: '2026-10-14T10:42:00.000Z',
  lastFailureClass: 'auth',
  lastFailureReason: 'HTTP 401 · bad key',
  dot: 'red',
};

const asRole = (organizationRole: 'support' | 'org_admin') =>
  useAuthStore.setState({ user: { id: 9, role: 'user', organizationRole } as User });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  asRole('org_admin');
});
afterEach(() => vi.useRealTimers());

describe('healthSentence', () => {
  it('found', () => {
    expect(
      healthSentence(
        health({ latest: 'ok', lastOkAt: '2026-10-14T10:00:00.000Z', dot: 'green' }),
        'Acme'
      )
    ).toBe('Found something 2h ago');
  });
  it('nothing found, below the threshold', () => {
    expect(healthSentence(health({ latest: 'no_match', noMatchStreak: 4 }), 'Acme')).toBe(
      'Nothing found 4 times in a row'
    );
    expect(healthSentence(health({ latest: 'no_match', noMatchStreak: 1 }), 'Acme')).toBe(
      'Nothing found 1 time in a row'
    );
  });
  it('nothing found, at the threshold → the hint', () => {
    expect(
      healthSentence(health({ latest: 'no_match', noMatchStreak: 20, streakHint: true }), 'Acme')
    ).toBe('Nothing found 20 times in a row — check the address points at the live system');
  });
  it('failing names the class’s sentence', () => {
    expect(healthSentence(health(FAILING), 'Acme')).toMatch(
      /^Failing since .+: Acme refused our access\.$/
    );
  });
  it('a lookup failing because its answer changed shape sends the agent to an admin', () => {
    const sentence = healthSentence(
      health({ ...FAILING, lastFailureClass: 'shape_changed', lastFailureReason: 'data.items' }),
      'Acme'
    );
    expect(sentence).toMatch(/^Failing since .+: This lookup needs attention from an admin\.$/);
    expect(sentence).not.toContain('data.items');
  });
  it('an unknown failure class is the generic sentence, never raw text', () => {
    expect(healthSentence(health({ ...FAILING, lastFailureClass: 'new_class' }), 'Acme')).toMatch(
      /: This lookup could not be completed\.$/
    );
  });
  it('never run, or an older backend → nothing', () => {
    expect(healthSentence(health(), 'Acme')).toBeNull();
    expect(healthSentence(undefined, 'Acme')).toBeNull();
  });
});

describe('LookupHealthLine', () => {
  it('the dot follows the backend’s verdict: green, grey, red', () => {
    const { container, rerender } = render(
      <LookupHealthLine
        connectionName="Acme"
        health={health({ latest: 'ok', lastOkAt: '2026-10-14T10:00:00.000Z', dot: 'green' })}
      />
    );
    const dotOf = () => container.querySelector('[data-dot]');
    expect(dotOf()?.getAttribute('data-dot')).toBe('green');
    expect(dotOf()?.querySelector('svg')?.getAttribute('class')).toContain('text-success');
    rerender(
      <LookupHealthLine
        connectionName="Acme"
        health={health({ latest: 'no_match', noMatchStreak: 3, dot: 'grey' })}
      />
    );
    expect(dotOf()?.getAttribute('data-dot')).toBe('grey');
    rerender(<LookupHealthLine connectionName="Acme" health={health(FAILING)} />);
    expect(dotOf()?.getAttribute('data-dot')).toBe('red');
    expect(dotOf()?.querySelector('svg')?.getAttribute('class')).toContain('text-destructive');
  });

  it('an unknown dot from a newer backend reads as grey', () => {
    const { container } = render(
      <LookupHealthLine
        connectionName="Acme"
        health={health({ latest: 'no_match', noMatchStreak: 3, dot: 'purple' })}
      />
    );
    expect(container.querySelector('[data-dot]')?.getAttribute('data-dot')).toBe('grey');
  });

  it('an admin can open the raw failure text', async () => {
    vi.useRealTimers();
    render(<LookupHealthLine connectionName="Acme" health={health(FAILING)} />);
    expect(screen.queryByText('HTTP 401 · bad key')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect(screen.getByText('HTTP 401 · bad key')).toBeInTheDocument();
  });

  it('a viewer without manage_integrations gets no Details even if a reason arrives', () => {
    asRole('support');
    render(<LookupHealthLine connectionName="Acme" health={health(FAILING)} />);
    expect(screen.queryByRole('button', { name: /Details/ })).toBeNull();
  });

  it('renders nothing for an older backend', () => {
    const { container } = render(<LookupHealthLine connectionName="Acme" health={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

it('hostOf reads the host, and survives a value that is not a URL', () => {
  expect(hostOf('https://shop.example/index.php')).toBe('shop.example');
  expect(hostOf('not a url')).toBe('not a url');
});
