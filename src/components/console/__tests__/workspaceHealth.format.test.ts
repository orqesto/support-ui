/**
 * Console › System › By workspace — the words (parity with what the workspace admin already sees)
 * and the order (problems first). Nothing may read as "healthy": the backend only knows of holds,
 * standing alerts and the last completed check.
 */
import { describe, it, expect } from 'vitest';
import { HOLD_LABEL } from '@/components/settings/integrations/syncHold';
import type {
  WorkspaceHealthReport,
  WorkspaceHealthRow,
  WorkspaceMailbox,
} from '@/services/platform.service';
import {
  mailboxState,
  oldestWaiting,
  queueBreakdown,
  sortWorkspaces,
  truncationNote,
  workspaceProblems,
} from '../workspaceHealth.format';

const NOW = Date.UTC(2026, 8, 24, 12, 0);
const mailbox = (over: Partial<WorkspaceMailbox> = {}): WorkspaceMailbox => ({
  sourceId: 3,
  name: 'Email-team@odly.ai',
  type: 'email',
  enabled: true,
  lastCheckAt: new Date(NOW - 3 * 60_000).toISOString(),
  hold: null,
  openAlerts: { gap: 0, dark: 0 },
  ...over,
});
const row = (over: Partial<WorkspaceHealthRow> = {}): WorkspaceHealthRow => ({
  organizationId: 1,
  name: 'Odly',
  active: true,
  jobs: { queued: 0, active: 0, delayed: 0, failed: 0, oldestQueuedAt: null, byQueue: {} },
  mailboxes: [],
  mailboxError: null,
  ...over,
});

describe('mailboxState', () => {
  it('words a hold exactly as the Settings › Integrations badge does, with when it retries', () => {
    const state = mailboxState(
      mailbox({
        hold: { reason: 'unreachable', since: NOW - 20 * 60_000, retryInMs: 10 * 60_000 },
      }),
      NOW
    );
    expect(state.label).toBe(HOLD_LABEL.unreachable);
    expect(state.tone).toBe('warning');
    expect(state.detail).toBe(
      'since 20 min ago · retrying in 10 minutes · last completed check 3 min ago'
    );
    expect(state.problem).toBe(true);
  });

  it('a rejected sign-in is the loud one, and its error samples come through', () => {
    const state = mailboxState(
      mailbox({
        hold: {
          reason: 'auth_failed',
          since: null,
          retryInMs: null,
          errors: [{ message: 'AUTHENTICATIONFAILED', count: 3 }],
        },
      }),
      NOW
    );
    expect(state.label).toBe(HOLD_LABEL.auth_failed);
    expect(state.tone).toBe('danger');
    expect(state.errors).toEqual([{ message: 'AUTHENTICATIONFAILED', count: 3 }]);
  });

  it('uses the bell titles for standing alerts', () => {
    expect(mailboxState(mailbox({ openAlerts: { gap: 0, dark: 1 } }), NOW).label).toBe(
      'Mailbox not being polled'
    );
    const gap = mailboxState(mailbox({ openAlerts: { gap: 2, dark: 0 } }), NOW);
    expect(gap.label).toBe('Mail may be missing');
    expect(gap.detail).toBe('2 open alerts · last completed check 3 min ago');
  });

  it('never claims "healthy" — only that no problem was reported', () => {
    const state = mailboxState(mailbox(), NOW);
    expect(state.label).toBe('No problem reported');
    expect(state.problem).toBe(false);
    expect(mailboxState(mailbox({ lastCheckAt: null }), NOW).detail).toBe(
      'never completed a check'
    );
  });

  it('a disabled mailbox is not a problem', () => {
    expect(
      mailboxState(mailbox({ enabled: false, openAlerts: { gap: 0, dark: 1 } }), NOW)
    ).toMatchObject({
      label: 'Disabled',
      problem: false,
    });
  });
});

describe('ordering and counts', () => {
  it('puts the workspace with problems first, then the busiest', () => {
    const quiet = row({ organizationId: 1, name: 'A quiet' });
    const busy = row({ organizationId: 2, name: 'B busy', jobs: { ...quiet.jobs, queued: 50 } });
    const broken = row({
      organizationId: 3,
      name: 'C broken',
      mailboxes: [mailbox({ openAlerts: { gap: 0, dark: 1 } })],
    });
    const failing = row({
      organizationId: 4,
      name: 'D failing',
      jobs: { ...quiet.jobs, failed: 1 },
    });
    const unreadable = row({
      organizationId: 5,
      name: 'E unreadable',
      mailboxError: 'DB_SUSPENDED',
    });
    const sorted = sortWorkspaces([quiet, busy, broken, failing, unreadable], NOW).map(
      (entry) => entry.organizationId
    );
    expect(sorted.slice(0, 3).sort()).toEqual([3, 4, 5]);
    expect(sorted.slice(3)).toEqual([2, 1]);
    expect(workspaceProblems(quiet, NOW)).toBe(0);
  });

  it('the oldest waiting job reads as an age, or a dash', () => {
    expect(oldestWaiting(row(), NOW)).toBe('—');
    expect(
      oldestWaiting(row({ jobs: { ...row().jobs, oldestQueuedAt: NOW - 12 * 60_000 } }), NOW)
    ).toBe('12 min');
  });

  it('breaks a workspace down by the queues it has jobs in, busiest first', () => {
    const jobs = {
      ...row().jobs,
      byQueue: {
        notify: { queued: 0, active: 0, delayed: 0, failed: 0 },
        'ai-analysis': { queued: 1, active: 1, delayed: 0, failed: 0 },
        'process-kb-message': { queued: 9, active: 0, delayed: 0, failed: 1 },
      },
    };
    expect(queueBreakdown(row({ jobs })).map((queue) => queue.name)).toEqual([
      'process-kb-message',
      'ai-analysis',
    ]);
  });
});

describe('truncationNote', () => {
  const report = (truncated: WorkspaceHealthReport['truncated']): WorkspaceHealthReport => ({
    generatedAt: '',
    perStateCap: 1000,
    truncated,
    workspaces: [],
    unattributed: null,
  });

  it('says nothing when everything was read', () => {
    expect(truncationNote(report([]))).toBeNull();
  });

  it('says the counts are a floor, and where', () => {
    expect(
      truncationNote(
        report([{ queue: 'process-kb-message', state: 'wait', total: 2534, read: 1000 }])
      )
    ).toBe(
      'Only part of these jobs was read, so the counts are a lower bound and the oldest waiting age may be too young: process-kb-message wait: first 1000 of 2534.'
    );
  });
});
