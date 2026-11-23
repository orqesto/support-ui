/**
 * A website visitor who left no email, in the dialogs that name a thread's customer — merge,
 * delete and similar threads: "Website visitor (no email)" (a visitor's name is kept), never the
 * placeholder the backend stores. The real dialogs; only their data is supplied.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getSuggestedAnswer = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getSuggestedAnswer: (...args: unknown[]) => getSuggestedAnswer(...args) },
}));
vi.mock('@/hooks/useTranslation', () => ({
  useSupportedLanguages: () => ({
    languages: [{ code: 'en', name: 'English' }],
    fetchLanguages: () => Promise.resolve(),
  }),
}));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ABC' }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { DeleteMessageDialog } from '../DeleteMessageDialog';
import { MergeConfirmDialog } from '../MergeConfirmDialog';
import { SimilarMessagesDialog } from '../SimilarMessagesDialog';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PLACEHOLDER = 'anonymous@chat-widget.local';
const LABEL = 'Website visitor (no email)';
const noPlaceholder = () => expect(document.body.innerHTML).not.toContain('chat-widget.local');

describe('the merge dialog', () => {
  const row = (id: number, sender: string) => ({
    id,
    publicId: `SUP-${id}`,
    subject: `Thread ${id}`,
    createdAt: `2026-08-0${id}T00:00:00Z`,
    sender,
  });
  const renderMerge = (first: string) =>
    render(
      <MergeConfirmDialog
        open
        rows={[row(1, first), row(2, 'ada@example.com')]}
        onOpenChange={() => {}}
        onMerged={() => {}}
      />
    );

  it('names the visitor on their thread', () => {
    renderMerge(PLACEHOLDER);
    expect(screen.getByRole('dialog').textContent).toContain(LABEL);
    noPlaceholder();
  });

  it('keeps a visitor name', () => {
    renderMerge(`Dana <${PLACEHOLDER}>`);
    expect(screen.getByRole('dialog').textContent).toContain('Dana (no email)');
    noPlaceholder();
  });

  it('CONTROL: a real address is shown', () => {
    renderMerge('bo@example.com');
    expect(screen.getByRole('dialog').textContent).toContain('bo@example.com');
    expect(screen.getByRole('dialog').textContent).toContain('ada@example.com');
    expect(screen.getByRole('dialog').textContent).not.toContain('no email');
  });
});

describe('the delete dialog', () => {
  const renderDelete = (sender: string) =>
    render(
      <DeleteMessageDialog
        open
        message={{ sender, subject: 'Where is my parcel?' }}
        deleting={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );

  it('names the visitor', () => {
    renderDelete(PLACEHOLDER);
    expect(screen.getByText(`From: ${LABEL}`)).toBeTruthy();
    noPlaceholder();
  });

  it('CONTROL: a real address is shown', () => {
    renderDelete('ada@example.com');
    expect(screen.getByText('From: ada@example.com')).toBeTruthy();
  });
});

describe('the similar threads dialog', () => {
  const renderSimilar = async (sender: string) => {
    getSuggestedAnswer.mockResolvedValue({
      success: true,
      data: {
        mode: 'similar-only',
        aiConfigured: true,
        sources: [
          {
            type: 'message',
            id: 12,
            title: 'Parcel is late',
            content: 'Where is my parcel?',
            answer: 'It ships tomorrow.',
            similarity: 0.9,
            metadata: { sender },
          },
        ],
      },
    });
    render(
      <MemoryRouter>
        <SimilarMessagesDialog messageId={41} open onClose={() => {}} />
      </MemoryRouter>
    );
    await screen.findByText('Parcel is late');
  };

  it('names the visitor on a past thread', async () => {
    await renderSimilar(PLACEHOLDER);
    expect(screen.getByText(LABEL)).toBeTruthy();
    noPlaceholder();
  });

  it('CONTROL: a real address is shown', async () => {
    await renderSimilar('ada@example.com');
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.queryByText(LABEL)).toBeNull();
  });
});
