import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as KbShell from '@/features/kb/shell';
import { BE_CONFIGS, beChunk, inventedDocument } from './beChunker';

type Documentation = KbShell.Documentation;

/**
 * Settings → AI → Documentation → eye icon. The old viewer printed the chunks glued with a blank
 * line, raw Markdown, in a monospace box that broke words anywhere, and said nothing about where
 * a Confluence document came from.
 */

const getDocumentationContent = vi.fn<(id: number) => Promise<unknown>>();
const getDocumentationFormatted = vi.fn<(id: number) => Promise<unknown>>();
const getRaw = vi.fn<(id: number, display: boolean) => Promise<Blob>>();
const getOfficePreview = vi.fn<(id: number) => Promise<unknown>>();
vi.mock('@/services/documentFile.service', () => ({
  documentFileService: {
    getBlob: (id: number, display: boolean) => getRaw(id, display),
    getPreview: (id: number) => getOfficePreview(id),
  },
}));
const notFound = () => Object.assign(new Error('HTTP 404'), { status: 404 });
const docs: Documentation[] = [];
vi.mock('@/features/kb/shell', async () => {
  // Raw backend bodies go through the service's REAL normalizer, as in the app.
  const { normalizeDocumentationFormatted } =
    await vi.importActual<typeof KbShell>('@/features/kb/shell');
  return {
    documentationService: {
      getDocumentationFormatted: async (id: number) =>
        normalizeDocumentationFormatted(await getDocumentationFormatted(id)),
      listDocumentation: () => Promise.resolve(docs),
      getStats: () =>
        Promise.resolve({ totalDocs: docs.length, totalChunks: 0, totalReferences: 0 }),
      getDocumentationContent: (id: number) => getDocumentationContent(id),
      getProgress: vi.fn(),
    },
  };
});
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [{ id: 5, name: 'Returns team', active: true }],
    teamsEnabled: true,
  }),
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
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <DocumentationSettings />
      </MemoryRouter>
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'View content' }));
  // An uploaded document opens the shared viewer first; with no file route (the default here)
  // it hands over to the text preview.
  if (!doc.externalSource) {
    await screen.findByTestId('file-viewer');
    await waitFor(() => expect(screen.queryByTestId('file-viewer')).toBeNull());
  }
  return screen.findByRole('dialog');
};

beforeEach(() => {
  // By default the backend predates the documentation file routes (404 on /raw and /preview):
  // an uploaded document opens the shared viewer, which hands over to the text read from it —
  // every test below that sets nothing else runs that older-backend path, end to end.
  getRaw.mockRejectedValue(notFound());
  getOfficePreview.mockRejectedValue(notFound());
  // An older backend's GET /api/documentation/:id: the row, without contentMarkdown.
  getDocumentationFormatted.mockResolvedValue({ id: 7, title: 'Page' });
});

afterEach(() => {
  cleanup();
  getRaw.mockReset();
  getOfficePreview.mockReset();
  getDocumentationFormatted.mockReset();
  getDocumentationContent.mockReset();
  getAllIntegrations.mockReset();
});

