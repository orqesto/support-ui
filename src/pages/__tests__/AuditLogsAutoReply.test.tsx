/**
 * Audit Logs can answer "what replied on its own, what was held, and why": the action filter
 * offers the two records an automatic reply leaves, and their rows say — without opening the raw
 * record — what happened, who wrote it (the AI or which keyword rule) and link to the thread.
 * The real page; only its data is supplied. Invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { chooseOption, listOptions } from '@/test/chooseOption';

const state = vi.hoisted(() => ({ logs: [] as unknown[], asked: [] as unknown[] }));
vi.mock('@/services/auditLog.service', () => ({
  auditLogService: {
    getAll: (filters: unknown) => {
      state.asked.push(filters);
      return Promise.resolve({
        logs: state.logs,
        pagination: { page: 1, limit: 50, total: state.logs.length, totalPages: 1 },
      });
    },
  },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getMembers: () => Promise.resolve([]) },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true }),
}));
vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { AuditLogsPage } from '../AuditLogsPage';
import { useAuditLogsStore } from '@/stores/auditLogsStore';

const log = (id: number, action: string, entityId: number, details: Record<string, unknown>) => ({
  id,
  action,
  entity: 'message',
  entityId: String(entityId),
  details,
  createdAt: '2026-11-20T10:00:00Z',
  ipAddress: null,
  userAgent: null,
  userId: null,
  userEmail: null,
});
const SENT = 'message.auto_reply_sent';
const HELD = 'message.auto_reply_withheld';

const show = async (logs: unknown[]) => {
  state.logs = logs;
  render(
    <MemoryRouter>
      <AuditLogsPage />
    </MemoryRouter>
  );
  await waitFor(() => expect(state.asked.length).toBeGreaterThan(0));
};
/** The row's readable part: the card and the table both draw it (shown by breakpoint). */
const rows = () => screen.findAllByTestId('audit-auto-reply');

beforeEach(() => {
  state.logs = [];
  state.asked = [];
  useAuditLogsStore.getState().resetFilters();
  useAuditLogsStore.getState().setLogs([]);
});
afterEach(cleanup);

describe('Audit Logs — automatic replies', () => {
  it('the action filter offers both records and asks the backend for the chosen one', async () => {
    await show([]);
    const filter = screen.getByRole('combobox', { name: 'Filter by action' });
    const options = await listOptions(filter);
    expect(options).toContain('Automatic reply → Sent');
    expect(options).toContain('Automatic reply → Held or not sent');
    await chooseOption(filter, 'Automatic reply → Held or not sent');
    await waitFor(() =>
      expect(state.asked.some((asked) => (asked as { action?: string }).action === HELD)).toBe(true)
    );
  });

  it('a keyword rule’s reply: the rule, its keyword, and a link to the thread', async () => {
    await show([
      log(1, SENT, 55, {
        source: 'keyword_rule',
        toStatus: 'resolved',
        ruleId: 3,
        ruleName: 'Refunds',
        keyword: 'refund',
      }),
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain('Auto-reply sent by rule "Refunds" (keyword "refund")');
    expect(row.textContent).toContain('Written by: Keyword rule "Refunds"');
    expect(within(row).getByRole('link', { name: 'Open thread' })).toHaveAttribute(
      'href',
      '/threads/55'
    );
    expect(screen.getAllByText('Automatic reply → Sent').length).toBeGreaterThan(0);
  });

  it('the AI’s reply and the AI’s question are told apart', async () => {
    await show([
      log(1, SENT, 56, { source: 'ai', toStatus: 'open' }),
      log(2, SENT, 57, { source: 'missing_info', toStatus: 'open' }),
    ]);
    const texts = (await rows()).map((row) => row.textContent ?? '');
    expect(
      texts.some((text) => text.includes('AI auto-reply sent') && text.includes('Written by: AI ·'))
    ).toBe(true);
    expect(
      texts.some((text) => text.includes('Written by: AI — question for missing details'))
    ).toBe(true);
  });

  it('a held AI reply says why, in words, with the backend’s own sentence', async () => {
    await show([
      log(1, HELD, 58, {
        source: 'ai_reply',
        reason: 'promises_follow_up',
        ruleIds: [],
        ruleNames: [],
        detail: 'The check every automatic reply passes held this reply.',
      }),
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain(
      'The automatic reply was not sent: the reply promised a follow-up'
    );
    expect(row.textContent).toContain('The check every automatic reply passes held this reply.');
    expect(row.textContent).toContain('Written by: AI');
    expect(row.textContent).not.toContain('promises_follow_up');
    expect(within(row).getByRole('link', { name: 'Open thread' })).toHaveAttribute(
      'href',
      '/threads/58'
    );
  });

  it('a held keyword reply names its rules', async () => {
    await show([
      log(1, HELD, 59, {
        reason: 'several_rules',
        ruleIds: [3, 4],
        ruleNames: ['Refunds', 'Returns'],
      }),
    ]);
    const [row] = await rows();
    expect(row.textContent).toContain('Written by: Keyword rules "Refunds", "Returns"');
    expect(row.textContent).toMatch(/No auto-reply: rules .* both matched/);
  });

  it('CONTROL: another record gets no such line and keeps its own badge', async () => {
    await show([log(1, 'message.update', 60, { status: 'open' })]);
    expect((await screen.findAllByText('Message → Update')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('audit-auto-reply')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open thread' })).toBeNull();
  });
});
