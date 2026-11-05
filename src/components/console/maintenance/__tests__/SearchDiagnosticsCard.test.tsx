import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { chooseOption } from '@/test/chooseOption';

const service = vi.hoisted(() => ({ explainSearch: vi.fn(), workspaceSizes: vi.fn() }));
vi.mock('@/services/searchDiagnostics.service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, default: service };
});
vi.mock('@/hooks/usePlatformAdmin', () => ({
  usePlatformWorkspaces: () => ({
    isLoading: false,
    data: { data: [{ id: 9, name: 'Example Workspace' }] },
  }),
}));

import { SearchDiagnosticsCard } from '../SearchDiagnosticsCard';
import { normaliseSizes } from '@/services/searchDiagnostics.service';

const pickWorkspace = () =>
  chooseOption(
    document.getElementById('search-diagnostics-workspace') as HTMLElement,
    'Example Workspace'
  );

beforeEach(() => {
  service.explainSearch.mockReset();
  service.workspaceSizes.mockReset();
});
afterEach(cleanup);

describe('SearchDiagnosticsCard', () => {
  it('runs nothing until a workspace and words are given', () => {
    render(<SearchDiagnosticsCard />);
    expect(screen.getByRole('button', { name: 'Explain search' })).toBeInactive();
    expect(screen.getByRole('button', { name: 'Workspace sizes' })).toBeInactive();
  });

  it('explains a search: the request, the summary, one row per explained statement, plan on demand', async () => {
    service.explainSearch.mockResolvedValue({
      kind: 'ok',
      data: {
        search: {
          ms: 3124,
          rows: 0,
          total: 0,
          totalCapped: true,
          countTimedOut: true,
          timedOut: true,
          walk: 'walked',
          scopeKnown: false,
        },
        statements: [
          { query: 'SET LOCAL statement_timeout = 3000', params: [], skipped: 'not a read' },
          {
            query: 'WITH newest AS (SELECT conversations.id FROM conversations)',
            params: [],
            plan: 'Limit (cost=1..2)\nExecution Time: 2987.120 ms',
            ms: 3001,
          },
        ],
        note: 'Statements carrying a searched word.',
      },
    });
    render(<SearchDiagnosticsCard />);
    await pickWorkspace();
    fireEvent.change(screen.getByLabelText('Search words'), { target: { value: ' tracking ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Explain search' }));

    const result = await screen.findByTestId('search-explain-result');
    expect(service.explainSearch).toHaveBeenCalledWith({
      organizationId: 9,
      search: 'tracking',
      lifecycle: 'needs_us',
    });
    expect(result.textContent).toContain('3,124 ms');
    expect(result.textContent).toContain('total unknown (timed out)');
    expect(result.textContent).toContain('page timed out');
    expect(result.textContent).toContain('path: walked');
    // The SET was not a read: only the explained statement is listed.
    const rows = within(result).getAllByTestId('explained-statement');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('2987.120 ms');
    expect(screen.queryByLabelText('Plan of statement 1')).toBeNull();
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Plan' }));
    expect(screen.getByLabelText('Plan of statement 1').textContent).toContain(
      'Execution Time: 2987.120 ms'
    );
  });

  it('says so when this backend has no diagnostics yet, and when it is busy', async () => {
    service.explainSearch.mockResolvedValueOnce({ kind: 'unavailable' });
    render(<SearchDiagnosticsCard />);
    await pickWorkspace();
    fireEvent.change(screen.getByLabelText('Search words'), { target: { value: 'tracking' } });
    fireEvent.click(screen.getByRole('button', { name: 'Explain search' }));
    expect(await screen.findByText(/no search diagnostics yet/)).toBeTruthy();

    service.explainSearch.mockResolvedValueOnce({
      kind: 'busy',
      message: 'One search explain per minute. Try again shortly.',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Explain search' }));
    expect(
      await screen.findByText('One search explain per minute. Try again shortly.')
    ).toBeTruthy();
  });

  it('shows workspace sizes', async () => {
    service.workspaceSizes.mockResolvedValue({
      kind: 'ok',
      data: {
        threads: 12000,
        messages: 36000,
        messagesPerThread: { p50: 3, p95: 5, max: 5, sampled: 2000 },
        bodyBytes: { p50: 1547, p95: 1617, max: 1681, sampled: 5000 },
        wordListBytes: { p50: 1809, p95: 1917, max: 2040, sampled: 5000 },
        resolvedOver90DaysShare: 0.69,
        tables: {
          conversations: { bytes: 217399296, rowsEstimate: 12010 },
          messageEvents: { bytes: 2771140608, rowsEstimate: 36050 },
        },
        wordListsMissing: 42,
        searchIndexes: [
          {
            name: 'message_events_content_words_stored_idx',
            exists: true,
            valid: true,
            bytes: 52428800,
          },
          { name: 'conversations_org_activity_idx', exists: false, valid: null, bytes: null },
          { name: 'comments_message_id_idx', exists: true, valid: false, bytes: 8192 },
        ],
        tableStats: [{ table: 'comments', liveRows: 7600, lastAnalyze: null }],
      },
    });
    render(<SearchDiagnosticsCard />);
    await pickWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Workspace sizes' }));
    const sizes = await screen.findByTestId('workspace-sizes-result');
    expect(service.workspaceSizes).toHaveBeenCalledWith(9);
    expect(sizes.textContent).toContain('12,000 / 36,000');
    expect(sizes.textContent).toContain('1.5 KB');
    expect(sizes.textContent).toContain('69%');
    expect(sizes.textContent).toContain('2.6 GB');
    expect(sizes.textContent).toContain('Messages without a stored word list42');
    // Each index says whether search can use it.
    const stateOf = (name: string) => screen.getByText(name).nextElementSibling?.textContent;
    expect(stateOf('message_events_content_words_stored_idx')).toBe('valid50.0 MB');
    expect(stateOf('conversations_org_activity_idx')).toBe('missing');
    expect(stateOf('comments_message_id_idx')).toBe('invalid8.0 KB');
    expect(sizes.textContent).toContain('7,600 rows, analysed never');
  });

  it('an older backend without index status still shows the sizes', () => {
    const sizes = normaliseSizes({ threads: 5, messages: 7, tables: {} });
    expect(sizes.searchIndexes).toEqual([]);
    expect(sizes.tableStats).toEqual([]);
    expect(sizes.wordListsMissing).toBeNull();
  });
});
