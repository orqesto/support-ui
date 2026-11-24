import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Documentation } from '@/features/kb/shell';
import { BE_CONFIGS, beChunk, inventedDocument } from './beChunker';

/**
 * Settings → AI → Documentation → eye icon. The old viewer printed the chunks glued with a blank
 * line, raw Markdown, in a monospace box that broke words anywhere, and said nothing about where
 * a Confluence document came from.
 */

const getDocumentationContent = vi.fn<(id: number) => Promise<unknown>>();
const docs: Documentation[] = [];
vi.mock('@/features/kb/shell', () => ({
  documentationService: {
    listDocumentation: () => Promise.resolve(docs),
    getStats: () => Promise.resolve({ totalDocs: docs.length, totalChunks: 0, totalReferences: 0 }),
    getDocumentationContent: (id: number) => getDocumentationContent(id),
    getProgress: vi.fn(),
  },
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 5, name: 'Returns team', active: true }], teamsEnabled: true }),
  useDepartmentById: () => undefined,
}));
const getAllIntegrations = vi.fn<() => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: () => getAllIntegrations() },
}));

const { DocumentationSettings } = await import('../../DocumentationSettings');

const makeDoc = (over: Partial<Documentation> = {}): Documentation =>
  ({
    id: 7,
    organizationId: 1,
    departmentIds: [],
    documentType: 'general',
    chunkingStrategy: 'auto',
    allowQuoting: true,
    title: 'Shipping guide',
    description: null,
    filename: 'shipping.md',
    originalFilename: 'shipping.md',
    mimeType: 'text/markdown',
    size: 30000,
    url: '/uploads/shipping.md',
    status: 'ready',
    processingError: null,
    enabled: true,
    chunkCount: 3,
    timesReferenced: 0,
    lastReferencedAt: null,
    uploadedBy: 1,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    metadata: null,
    ...over,
  }) as Documentation;

const openPreview = async (doc: Documentation) => {
  docs.splice(0, docs.length, doc);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DocumentationSettings />
      </MemoryRouter>
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'View content' }));
  return screen.findByRole('dialog');
};

afterEach(() => {
  cleanup();
  getDocumentationContent.mockReset();
  getAllIntegrations.mockReset();
});

const chunkRows = (chunks: string[]) => chunks.map((content, chunkIndex) => ({ content, chunkIndex }));

