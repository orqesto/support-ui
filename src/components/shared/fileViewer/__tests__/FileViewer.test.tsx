/**
 * The file viewer on its own: stepping, closing, the loading and error states, the "no preview"
 * card, and the Word/Excel previews the backend renders (`GET /api/attachments/:id/preview`,
 * mocked here to the contract in the spec).
 */
import { useState } from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import type { Attachment } from '@/types/ai';
import { useAuthStore } from '@/stores/authStore';

const apiGet = vi.fn<(path: string, config?: unknown) => Promise<{ data: unknown }>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (path: string, config?: unknown) => apiGet(path, config) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { FileViewer } from '../FileViewer';
import { attachmentItem, parseCsv, type ViewerItem } from '../fileViewerModel';

const att = (id: number, mimeType: string, originalFilename: string, size = 1000): Attachment =>
  ({ id, mimeType, originalFilename, size, messageEventId: 1 }) as Attachment;

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

const created: Blob[] = [];
const revoked: string[] = [];

const Harness = ({
  items,
  start = 0,
  onClose = vi.fn(),
}: {
  items: ViewerItem[];
  start?: number;
  onClose?: () => void;
}) => {
  const [index, setIndex] = useState(start);
  return <FileViewer items={items} index={index} onIndexChange={setIndex} onClose={onClose} />;
};

beforeEach(() => {
  created.length = 0;
  revoked.length = 0;
  useAuthStore.setState({ selectedOrganizationId: 5 });
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      created.push(blob);
      return `blob:url-${created.length}`;
    },
    revokeObjectURL: (url: string) => revoked.push(url),
  });
  apiGet.mockImplementation((path: string) =>
    Promise.resolve({ data: new Blob([`bytes of ${path}`]) })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  apiGet.mockReset();
  useAuthStore.setState({ selectedOrganizationId: null });
});

const photo = att(1, 'image/jpeg', 'label.jpg');
const pdf = att(2, 'application/pdf', 'invoice.pdf');
const inline: ViewerItem = {
  type: 'inline',
  key: 'img:3:0',
  src: 'https://api.example.test/api/organizations/5/messages/events/3/image?cid=a1',
  name: 'receipt.png',
};
const three = [attachmentItem(photo), attachmentItem(pdf), inline];

describe('FileViewer — stepping', () => {
  it('steps with the buttons AND ←/→, shows "n of N", and fetches only the current item', async () => {
    render(<Harness items={three} />);
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.getByText('label.jpg')).toBeTruthy();
    // A picture is loaded by the browser from the workspace-scoped url — no fetch of ours.
    expect(screen.getByAltText('label.jpg').getAttribute('src')).toContain(
      '/api/organizations/5/attachments/1/download'
    );
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Previous file' })).toBeInactive();

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByText('2 of 3')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/api/attachments/2/download', { responseType: 'blob' });
    expect(created.at(-1)?.type).toBe('application/pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Next file' }));
    expect(screen.getByText('3 of 3')).toBeTruthy();
    expect(screen.getByAltText('receipt.png').getAttribute('src')).toBe(inline.src);
    // Leaving the PDF released its object url.
    expect(revoked).toContain('blob:url-1');
    expect(screen.getByRole('button', { name: 'Next file' })).toBeInactive();

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });

  it('a single item shows no counter and no arrows', () => {
    render(<Harness items={[attachmentItem(photo)]} />);
    expect(screen.queryByText(/of 1/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next file' })).toBeNull();
  });
});

