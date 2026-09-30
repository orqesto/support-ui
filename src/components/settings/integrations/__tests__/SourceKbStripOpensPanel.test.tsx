/**
 * A re-mine writes no run record, so nothing else opens the processing panel for it: starting one
 * opens that mailbox's panel (the person asked for the work, so it closes only when they close it).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';

/** Plain function, not a module-level vi.fn (see RecentRunsAndKbFailures.test). */
let reprocess: () => Promise<unknown> = () => Promise.resolve({});
vi.mock('@/services/kb.service', () => ({
  kbService: { reprocessSource: () => reprocess() },
}));

const { SourceKbStrip } = await import('../SourceKbStrip');

beforeEach(() => useProcessingPanelStore.getState().reset());
afterEach(cleanup);

const startRemine = () => {
  render(
    <SourceKbStrip
      source={{ id: 9, isKnowledgeBase: true, kbMarkedAt: '2026-09-01T00:00:00Z' }}
      onShowAlert={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /re-mine/i }));
  const confirm = screen.getAllByRole('button').find((button) => /re-mine|confirm|start/i.test(button.textContent ?? '') && button.closest('[role="dialog"], [role="alertdialog"]'));
  if (!confirm) throw new Error('no confirm button');
  fireEvent.click(confirm);
};

describe('SourceKbStrip re-mine', () => {
  it('opens the mailbox’s processing panel once the re-mine has started', async () => {
    reprocess = () => Promise.resolve({});
    startRemine();
    await waitFor(() => expect(useProcessingPanelStore.getState().opened[9]?.reason).toBe('manual'));
  });

  it('CONTROL: a re-mine that could not start opens nothing', async () => {
    reprocess = () => Promise.reject(new Error('nope'));
    startRemine();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(useProcessingPanelStore.getState().opened[9]).toBeUndefined();
  });
});