const chunkRows = (chunks: string[]) =>
  chunks.map((content, chunkIndex) => ({ content, chunkIndex }));

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
      chunkRows([
        '# Returns\n\n- Within **30** days\n- Unused items\n\n| Zone | Days |\n| --- | --- |\n| A | 2 |',
      ])
    );
    const dialog = await openPreview(makeDoc());
    const body = await within(dialog).findByTestId('doc-preview-body');
    expect(within(body).getByRole('heading', { name: 'Returns' })).toBeInTheDocument();
    expect(within(body).getAllByRole('listitem')).toHaveLength(2);
    expect(within(body).getByRole('table')).toBeInTheDocument();
    expect(body.textContent).not.toContain('**');
    const classes = [body, ...body.querySelectorAll('*')]
      .map((element) => element.className)
      .join(' ');
    expect(classes).not.toMatch(/(^|\s)font-mono(\s|$)/);
    expect(classes).not.toContain('break-all');
    expect(body.getAttribute('style') ?? '').not.toContain('break-all');
  });

  it('⛔ a script in a document is shown as text, never run or inserted as markup', async () => {
    getDocumentationContent.mockResolvedValue(
      chunkRows([
        'Intro <script>window.__docPwned = 1</script> <img src=x onerror="window.__docPwned = 2"> [x](javascript:alert(1))',
      ])
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
    expect(link).toHaveAttribute(
      'href',
      'https://wiki.example.com/wiki/spaces/HELP/pages/98765/Shipping'
    );
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
    const dialog = await openPreview(
      makeDoc({ externalSource: 'confluence:3', mimeType: 'text/html' })
    );
    expect(await within(dialog).findByTestId('doc-preview-body')).toHaveTextContent('Page text');
    expect(within(dialog).queryByRole('link', { name: /open in confluence/i })).toBeNull();
  });

  it('⛔ a failed load says so and Try again loads it', async () => {
    getDocumentationContent
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValueOnce(chunkRows(['Back again']));
    const dialog = await openPreview(makeDoc());
    expect(await within(dialog).findByText('The content could not be loaded.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByTestId('doc-preview-body')).toHaveTextContent('Back again');
  });

  it('⛔ a document with no stored text says so', async () => {
    getDocumentationContent.mockResolvedValue([]);
    const dialog = await openPreview(makeDoc());
    expect(
      await within(dialog).findByText('This document has no stored text to show.')
    ).toBeInTheDocument();
  });

  it('plain text stays plain (no Markdown), wrapping normally', async () => {
    getDocumentationContent.mockResolvedValue(chunkRows(['# not a heading\n**kept**']));
    const dialog = await openPreview(
      makeDoc({ mimeType: 'text/plain', originalFilename: 'notes.txt' })
    );
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

/**
 * 1.1.330: an uploaded document opens the SHARED file viewer over its original file
 * (`/api/documentation/:id/raw` and `/preview`, mocked here at the service); Confluence pages
 * and anything the viewer cannot draw keep the text preview above.
 */
describe('documentation preview: the shared file viewer for uploaded files', () => {
  const created: Blob[] = [];
  beforeEach(() => {
    created.length = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return `blob:doc-${created.length}`;
      },
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const openViewer = async (doc: Documentation) => {
    docs.splice(0, docs.length, doc);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <DocumentationSettings />
        </MemoryRouter>
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'View content' }));
    await screen.findByTestId('file-viewer');
    return screen.getByRole('dialog');
  };

  it('⛔ a PDF opens in the browser viewer from the document bytes, typed application/pdf', async () => {
    getRaw.mockResolvedValue(new Blob(['%PDF'], { type: 'application/octet-stream' }));
    const viewer = await openViewer(
      makeDoc({ mimeType: 'application/pdf', originalFilename: 'leaflet.pdf' })
    );
    await waitFor(() =>
      expect(viewer.querySelector('iframe')).toHaveAttribute('src', 'blob:doc-1')
    );
    expect(created[0].type).toBe('application/pdf');
    expect(getRaw).toHaveBeenCalledWith(7, true);
    expect(getDocumentationContent).not.toHaveBeenCalled();
  });

  it('a TIFF is shown from the WEBP the backend converts it to', async () => {
    getRaw.mockResolvedValue(new Blob(['webp bytes'], { type: 'image/webp' }));
    const viewer = await openViewer(
      makeDoc({ mimeType: 'image/tiff', originalFilename: 'scan.tiff' })
    );
    await waitFor(() => expect(viewer.querySelector('img')).toHaveAttribute('src', 'blob:doc-1'));
    expect(created[0].type).toBe('image/webp');
    expect(getRaw).toHaveBeenCalledWith(7, true);
  });

  it('⛔ a Word file is rendered and sanitized by an allowlist (no remote fetch, no script)', async () => {
    getOfficePreview.mockResolvedValue({
      kind: 'html',
      truncated: false,
      html:
        '<h1>Returns</h1><p>Keep <strong>receipts</strong></p>' +
        '<script>window.__docxPwned = 1</script>' +
        '<img src="x" onerror="window.__docxPwned = 2">' +
        '<img src="https://tracker.example.com/pixel.png">' +
        // An SVG picture that names a remote image inside: kept, as an <img> only (browsers
        // fetch nothing an SVG-as-image references).
        `<img alt="diagram" src="data:image/svg+xml;base64,${btoa(
          '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://tracker.example.com/i.png"/><script>alert(1)</script></svg>'
        )}">` +
        '<a href="data:image/svg+xml;base64,PHN2Zz4=">svg link</a>' +
        '<img alt="logo" src="data:image/png;base64,iVBORw0KGgo=">' +
        '<svg><image href="https://tracker.example.com/s.png"></image></svg>' +
        '<video poster="https://tracker.example.com/p.png"></video>' +
        '<table background="https://tracker.example.com/b.png"><tr><td colspan="2">cell</td></tr></table>' +
        '<p style="color:red" class="x" onclick="alert(1)">styled</p>' +
        '<a href="javascript:alert(1)">bad link</a> <a href="https://help.example.com/r">good link</a>',
    });
    const viewer = await openViewer(makeDoc({ mimeType: DOCX, originalFilename: 'returns.docx' }));
    const body = await within(viewer).findByTestId('document-preview');
    expect(within(body).getByRole('heading', { name: 'Returns' })).toBeInTheDocument();
    expect(
      body.querySelector(
        'script, svg, image, video, [style], [class], [onclick], [onerror], [background], [poster]'
      )
    ).toBeNull();
    expect([...body.querySelectorAll('img')].map((img) => img.getAttribute('alt'))).toEqual([
      'diagram',
      'logo',
    ]);
    // Only an <img> carries a source, and only a data: picture.
    expect(
      [...body.querySelectorAll('[src], [href], [srcset], [data], [xlink\\:href]')]
        .filter((node) => node.tagName !== 'A')
        .map((node) => `${node.tagName} ${node.getAttribute('src')?.slice(0, 14)}`)
    ).toEqual(['IMG data:image/svg', 'IMG data:image/png']);
    expect(within(body).getByText('svg link')).not.toHaveAttribute('href');
    expect(body.innerHTML).not.toContain('tracker.example.com');
    expect(within(body).getByText('bad link')).not.toHaveAttribute('href');
    expect(within(body).getByRole('link', { name: 'good link' })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
    expect(body.querySelector('td')).toHaveAttribute('colspan', '2');
    expect((window as { __docxPwned?: number }).__docxPwned).toBeUndefined();
    expect(getOfficePreview).toHaveBeenCalledWith(7);
  });

  it('an Excel file shows its sheets', async () => {
    getOfficePreview.mockResolvedValue({
      kind: 'sheets',
      truncated: false,
      sheets: [
        {
          name: 'Prices',
          rows: [
            ['Item', 'Price'],
            ['Widget', '9.5'],
          ],
          truncated: false,
        },
        { name: 'Zones', rows: [['North']], truncated: false },
      ],
    });
    const viewer = await openViewer(makeDoc({ mimeType: XLSX, originalFilename: 'prices.xlsx' }));
    const sheet = await within(viewer).findByTestId('sheet-preview');
    expect(within(sheet).getByText('Widget')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Zones' }));
    expect(within(sheet).getByText('North')).toBeInTheDocument();
  });

  it('a CSV is a table; Markdown is formatted; text is text', async () => {
    getRaw.mockResolvedValue(new Blob(['zone,days\n"A, north",2\n']));
    let viewer = await openViewer(makeDoc({ mimeType: 'text/csv', originalFilename: 'zones.csv' }));
    expect(await within(viewer).findByText('A, north')).toBeInTheDocument();
    cleanup();

    getRaw.mockResolvedValue(
      new Blob(['# Hours\n\n- Mon\n- Tue\n\n| a | b |\n| --- | --- |\n| x \\| y | z |'])
    );
    viewer = await openViewer(makeDoc({ mimeType: 'text/markdown', originalFilename: 'hours.md' }));
    const md = await within(viewer).findByTestId('markdown-preview');
    expect(within(md).getByRole('heading', { name: 'Hours' })).toBeInTheDocument();
    expect(within(md).getAllByRole('listitem')).toHaveLength(2);
    expect(within(md).getByRole('cell', { name: 'x | y' })).toBeInTheDocument();
    cleanup();

    getRaw.mockResolvedValue(new Blob(['# not a heading']));
    viewer = await openViewer(makeDoc({ mimeType: 'text/plain', originalFilename: 'notes.txt' }));
    expect(await within(viewer).findByText('# not a heading')).toBeInTheDocument();
    expect(getDocumentationContent).not.toHaveBeenCalled();
  });

  it('⛔ an old .doc goes straight to the text read from it (no file request)', async () => {
    getDocumentationContent.mockResolvedValue(chunkRows(['Old letter text']));
    docs.splice(
      0,
      docs.length,
      makeDoc({ mimeType: 'application/msword', originalFilename: 'old.doc' })
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <DocumentationSettings />
        </MemoryRouter>
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'View content' }));
    expect(await screen.findByTestId('doc-preview-body')).toHaveTextContent('Old letter text');
    expect(getRaw).not.toHaveBeenCalled();
    expect(getOfficePreview).not.toHaveBeenCalled();
  });

  it('⛔ a Word file too large to preview offers Download and the text read from it', async () => {
    getOfficePreview.mockRejectedValue(Object.assign(new Error('HTTP 413'), { status: 413 }));
    getDocumentationContent.mockResolvedValue(chunkRows(['Long contract text']));
    const viewer = await openViewer(makeDoc({ mimeType: DOCX, originalFilename: 'contract.docx' }));
    expect(await within(viewer).findByText(/too large to preview/i)).toBeInTheDocument();
    expect(within(viewer).getAllByRole('button', { name: /download/i }).length).toBeGreaterThan(0);
    fireEvent.click(within(viewer).getByRole('button', { name: 'Show the text read from it' }));
    expect(await screen.findByTestId('doc-preview-body')).toHaveTextContent('Long contract text');
  });

  it('Download saves the ORIGINAL file (a TIFF as TIFF, not the converted picture)', async () => {
    getRaw.mockResolvedValue(new Blob(['bytes']));
    const viewer = await openViewer(
      makeDoc({ mimeType: 'image/tiff', originalFilename: 'scan.tiff' })
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    fireEvent.click(within(viewer).getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(getRaw).toHaveBeenCalledWith(7, false));
    await waitFor(() => expect(click).toHaveBeenCalled());
    click.mockRestore();
  });
});

describe('documentation preview: Confluence pages keep their formatting and path', () => {
  const confluenceDoc = (over: Partial<Documentation> = {}) =>
    makeDoc({
      externalSource: 'confluence:12',
      mimeType: 'text/html',
      originalFilename: '1.confluence',
      ...over,
    });
  beforeEach(() => getAllIntegrations.mockRejectedValue(new Error('forbidden')));

  it('⛔ renders contentMarkdown when the backend sends it (no chunks request)', async () => {
    getDocumentationFormatted.mockResolvedValue({
      contentMarkdown:
        '## Return window\n\n**30 days**\n\n| Code | Note |\n| --- | --- |\n| A\\|B | split |',
      sourcePath: ['Help Center', 'Policies', 'Returns'],
    });
    const dialog = await openPreview(confluenceDoc());
    const body = await within(dialog).findByTestId('doc-preview-body');
    expect(within(body).getByRole('heading', { name: 'Return window' })).toBeInTheDocument();
    expect(body.querySelector('strong')).toHaveTextContent('30 days');
    expect(within(body).getByRole('cell', { name: 'A|B' })).toBeInTheDocument();
    expect(within(dialog).getByTestId('doc-preview-path')).toHaveTextContent(
      'Help Center › Policies › Returns'
    );
    expect(getDocumentationContent).not.toHaveBeenCalled();
  });

  it.each([
    ['null', { contentMarkdown: null, sourcePath: null }],
    ['absent (older backend)', { id: 7, title: 'Page' }],
    ['blank', { contentMarkdown: '   ' }],
  ])('contentMarkdown %s: the chunks, as before; no path shown', async (_label, detail) => {
    getDocumentationFormatted.mockResolvedValue(detail);
    getDocumentationContent.mockResolvedValue(chunkRows(['Chunk text']));
    const dialog = await openPreview(confluenceDoc());
    expect(await within(dialog).findByTestId('doc-preview-body')).toHaveTextContent('Chunk text');
    expect(within(dialog).queryByTestId('doc-preview-path')).toBeNull();
  });

  it('a failed detail request falls back to the chunks', async () => {
    getDocumentationFormatted.mockRejectedValue(new Error('500'));
    getDocumentationContent.mockResolvedValue(chunkRows(['Chunk text']));
    const dialog = await openPreview(confluenceDoc());
    expect(await within(dialog).findByTestId('doc-preview-body')).toHaveTextContent('Chunk text');
  });

  it('the path from the list row is shown even before the detail answers', async () => {
    getDocumentationFormatted.mockReturnValue(new Promise(() => undefined));
    const dialog = await openPreview(confluenceDoc({ sourcePath: ['Help Center', 'Shipping'] }));
    expect(within(dialog).getByTestId('doc-preview-path')).toHaveTextContent(
      'Help Center › Shipping'
    );
  });
});
