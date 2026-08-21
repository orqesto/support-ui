import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentationList } from '@/components/settings/DocumentationList';
import type { Documentation } from '@/services/documentation.service';

afterEach(cleanup);

/**
 * Regression: toggling "Disable in suggested answers" white-screened the whole
 * Knowledge Base page on prod v1.1.242.
 *
 * The toggle endpoint returns the raw documentation row, but `departmentIds` is
 * assembled from the junction table by the LIST endpoint — so the toggle response
 * omitted it. DocumentationSettings replaced the complete row with that partial one,
 * and this list then did `doc.departmentIds.length` on `undefined`:
 *
 *   TypeError: Cannot read properties of undefined (reading 'length')
 *
 * The write always succeeded; only the render died. So the user saw a crash, hit
 * reload, and found the change had applied — which makes it easy to dismiss as
 * cosmetic and easy to keep shipping.
 */

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

const renderList = (docs: Documentation[]) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DocumentationList
        docs={docs}
        selectedDocs={new Set<number>()}
        docProgress={{}}
        onToggleDoc={vi.fn()}
        onToggleAll={vi.fn()}
        onBulkDelete={vi.fn()}
        onViewContent={vi.fn()}
        onToggleEnabled={vi.fn()}
        onDeleteClick={vi.fn()}
      />
    </QueryClientProvider>
  );

describe('DocumentationList — dept scope rendering', () => {
  it('renders a row whose departmentIds is missing entirely', () => {
    // Exactly the shape an older backend returns from the toggle endpoint.
    const partial = { ...doc(), departmentIds: undefined } as unknown as Documentation;

    expect(() => renderList([partial])).not.toThrow();
    // It degrades to the org-wide affordance rather than disappearing or crashing.
    expect(screen.getByText('All departments')).toBeInTheDocument();
    expect(screen.getByText('pricing')).toBeInTheDocument();
  });

  it('still shows org-wide for an explicit empty scope', () => {
    renderList([doc({ departmentIds: [] })]);
    expect(screen.getByText('All departments')).toBeInTheDocument();
  });

  it('does not claim org-wide when the doc IS dept-scoped', () => {
    // Control: the guard must not turn a scoped doc into an org-wide one.
    renderList([doc({ departmentIds: [4] })]);
    expect(screen.queryByText('All departments')).toBeNull();
  });
});
