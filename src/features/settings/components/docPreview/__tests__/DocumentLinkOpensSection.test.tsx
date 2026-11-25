import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as KbShell from '@/features/kb/shell';
import { documentationHref } from '@/lib/documentationLink';
import { chunkFocus, findFocusBlock, findFocusRange, focusLines, markLineStart, sectionsToShow } from '../focusSection';

type Documentation = KbShell.Documentation;

/**
 * A source link under an AI answer ("Insurance we accept · Section 1") opened Settings › AI ›
 * Documentation and nothing else: the redirect from the old address dropped `?docId=`, and the
 * page only ever tinted the row. It opens the document, at the cited section.
 */

const getDocumentationContent = vi.fn<(id: number) => Promise<unknown>>();
const getDocumentationFormatted = vi.fn<(id: number) => Promise<unknown>>();
const getDocumentation = vi.fn<(id: number) => Promise<unknown>>();
vi.mock('@/services/documentFile.service', () => ({
  documentFileService: {
    getBlob: () => Promise.reject(Object.assign(new Error('HTTP 404'), { status: 404 })),
    getPreview: () => Promise.reject(Object.assign(new Error('HTTP 404'), { status: 404 })),
  },
}));
const docs: Documentation[] = [];
vi.mock('@/features/kb/shell', () => ({
  documentationService: {
    getDocumentationFormatted: (id: number) => getDocumentationFormatted(id),
    listDocumentation: () => Promise.resolve(docs),
    getDocumentation: (id: number) => getDocumentation(id),
    getStats: () => Promise.resolve({ totalDocs: docs.length, totalChunks: 0, totalReferences: 0 }),
    getDocumentationContent: (id: number) => getDocumentationContent(id),
    getProgress: vi.fn(),
  },
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [], teamsEnabled: false }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: () => Promise.resolve({ data: [] }) },
}));

const { DocumentationSettings } = await import('../../DocumentationSettings');
const { LinkedDocumentPreview } = await import('../LinkedDocumentPreview');

const makeDoc = (over: Partial<Documentation> = {}): Documentation =>
  ({
    id: 7,
    organizationId: 1,
    departmentIds: [],
    documentType: 'general',
    chunkingStrategy: 'auto',
    allowQuoting: true,
    title: 'Clinic handbook',
    description: null,
    filename: 'handbook.md',
    originalFilename: 'handbook.md',
    mimeType: 'text/markdown',
    size: 3000,
    url: '/uploads/handbook.md',
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

const CHUNKS = [
  '# Opening hours\n\nWe are open on weekdays from nine to five.',
  '## Returns\n\nSend the parcel back within **thirty days** of delivery.\n\n- Keep the receipt with it.',
  '## Insurance\n\nWe are in network with these plans.',
];
const chunkRows = (chunks: string[]) => chunks.map((content, chunkIndex) => ({ content, chunkIndex }));

const scrollIntoView = vi.fn();
const openAt = (url: string, doc: Documentation = makeDoc()) => {
  docs.splice(0, docs.length, doc);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <DocumentationSettings />
      </MemoryRouter>
    </QueryClientProvider>
  );
};
const marked = () => document.querySelector('[data-doc-focus]');

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  getDocumentationContent.mockResolvedValue(chunkRows(CHUNKS));
  getDocumentationFormatted.mockResolvedValue({ contentMarkdown: null, sourcePath: null });
});
afterEach(() => {
  cleanup();
  scrollIntoView.mockReset();
  getDocumentationContent.mockReset();
  getDocumentationFormatted.mockReset();
  getDocumentation.mockReset();
});

