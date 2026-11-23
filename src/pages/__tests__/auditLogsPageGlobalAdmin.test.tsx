/**
 * The REAL Audit Logs page for a global admin (2026-11-23): the route used to send a global admin
 * to the platform console, so the page itself had never been drawn for one. Its own permission
 * check and guard are the real ones here; only the data is supplied. Invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@/types';

const state = vi.hoisted(() => ({ asked: [] as unknown[], countsAsked: 0 }));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getMembers: () => Promise.resolve([]) },
}));
vi.mock('@/services/auditLog.service', () => ({
  auditLogService: {
    getAll: (filters: unknown) => {
      state.asked.push(filters);
      return Promise.resolve({
        logs: [
          {
            id: 1,
            action: 'message.auto_reply_withheld',
            entity: 'message',
            entityId: '7',
            details: { reason: 'would_send', channel: 'email', checkOnly: true },
            createdAt: '2026-11-20T10:00:00Z',
            ipAddress: null,
            userAgent: null,
            userId: null,
            userEmail: null,
          },
        ],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });
    },
    getAutoReplyCounts: () => {
      state.countsAsked += 1;
      return Promise.resolve({
        range: { startDate: '2026-11-16T00:00:00Z', endDate: '2026-11-23T00:00:00Z' },
        totals: { sent: 2, wouldSend: 1, held: 0, acknowledgments: 0 },
        byDay: [],
        byChannel: [],
        heldByReason: [],
      });
    },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { AuditLogsPage } from '../AuditLogsPage';
import { useAuditLogsStore } from '@/stores/auditLogsStore';
import { useAuthStore } from '@/stores/authStore';

const signIn = (user: Partial<User>) =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: 1, email: 'someone@example.com', ...user } as unknown as User,
  });
const show = () =>
  render(
    <MemoryRouter>
      <AuditLogsPage />
    </MemoryRouter>
  );

beforeEach(() => {
  state.asked = [];
  state.countsAsked = 0;
  useAuditLogsStore.getState().resetFilters();
});
afterEach(() => {
  cleanup();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});

describe('Audit Logs page, drawn for a global admin', () => {
  it('lists the workspace entries and opens the automatic replies view with its counts', async () => {
    signIn({ role: 'admin', organizationRole: 'org_admin' });
    show();
    await waitFor(() => expect(state.asked.length).toBeGreaterThan(0));
    expect(await screen.findByRole('heading', { name: /Audit Logs/ })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Automatic replies: sent, held and would have been sent',
      })
    );
    expect(await screen.findByTestId('auto-reply-counts')).toBeInTheDocument();
    expect(state.countsAsked).toBe(1);
  });

  it('CONTROL: a support agent, who has no view_audit_logs, gets no list and no request', async () => {
    signIn({ role: 'user', organizationRole: 'support' });
    show();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(state.asked).toEqual([]);
    expect(
      screen.queryByRole('button', {
        name: 'Automatic replies: sent, held and would have been sent',
      })
    ).toBeNull();
  });
});