describe('documentation preview', () => {
  it('⛔ shows each sentence once where chunks meet (backend overlap rule)', async () => {
    const text = inventedDocument(6000);
    const chunks = beChunk(text, BE_CONFIGS.general);
    expect(chunks.length).toBeGreaterThan(3);
    // Control: glued as before, at least one sentence shows twice.
    const sentences = text.split('\n').filter((line) => line.startsWith('Returns for order group'));
    const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
    expect(sentences.some((sentence) => count(chunks.join('\n\n'), sentence) > 1)).toBe(true);
    getDocumentationContent.mockResolvedValue(chunkRows(chunks));

    const dialog = await openPreview(makeDoc());
    const shown = (await within(dialog).findByTestId('doc-preview-body')).textContent ?? '';
    for (const sentence of sentences) expect(count(shown, sentence)).toBe(1);
  });

  it('⛔ renders Markdown (headings, list, table) in a proportional, normally wrapping font', async () => {
    getDocumentationContent.mockResolvedValue(
      chunkRows(['# Returns\n\n- Within **30** days\n- Unused items\n\n| Zone | Days |\n| --- | --- |\n| A | 2 |'])
    );
    const dialog = await openPreview(makeDoc());
    const body = await within(dialog).findByTestId('doc-preview-body');
    expect(within(body).getByRole('heading', { name: 'Returns' })).toBeInTheDocument();
    expect(within(body).getAllByRole('listitem')).toHaveLength(2);
    expect(within(body).getByRole('table')).toBeInTheDocument();
    expect(body.textContent).not.toContain('**');
    const classes = [body, ...body.querySelectorAll('*')].map((element) => element.className).join(' ');
    expect(classes).not.toMatch(/(^|\s)font-mono(\s|$)/);
    expect(classes).not.toContain('break-all');
    expect(body.getAttribute('style') ?? '').not.toContain('break-all');
  });

  it('⛔ a script in a document is shown as text, never run or inserted as markup', async () => {
    getDocumentationContent.mockResolvedValue(
      chunkRows(['Intro <script>window.__docPwned = 1</script> <img src=x onerror="window.__docPwned = 2"> [x](javascript:alert(1))'])
    );
    const dialog = await openPreview(makeDoc());
    const body = await within(dialog).findByTestId('doc-preview-body');
    expect(body.querySelector('script, img')).toBeNull();
    expect(body.querySelector('a[href^="javascript"]')).toBeNull();
    expect(body.textContent).toContain('<script>');
    expect((window as { __docPwned?: number }).__docPwned).toBeUndefined();
  });

  it('⛔ a Confluence document says so, links to its page and shows when the source last synced', async () => {
    getAllIntegrations.mockResolvedValue({
      success: true,
      data: [{ id: 12, type: 'confluence', lastSyncedAt: '2026-11-20T08:00:00.000Z' }],
    });
    getDocumentationContent.mockResolvedValue(chunkRows(['Page text']));
    const dialog = await openPreview(
      makeDoc({
        externalSource: 'confluence:12',
        externalId: '98765',
        externalUrl: 'https://wiki.example.com/wiki/spaces/HELP/pages/98765/Shipping',
        mimeType: 'text/html',
        originalFilename: '98765.confluence',
      })
    );
    const link = within(dialog).getByRole('link', { name: /open in confluence/i });
    expect(link).toHaveAttribute('href', 'https://wiki.example.com/wiki/spaces/HELP/pages/98765/Shipping');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(dialog).getByText('Confluence')).toBeInTheDocument();
    expect(within(dialog).getByText('All teams')).toBeInTheDocument();
    expect(await within(dialog).findByText(/source last synced/i)).toBeInTheDocument();
    expect(within(dialog).queryByText('98765.confluence')).toBeNull();
  });

  it('an uploaded document names its file and has no Confluence link', async () => {
    getDocumentationContent.mockResolvedValue(chunkRows(['Text']));
    const dialog = await openPreview(makeDoc());
    expect(within(dialog).getByText('Uploaded file')).toBeInTheDocument();
    expect(within(dialog).getByText('shipping.md')).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /open in confluence/i })).toBeNull();
    expect(getAllIntegrations).not.toHaveBeenCalled();
  });

  it('a team-scoped document names its teams', async () => {
    getDocumentationContent.mockResolvedValue(chunkRows(['Text']));
    const dialog = await openPreview(makeDoc({ departmentIds: [5] }));
    expect(within(dialog).getByText('Returns team')).toBeInTheDocument();
    expect(within(dialog).queryByText('All teams')).toBeNull();
  });

  it('a Confluence document from an older backend (no externalUrl) has no link and does not crash', async () => {
    getAllIntegrations.mockRejectedValue(new Error('forbidden'));
    getDocumentationContent.mockResolvedValue(chunkRows(['Page text']));
    const dialog = await openPreview(makeDoc({ externalSource: 'confluence:3', mimeType: 'text/html' }));
    expect(await within(dialog).findByTestId('doc-preview-body')).toHaveTextContent('Page text');
    expect(within(dialog).queryByRole('link', { name: /open in confluence/i })).toBeNull();
  });

  it('⛔ a failed load says so and Try again loads it', async () => {
    getDocumentationContent.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce(chunkRows(['Back again']));
    const dialog = await openPreview(makeDoc());
    expect(await within(dialog).findByText('The content could not be loaded.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByTestId('doc-preview-body')).toHaveTextContent('Back again');
  });

  it('⛔ a document with no stored text says so', async () => {
    getDocumentationContent.mockResolvedValue([]);
    const dialog = await openPreview(makeDoc());
    expect(await within(dialog).findByText('This document has no stored text to show.')).toBeInTheDocument();
  });

  it('plain text stays plain (no Markdown), wrapping normally', async () => {
    getDocumentationContent.mockResolvedValue(chunkRows(['# not a heading\n**kept**']));
    const dialog = await openPreview(makeDoc({ mimeType: 'text/plain', originalFilename: 'notes.txt' }));
    const body = await within(dialog).findByTestId('doc-preview-body');
    expect(body.textContent).toBe('# not a heading\n**kept**');
    expect(body.className).toContain('whitespace-pre-wrap');
    expect(body.className).not.toContain('font-mono');
  });

  it('⛔ a ~1 MB document renders its first part and adds the rest on request', async () => {
    const text = inventedDocument(1_000_000);
    getDocumentationContent.mockResolvedValue(chunkRows(beChunk(text, BE_CONFIGS.general)));
    const dialog = await openPreview(makeDoc());
    const body = await within(dialog).findByTestId('doc-preview-body', {}, { timeout: 5000 });
    const firstHeadings = body.querySelectorAll('h2').length;
    expect(firstHeadings).toBeGreaterThan(0);
    expect(body.textContent?.length ?? 0).toBeLessThan(100_000);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show all' }));
    expect(body.querySelectorAll('h2').length).toBe(text.match(/^## /gm)?.length);
  }, 20_000);
});
