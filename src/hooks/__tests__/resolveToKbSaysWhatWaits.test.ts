import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * "Resolve & Save to KB": a document saved below the bar waits for a person before answers use
 * it, and the agent is told which ones (owner, 2026-10-05) — not a flat "Saved to KB".
 */
const resolve = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { resolve: (...args: unknown[]) => resolve(...args) },
}));

import { useResolveMessageToKB } from '@/hooks/useResolveMessageToKB';

const details = (
  processedItems: Array<{ filename: string; type: string; pendingReview?: boolean }>
) => ({
  data: {
    kbSuccess: true,
    documentationIds: [101, 102],
    details: {
      totalAttachments: processedItems.length,
      processed: processedItems.length,
      rejected: 0,
      alreadyProcessed: 0,
      qaPairExtracted: false,
      rejectedItems: [],
      processedItems,
    },
  },
});

const describeResult = async () => {
  const { result } = renderHook(() => useResolveMessageToKB());
  let out: Awaited<ReturnType<typeof result.current.resolveMessage>> = null;
  await act(async () => {
    out = await result.current.resolveMessage(5);
  });
  return out!.alertState.description;
};

describe('useResolveMessageToKB', () => {
  beforeEach(() => resolve.mockReset());

  it('names the documents that wait for review, and how many', async () => {
    resolve.mockResolvedValue(
      details([
        { filename: 'manual.pdf', type: 'PDF', pendingReview: false },
        { filename: 'guide.docx', type: 'Document', pendingReview: true },
      ])
    );
    const text = await describeResult();
    expect(text).toContain('✅ Saved to KB: 2 (1 waiting for review)');
    expect(text).toContain('• guide.docx (Document) — waiting for review');
    expect(text).toContain('• manual.pdf (PDF)\n');
  });

  it('CONTROL — an older backend (no flag) reads as before', async () => {
    resolve.mockResolvedValue(details([{ filename: 'manual.pdf', type: 'PDF' }]));
    const text = await describeResult();
    expect(text).toContain('✅ Saved to KB: 1\n');
    expect(text).not.toContain('waiting for review');
  });
});
