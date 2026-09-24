/**
 * The By workspace card: nothing at all on a backend without the endpoint (not "all healthy"),
 * problems first, the cap's caption when it bit, and Details showing the mailbox in the same words
 * the workspace admin sees.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { WorkspaceHealthReport, WorkspaceHealthRow } from '@/services/platform.service';

let hookResult: {
  isLoading: boolean;
  isError: boolean;
  data: WorkspaceHealthReport | null | undefined;
  refetch: () => void;
} = { isLoading: false, isError: false, data: undefined, refetch: vi.fn() };
vi.mock('@/hooks/usePlatformAdmin', () => ({ usePlatformWorkspaceHealth: () => hookResult }));

import { WorkspaceHealthCard } from '../WorkspaceHealthCard';

const jobs = { queued: 0, active: 0, delayed: 0, failed: 0, oldestQueuedAt: null, byQueue: {} };
const row = (over: Partial<WorkspaceHealthRow>): WorkspaceHealthRow => ({
  organizationId: 1,
  name: 'Quiet',
  active: true,
  jobs,
  mailboxes: [],
  mailboxError: null,
  ...over,
});
const report = (over: Partial<WorkspaceHealthReport> = {}): WorkspaceHealthReport => ({
  generatedAt: '',
  perStateCap: 1000,
  truncated: [],
  unattributed: null,
  workspaces: [
    row({ organizationId: 1, name: 'Quiet' }),
    row({
      organizationId: 20,
      name: 'Odly',
      jobs: { ...jobs, queued: 3, byQueue: { 'ai-analysis': { queued: 3, active: 0, delayed: 0, failed: 0 } } },
      mailboxes: [
        {
          sourceId: 3,
          name: 'Email-team@odly.ai',
          type: 'email',
          enabled: true,
          lastCheckAt: null,
          hold: { reason: 'unreachable', since: null, retryInMs: 600_000 },
          openAlerts: { gap: 0, dark: 0 },
        },
      ],
    }),
  ],
  ...over,
});

afterEach(() => {
  cleanup();
});

describe('WorkspaceHealthCard', () => {
  it('renders nothing on a backend without the endpoint', () => {
    hookResult = { ...hookResult, data: null };
    const { container } = render(<WorkspaceHealthCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the workspace with a mailbox problem first', () => {
    hookResult = { ...hookResult, data: report() };
    render(<WorkspaceHealthCard />);
    const names = screen.getAllByText(/^(Quiet|Odly)$/).map((node) => node.textContent);
    expect(names).toEqual(['Odly', 'Quiet']);
    expect(screen.getByText('1 of 1 with a problem')).toBeInTheDocument();
    expect(screen.queryByText(/lower bound/)).not.toBeInTheDocument();
  });

  it('says the counts are a floor when the cap bit', () => {
    hookResult = {
      ...hookResult,
      data: report({ truncated: [{ queue: 'process-kb-message', state: 'wait', total: 2534, read: 1000 }] }),
    };
    render(<WorkspaceHealthCard />);
    expect(screen.getByText(/lower bound.*process-kb-message wait: first 1000 of 2534/)).toBeInTheDocument();
  });

  it('Details shows the queue and the mailbox in the Settings › Integrations wording', () => {
    hookResult = { ...hookResult, data: report() };
    render(<WorkspaceHealthCard />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('ai-analysis')).toBeInTheDocument();
    expect(within(dialog).getByText('Not syncing — cannot reach the mail server')).toBeInTheDocument();
    expect(within(dialog).getByText(/retrying in 10 minutes/)).toBeInTheDocument();
  });

  it('marks a deactivated workspace, which otherwise looks like a live one', () => {
    hookResult = { ...hookResult, data: report({ workspaces: [row({ active: false })] }) };
    render(<WorkspaceHealthCard />);
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });

  it('a workspace whose mailboxes could not be read says so, it does not look empty', () => {
    hookResult = { ...hookResult, data: report({ workspaces: [row({ mailboxError: 'DB_SUSPENDED' })] }) };
    render(<WorkspaceHealthCard />);
    expect(screen.getByText('Mailboxes unreadable')).toBeInTheDocument();
  });
});