describe('FileViewer — closing', () => {
  it('Escape closes', () => {
    const onClose = vi.fn();
    render(<Harness items={three} onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button and the backdrop close', () => {
    const onClose = vi.fn();
    render(<Harness items={three} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('the empty space around a picture closes; the picture itself does not', () => {
    const onClose = vi.fn();
    render(<Harness items={three} onClose={onClose} />);
    fireEvent.click(screen.getByAltText('label.jpg'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('image-stage'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('FileViewer — loading and failure', () => {
  it('shows a loading state until the picture has loaded', () => {
    render(<Harness items={three} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
    fireEvent.load(screen.getByAltText('label.jpg'));
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
  });

  it('a picture that fails to load says so and offers Download', () => {
    render(<Harness items={three} />);
    fireEvent.error(screen.getByAltText('label.jpg'));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('could not be shown');
    expect(within(alert).getByRole('button', { name: /Download/ })).toBeTruthy();
  });

  it('a file type with no preview gets the card: name, size, Download, Open in new tab', () => {
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<Harness items={[attachmentItem(att(4, 'application/zip', 'photos.zip', 2048))]} />);
    expect(screen.getByText('No preview is available for this file type.')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Open in new tab/ })).toHaveLength(2);
    expect(apiGet).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: /Download/ })[0]);
    return waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/api/attachments/4/download', {
        responseType: 'blob',
      });
      expect(clicks).toHaveBeenCalled();
    });
  });

  it('old .doc/.xls are the card, never sent to the preview endpoint', () => {
    render(<Harness items={[attachmentItem(att(5, 'application/msword', 'old.doc'))]} />);
    expect(screen.getByText('No preview is available for this file type.')).toBeTruthy();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('Open in new tab never hands the browser a live html page from a customer file', async () => {
    const tab = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    render(<Harness items={[attachmentItem(att(6, 'text/html', 'page.html'))]} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Open in new tab/ })[0]);
    await waitFor(() => expect(tab.location.href).toMatch(/^blob:/));
    expect(created.at(-1)?.type).toBe('application/octet-stream');
  });
});

describe('FileViewer — Word and Excel through the backend preview', () => {
  it('renders a docx as SANITIZED html', async () => {
    apiGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          kind: 'html',
          html: '<h1>Refund terms</h1><p>Within 30 days</p><script>window.x=1</script><img src="x" onerror="window.y=1">',
          truncated: false,
        },
      },
    });
    const docx = att(
      9,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'terms.docx'
    );
    render(<Harness items={[attachmentItem(docx)]} />);
    const doc = await screen.findByTestId('document-preview');
    expect(apiGet).toHaveBeenCalledWith('/api/attachments/9/preview', undefined);
    expect(doc.textContent).toContain('Within 30 days');
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('[onerror]')).toBeNull();
  });

  it("keeps a Word file's embedded data:image pictures, strips javascript:/data: links and remote images", async () => {
    apiGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          kind: 'html',
          html:
            '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="Embedded chart"></p>' +
            '<img src="https://tracker.example.test/p.gif" alt="Remote">' +
            '<img src="data:text/html;base64,PHNjcmlwdD4=" alt="Not a picture">' +
            '<a href="javascript:alert(1)">js link</a>' +
            '<a href="data:text/html,<script>alert(1)</script>">data link</a>' +
            '<a href="https://shop.example.test/terms">terms</a>',
          truncated: false,
        },
      },
    });
    const docx = att(
      15,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'chart.docx'
    );
    render(<Harness items={[attachmentItem(docx)]} />);
    const doc = await screen.findByTestId('document-preview');
    expect(within(doc).getByAltText('Embedded chart').getAttribute('src')).toMatch(
      /^data:image\/png/
    );
    expect(within(doc).queryByAltText('Remote')).toBeNull();
    expect(within(doc).queryByAltText('Not a picture')).toBeNull();
    expect(within(doc).getByText('js link').hasAttribute('href')).toBe(false);
    expect(within(doc).getByText('data link').hasAttribute('href')).toBe(false);
    const safe = within(doc).getByText('terms');
    expect(safe.getAttribute('href')).toBe('https://shop.example.test/terms');
    expect(safe.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('a docx sent as octet-stream is still previewed, by its extension', async () => {
    apiGet.mockResolvedValue({
      data: { success: true, data: { kind: 'html', html: '<p>ok</p>', truncated: false } },
    });
    render(<Harness items={[attachmentItem(att(10, 'application/octet-stream', 'terms.docx'))]} />);
    await screen.findByTestId('document-preview');
    expect(apiGet).toHaveBeenCalledWith('/api/attachments/10/preview', undefined);
  });

  it('renders an xlsx as sheet tabs and a table, with the truncated notice', async () => {
    apiGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          kind: 'sheets',
          truncated: true,
          sheets: [
            {
              name: 'Orders',
              rows: [
                ['Order', 'Qty'],
                ['A-1', '2'],
              ],
              truncated: true,
            },
            { name: 'Totals', rows: [['Sum', '42']], truncated: false },
          ],
        },
      },
    });
    const xlsx = att(
      11,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'orders.xlsx'
    );
    render(<Harness items={[attachmentItem(xlsx)]} />);
    const sheet = await screen.findByTestId('sheet-preview');
    expect(within(sheet).getByText('A-1')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('shortened');
    fireEvent.click(screen.getByRole('button', { name: 'Totals' }));
    expect(within(sheet).getByText('42')).toBeTruthy();
    expect(within(sheet).queryByText('A-1')).toBeNull();
  });

  it.each([
    [413, 'too large to preview'],
    [415, 'cannot be previewed'],
    [422, 'damaged or password-protected'],
  ])('a %i from the preview endpoint says why, with Download', async (status, words) => {
    apiGet.mockRejectedValue(httpError(status));
    const xlsx = att(
      12,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'big.xlsx'
    );
    render(<Harness items={[attachmentItem(xlsx)]} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(words);
    expect(within(alert).getByRole('button', { name: /Download/ })).toBeTruthy();
  });
});

describe('FileViewer — text and csv', () => {
  it('shows a csv as a table, quoted commas intact', async () => {
    apiGet.mockResolvedValue({ data: new Blob(['name,note\n"Lee, Ann","said ""hi"""\n']) });
    render(<Harness items={[attachmentItem(att(13, 'text/csv', 'list.csv'))]} />);
    expect(await screen.findByText('Lee, Ann')).toBeTruthy();
    expect(screen.getByText('said "hi"')).toBeTruthy();
  });

  it('shows a txt as text', async () => {
    apiGet.mockResolvedValue({ data: new Blob(['tracking 123']) });
    render(<Harness items={[attachmentItem(att(14, 'text/plain', 'notes.txt'))]} />);
    expect(await screen.findByText('tracking 123')).toBeTruthy();
  });

  it('parseCsv caps the rows it reads', () => {
    const text = Array.from({ length: 10 }, (_unused, row) => `r${row},x`).join('\n');
    const { rows, truncated } = parseCsv(text, 3);
    expect(rows).toHaveLength(3);
    expect(truncated).toBe(true);
  });
});