describe('a source link opens its document at the cited section', () => {
  it('the link carries the document and the chunk', () => {
    expect(documentationHref(7606, { chunkIndex: 0 })).toBe('/knowledge-base?docId=7606&open=1&chunk=0#documentation');
    expect(documentationHref(7606, { chunkId: 412 })).toBe('/knowledge-base?docId=7606&open=1&chunkId=412#documentation');
    expect(documentationHref(7606)).toBe('/knowledge-base?docId=7606&open=1#documentation');
    expect(documentationHref(7606, { chunkIndex: null })).toBe('/knowledge-base?docId=7606&open=1#documentation');
    expect(documentationHref(undefined, { chunkIndex: 3 })).toBe('/knowledge-base#documentation');
  });

  it('⛔ ?docId=&chunk= opens the preview with no click and marks where that chunk starts', async () => {
    openAt('/settings?open=1&docId=7&chunk=1#ai/documentation');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Clinic handbook')).toBeInTheDocument();
    await waitFor(() => expect(marked()).not.toBeNull());
    // "Returns" is too short to place a chunk; the next line is found through its bold words.
    expect(marked()?.tagName).toBe('P');
    expect(marked()?.textContent).toBe('Send the parcel back within thirty days of delivery.');
    expect(scrollIntoView.mock.contexts).toContain(marked());
  });

  it('⛔ &chunkId= (all a suggested answer carries) opens at that chunk too', async () => {
    getDocumentationContent.mockResolvedValue(
      CHUNKS.map((content, chunkIndex) => ({ id: 410 + chunkIndex, content, chunkIndex }))
    );
    openAt('/settings?open=1&docId=7&chunkId=411#ai/documentation');
    await waitFor(() => expect(marked()).not.toBeNull());
    expect(marked()?.textContent).toBe('Send the parcel back within thirty days of delivery.');
  });

  it('a chunk id that is not in the document opens it at the top', async () => {
    openAt('/settings?open=1&docId=7&chunkId=999#ai/documentation');
    await screen.findByTestId('doc-preview-body');
    expect(marked()).toBeNull();
  });

  it('⛔ closing the opened document does not open it again', async () => {
    openAt('/settings?open=1&docId=7&chunk=1#ai/documentation');
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('?docId= alone opens the document and marks nothing', async () => {
    openAt('/settings?open=1&docId=7#ai/documentation', makeDoc({ externalSource: 'confluence:3' }));
    await screen.findByTestId('doc-preview-body');
    expect(marked()).toBeNull();
  });

  it('a synced page shown formatted is still opened at the cited chunk', async () => {
    getDocumentationFormatted.mockResolvedValue({
      contentMarkdown: '# Handbook\n\nIntro.\n\n## Insurance\n\nWe are in network with *these* plans.',
      sourcePath: null,
    });
    openAt('/settings?open=1&docId=7&chunk=2', makeDoc({ externalSource: 'confluence:3' }));
    await waitFor(() => expect(marked()).not.toBeNull());
    // The chunk's own heading is long enough to place it: the section is marked at its title.
    expect(marked()?.tagName).toBe('H2');
    expect(marked()?.textContent).toBe('Insurance');
    expect(getDocumentationContent).toHaveBeenCalledTimes(1);
  });

  it('plain text marks the first line of the chunk', async () => {
    getDocumentationContent.mockResolvedValue(
      chunkRows(['Opening hours are nine to five.', 'Returns are accepted for thirty days.'])
    );
    openAt('/settings?open=1&docId=7&chunk=1', makeDoc({ mimeType: 'text/plain' }));
    await waitFor(() => expect(marked()).not.toBeNull());
    expect(marked()?.tagName).toBe('MARK');
    expect(marked()?.textContent).toBe('Returns are accepted for thirty days.');
    expect(screen.getByTestId('doc-preview-body').textContent).toContain('Opening hours are nine to five.');
  });

  it('⛔ a document that is not in the list says so instead of showing an unmarked list', async () => {
    openAt('/settings?docId=99#ai/documentation');
    expect(await screen.findByText('The linked document was not found in this list.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('⛔ ?docId= without open=1 (a notification about a document) shows the row, not the text', async () => {
    // A synced page: its preview is the text dialog, with no file viewer to wait for first.
    openAt('/settings?docId=7#ai/documentation', makeDoc({ externalSource: 'confluence:3' }));
    await screen.findByRole('button', { name: 'View content' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getDocumentationContent).not.toHaveBeenCalled();
    expect(document.getElementById('doc-7')?.className).toContain('ring-2');
  });

  it('a document still being processed is not opened (it has no text yet)', async () => {
    openAt(
      '/settings?open=1&docId=7#ai/documentation',
      makeDoc({ status: 'processing', externalSource: 'confluence:3' })
    );
    await waitFor(() => expect(document.getElementById('doc-7')).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getDocumentationContent).not.toHaveBeenCalled();
  });

  it('no ?docId= opens nothing', async () => {
    openAt('/settings#ai/documentation');
    await screen.findByRole('button', { name: 'View content' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('The linked document was not found in this list.')).toBeNull();
  });
});

describe('the linked document for someone without the Documentation page (an agent)', () => {
  const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
  const openLinked = (props: { docId: number; chunkIndex?: number; chunkId?: number }) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/knowledge-base?docId=7#documentation']}>
          <LinkedDocumentPreview
            {...props}
            loaders={{
              getDocumentation: (id) => getDocumentation(id) as Promise<Documentation>,
              getDocumentationContent: (id) =>
                getDocumentationContent(id) as Promise<{ content: string; chunkIndex: number }[]>,
              getDocumentationFormatted: (id) =>
                getDocumentationFormatted(id) as Promise<{ contentMarkdown: null; sourcePath: null }>,
            }}
          />
          <Where />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('⛔ loads that one document (never the list) and opens it at the cited chunk', async () => {
    getDocumentation.mockResolvedValue(makeDoc());
    openLinked({ docId: 7, chunkIndex: 1 });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Clinic handbook')).toBeInTheDocument();
    await waitFor(() => expect(marked()).not.toBeNull());
    expect(marked()?.textContent).toBe('Send the parcel back within thirty days of delivery.');
    expect(getDocumentation).toHaveBeenCalledWith(7);
  });

  it('closing it goes to the threads', async () => {
    getDocumentation.mockResolvedValue(makeDoc());
    openLinked({ docId: 7, chunkIndex: 1 });
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/threads'));
  });

  it("⛔ a deleted or another team's document (404), or an older backend (403), says so", async () => {
    getDocumentation.mockRejectedValue(Object.assign(new Error('HTTP 404'), { status: 404 }));
    openLinked({ docId: 7 });
    expect(await screen.findByText(/This document cannot be opened/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to threads' })).toHaveAttribute('href', '/threads');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('placing a chunk in the page', () => {
  it('⛔ lines the previous chunk also holds (the seam overlap) are not the start of this one', () => {
    const previous = 'Earlier text.\nThe last full line of the section before.';
    const chunk = 'The last full line of the section before.\nThe first line of this section.';
    expect(focusLines(chunk, previous)).toEqual(['The first line of this section.']);
  });

  it('a chunk of only short lines is placed by them; long lines win when there are any', () => {
    expect(focusLines('Mon 9-5\nTue 9-5')).toEqual(['Mon 9-5', 'Tue 9-5']);
    expect(focusLines('Hours\nWe are open on weekdays.')).toEqual(['We are open on weekdays.']);
  });

  it('a list item and a table row are found despite their Markdown marks', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<ul><li><p>Plan A: PPO and Open Access Plus.</p></li></ul><table><tr><td>Monday</td><td>nine to five</td></tr></table>';
    const find = (line: string) => findFocusBlock(root, { lines: [line], at: 0 });
    expect(find('- Plan A: PPO and Open Access Plus.')).toMatchObject({ exact: true, element: { tagName: 'P' } });
    expect(find('| Monday | nine to five |')).toMatchObject({ exact: true, element: { tagName: 'TR' } });
  });

  it('⛔ a line that repeats (the same heading in every section) is taken where the chunk is', () => {
    const root = document.createElement('div');
    root.innerHTML = Array.from(
      { length: 4 },
      (_, part) => `<h2>How to return it</h2><p>Details of part ${part}, long enough to take room on the page.</p>`
    ).join('');
    const headings = Array.from(root.querySelectorAll('h2'));
    expect(findFocusBlock(root, { lines: ['## How to return it'], at: 0 })?.element).toBe(headings[0]);
    expect(findFocusBlock(root, { lines: ['## How to return it'], at: 0.75 })?.element).toBe(headings[3]);
    const text = 'Returns\nfirst part\nReturns\nsecond part';
    expect(findFocusRange(text, { lines: ['Returns'], at: 0.6 })).toEqual({ start: 19, end: 26 });
  });

  it('⛔ a line of the chunk that is on the page once decides which repeat of its heading it is', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<h2>How to return it</h2><p>Parcels go back by courier.</p>' +
      '<h2>How to return it</h2><p>Letters go back by post office.</p>' +
      '<h2>How to return it</h2><p>Pallets go back by freight truck.</p>';
    const headings = Array.from(root.querySelectorAll('h2'));
    // The place alone (0.9) would say the third; the chunk's own second line says the second.
    const found = findFocusBlock(root, {
      lines: ['## How to return it', 'Letters go back by post office.'],
      at: 0.9,
    });
    expect(found?.element).toBe(headings[1]);
  });

  it('⛔ inside a paragraph pages long, the line itself is marked (through bold, across line breaks)', () => {
    const root = document.createElement('div');
    root.innerHTML = `<p>${'Filler sentence of the page. '.repeat(40)}<br>Refunds are paid <strong>within ten days</strong> of receipt.<br>More text after it.</p>`;
    const block = root.querySelector('p') as HTMLElement;
    const mark = markLineStart(block, 'Refunds are paid **within ten days** of receipt.');
    expect(mark?.tagName).toBe('MARK');
    expect(mark?.textContent).toBe('Refunds are paid ');
    expect(block.textContent).toContain('Refunds are paid within ten days of receipt.');
    expect(markLineStart(block, 'A line that is not in this block.')).toBeNull();
  });

  it('⛔ a document that renders as one long paragraph is opened at the chunk, not at its top', async () => {
    const long = Array.from({ length: 30 }, (_, row) => `Row ${row} of a long extracted page with words.`).join('\n');
    getDocumentationContent.mockResolvedValue(chunkRows([long, 'The warranty lasts two full years.\nSecond line of it.']));
    openAt('/settings?open=1&docId=7&chunk=1');
    await waitFor(() => expect(marked()).not.toBeNull());
    expect(marked()?.tagName).toBe('MARK');
    expect(marked()?.textContent).toBe('The warranty lasts two full years.');
  });

  it('a chunk with no findable line is scrolled to at its place, and not marked as found', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>First paragraph of the page.</p><p>Second paragraph of the page.</p>';
    const found = findFocusBlock(root, { lines: ['A line that is nowhere here.'], at: 0.9 });
    expect(found).toMatchObject({ exact: false });
    expect(found?.element.textContent).toBe('Second paragraph of the page.');
  });

  it('the place of a chunk is the share of the document before it', () => {
    expect(chunkFocus(['aaaa', 'bbbb the second chunk', 'cc'], 1)).toEqual({
      lines: ['bbbb the second chunk'],
      at: 4 / 27,
    });
    expect(chunkFocus(['aaaa'], 3)).toBeNull();
    expect(chunkFocus(['aaaa'], -1)).toBeNull();
  });

  it('a long document renders as far as the part holding the chunk, never whole on a miss', () => {
    const parts = ['first part text', 'second part with the wanted line', 'third part'];
    expect(sectionsToShow(parts, { lines: ['the wanted line'], at: 0.4 })).toBe(2);
    expect(sectionsToShow(parts, null)).toBe(1);
    // Found through Markdown marks the chunk does not have.
    expect(sectionsToShow(['intro', 'the **wanted** line here'], { lines: ['- the wanted line'], at: 0.5 })).toBe(2);
    // A repeated line: the part at the chunk's place.
    expect(sectionsToShow(['same line here', 'filler text', 'same line here'], { lines: ['same line here'], at: 0.9 })).toBe(3);
    // ⛔ In no part: the part at its place only, not everything.
    expect(sectionsToShow(parts, { lines: ['written differently in the page'], at: 0 })).toBe(1);
  });
});
