/**
 * The import report says how many threads kept their Odly status because the customer wrote after
 * the ticket's last Zendesk message (backend `customerMailKept`); CONTROL: no such threads, no line.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ZendeskRun } from '@/services/zendeskImport.service';
import { previewedRun } from './zendeskImportFixtures';

const { ZendeskImportReport } = await import('../ZendeskImportReport');

afterEach(cleanup);

const applied = (counts: Record<string, number>) =>
  ({
    ...previewedRun,
    status: 'applied',
    report: { counts, tickets: 10, failures: [], conflicts: [], unmatchedAssignees: {} },
  }) as unknown as ZendeskRun;

describe('Zendesk import report: threads the customer answered after Zendesk', () => {
  it('counts them — CONTROL: none, no line', () => {
    render(
      <ZendeskImportReport run={applied({ mapped: 10, customerMailKept: 3 })} onAct={vi.fn()} />
    );
    expect(
      screen.getByText(/3 threads keep their Odly status — the customer wrote/)
    ).toBeInTheDocument();
    cleanup();

    render(<ZendeskImportReport run={applied({ mapped: 10 })} onAct={vi.fn()} />);
    expect(screen.queryByText(/the customer wrote/)).not.toBeInTheDocument();
  });
});
