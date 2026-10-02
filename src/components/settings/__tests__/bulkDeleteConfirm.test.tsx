/**
 * FE audit 2026-09-29, B-H2: "Delete Selected" deleted knowledge-base documents at once, with no
 * confirmation, and the selection survives a change of facet or search, so the deleted set could
 * include rows the admin could not see. The list now asks with the ids it SHOWS, and the confirm
 * says how many of the selected rows the current filter hides.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentationList } from '@/components/settings/DocumentationList';
import { bulkDeleteSummary } from '@/components/settings/bulkDeleteSummary';
import type { Documentation } from '@/services/documentation.service';

afterEach(cleanup);

const doc = (over: Partial<Documentation> = {}): Documentation =>
  ({
    id: 1,
    organizationId: 20,
    departmentIds: [],
    documentType: 'general',
    chunkingStrategy: null,
    allowQuoting: true,
    title: 'pricing',
    description: null,
    filename: 'pricing.md',
    originalFilename: 'pricing.md',
    mimeType: 'text/markdown',
    size: 2565,
    status: 'ready',
    enabled: true,
    chunkCount: 2,
    timesReferenced: 0,
    createdAt: '2026-08-21T11:51:21.000Z',
    updatedAt: '2026-08-21T11:51:21.000Z',
    ...over,
  }) as Documentation;

describe('Delete Selected asks first, naming what the filter hides', () => {
  it('the list hands the confirm the ids it shows', () => {
    const onBulkDelete = vi.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DocumentationList
          docs={[doc({ id: 1, title: 'pricing' }), doc({ id: 2, title: 'refunds' })]}
          selectedDocs={new Set<number>([1, 2, 7])}
          docProgress={{}}
          onToggleDoc={vi.fn()}
          onToggleAll={vi.fn()}
          onBulkDelete={onBulkDelete}
          onViewContent={vi.fn()}
          onToggleEnabled={vi.fn()}
          onDeleteClick={vi.fn()}
        />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete Selected/ }));
    expect(onBulkDelete).toHaveBeenCalledWith([1, 2]);
  });

  it('the summary counts the selected rows the current filter does not show', () => {
    const summary = bulkDeleteSummary(new Set([1, 2, 7, 9]), [1, 2]);
    expect(summary).toMatchObject({ total: 4, hidden: 2 });
    expect(summary.description).toContain('Delete 4 documents?');
    expect(summary.description).toContain('2 of them are not shown by the current filter');
    expect(summary.description).toContain('cannot be undone');
  });

  it('CONTROL: a selection the filter shows in full says nothing about hidden rows', () => {
    const summary = bulkDeleteSummary(new Set([1]), [1, 2]);
    expect(summary).toMatchObject({ total: 1, hidden: 0 });
    expect(summary.description).toBe(
      'Delete 1 document? This cannot be undone; their chunks leave the knowledge base.'
    );
    expect(summary.description).not.toContain('not shown');
  });
});
