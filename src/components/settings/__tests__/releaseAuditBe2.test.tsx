/**
 * Release audit, the newer BE contracts:
 * - D-L1: /api/organizations/ai-usage carries `freeAllowance`, `unavailableReason` and (inactive)
 *   a status line — a paused Free workspace reads paused, never "own key, OK".
 * - Zendesk (D3-F5/F10/F12): attachments stopped by a full storage, restartable after a failed or
 *   cancelled step; a step refused while another run is writing has our words.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ZendeskRun } from '@/services/zendeskImport.service';

let usage: unknown;
vi.mock('@/hooks/useBudgets', () => ({
  useMyAiUsage: () => ({ data: usage, isLoading: false, error: null }),
  useUpdateMyBudget: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRequestMyExtra: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

const { WorkspaceAiUsage } = await import('../WorkspaceAiUsage');
const { parseFreeAllowanceView } = await import('@/services/budgets.service');
const { ZendeskImportReport } = await import('../zendeskImport/ZendeskImportReport');
const { anotherRunBusyText, attachmentsStoppedText, canCopyAttachments } = await import(
  '../zendeskImport/zendeskImportSummary'
);

afterEach(cleanup);

const allowance = (used: number) => ({
  totalMicros: 400_000,
  usedMicros: used,
  remainingMicros: 400_000 - used,
  exhausted: used >= 400_000,
});
const freeView = (paused: boolean) => ({
  onOurKey: true,
  live: allowance(paused ? 400_000 : 100_000),
  kb: allowance(0),
  paused,
  kbPaused: false,
});

describe('D-L1: AI usage for a Free workspace', () => {
  it('parses the BE view; a malformed one is dropped', () => {
    expect(parseFreeAllowanceView(freeView(true))?.paused).toBe(true);
    expect(parseFreeAllowanceView({ onOurKey: true, live: {}, kb: {} })).toBeUndefined();
    expect(parseFreeAllowanceView(null)).toBeUndefined();
  });

  it('inactive + paused: the BE status line and the paused state show, not only "not switched on"', () => {
    usage = {
      active: false,
      status: { tone: 'bad', text: 'Your free AI allowance is used.' },
      freeAllowance: parseFreeAllowanceView(freeView(true)),
    };
    render(<WorkspaceAiUsage />);
    expect(screen.getByTestId('free-allowance-paused')).toHaveTextContent(/AI is paused/);
    expect(screen.getByText('Your free AI allowance is used.')).toBeInTheDocument();
    expect(screen.getByText(/AI starter allowance: used up/)).toBeInTheDocument();
  });

  it('CONTROL: an older backend (no plan part) reads as before', () => {
    usage = { active: false };
    render(<WorkspaceAiUsage />);
    expect(screen.getByText('Budgets are not switched on yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('free-allowance')).toBeNull();
  });
});

const run = (status: string, attachments?: Record<string, unknown>) => ({
  id: 7,
  status,
  fileName: 'export.json',
  fileSize: 1,
  source: null,
  options: {},
  preview: null,
  report: {
    tickets: 3,
    counts: { created: 3 },
    conflicts: [],
    failures: [],
    unmatchedAssignees: {},
    reconciled: 0,
    ...(attachments ? { attachments } : {}),
  },
  progress: null,
  error: null,
  partsUploaded: 1,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z',
  finishedAt: null,
});

describe('Zendesk: attachments and one writer', () => {
  it('storage full: says so and how to continue; the copy can start again on a failed run', () => {
    render(
      <ZendeskImportReport
        run={
          run('failed', {
            counts: { stored: 4 },
            failures: [],
            stoppedReason: 'storage_full',
            stoppedMessage: 'quota',
          }) as unknown as ZendeskRun
        }
        onAct={vi.fn()}
      />
    );
    expect(screen.getByTestId('attachments-stopped')).toHaveTextContent(/storage is full/);
    expect(screen.getByRole('button', { name: /Copy attachments again/ })).toBeInTheDocument();
  });

  it('cancelled after an Apply: copy can start again; CONTROL: no report = no Apply finished', () => {
    expect(canCopyAttachments({ status: 'cancelled', report: {} })).toBe(true);
    expect(canCopyAttachments({ status: 'failed', report: null })).toBe(false);
    expect(canCopyAttachments({ status: 'previewed', report: {} })).toBe(false);
    expect(attachmentsStoppedText(undefined)).toBeUndefined();
  });

  it('another run writing: our sentence; CONTROL: another 409 keeps its own', () => {
    expect(
      anotherRunBusyText(
        'Another Zendesk import of this workspace is running — wait for it to finish or stop it first'
      )
    ).toMatch(/is writing right now/);
    expect(anotherRunBusyText('Import the tickets first')).toBeUndefined();
  });
});
