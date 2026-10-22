/**
 * Settings → Integrations → Import (Zendesk). The arithmetic of the preview (spam counted twice
 * by the backend), the CSV refusal before any upload, the older-backend notice, the chunked
 * upload, and that Import asks first and then calls the backend. All data invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ZendeskImportSettings } from '../ZendeskImportSettings';
import { exportFileProblem, summarizePreview } from '../zendeskImportSummary';
import {
  PART_BYTES,
  uploadZendeskExport,
  zendeskImportService,
} from '@/services/zendeskImport.service';

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args) as unknown,
    post: (...args: unknown[]) => post(...args) as unknown,
    put: (...args: unknown[]) => put(...args) as unknown,
    delete: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const previewedRun = {
  id: 5,
  status: 'previewed',
  fileName: 'export.json.zip',
  fileSize: 1000,
  source: 'acme',
  options: {
    includeSpam: false,
    includeProbable: false,
    groupDepartments: {},
    defaultDepartmentId: null,
    defaultSourceId: null,
  },
  preview: {
    subdomain: 'acme',
    tickets: 100,
    unreadableLines: 0,
    notTickets: 0,
    counts: { new: 70, spam_new: 40, spamClosed: 40, messageId: 20, followup: 8, conflict: 2 },
    conflicts: [{ ticketId: 1, conversationIds: [3, 4] }],
    conflictsListed: 1,
    groups: { Orders: 60, Info: 40 },
    toAddresses: { 'orders@shop.example': { count: 60, ours: true } },
    assignees: {
      'kurt@shop.example': { count: 30, odlyUserId: 9 },
      'nobody@shop.example': { count: 3, odlyUserId: null },
    },
  },
  report: null,
  progress: null,
  error: null,
  partsUploaded: 1,
  createdAt: '2026-10-22T10:00:00Z',
  updatedAt: '2026-10-22T10:00:00Z',
  finishedAt: null,
};

const routeGet = (runs: unknown[]) => (url: string) => {
  if (url === '/api/imports/zendesk/runs')
    return Promise.resolve({ data: { success: true, data: runs } });
  if (url.startsWith('/api/departments'))
    return Promise.resolve({ data: { success: true, data: [{ id: 1, name: 'Support' }] } });
  if (url === '/api/integrations') return Promise.resolve({ data: { success: true, data: [] } });
  return Promise.resolve({ data: { success: true, data: runs[0] } });
};

describe('summarizePreview', () => {
  it('takes spam off its kind when spam is skipped — the backend counts it twice', () => {
    const summary = summarizePreview(
      previewedRun.preview.counts,
      { includeSpam: false, includeProbable: false },
      100
    );
    expect(summary.created).toBe(30);
    expect(summary.joined).toBe(28);
    expect(summary.skippedSpam).toBe(40);
  });

  it('CONTROL: with spam included the kinds are taken as they are', () => {
    const summary = summarizePreview(
      previewedRun.preview.counts,
      { includeSpam: true, includeProbable: false },
      100
    );
    expect(summary.created).toBe(70);
    expect(summary.skippedSpam).toBe(0);
  });

  it('probable matches are new threads unless the admin opts in', () => {
    const counts = { new: 10, probable: 4 };
    expect(
      summarizePreview(counts, { includeSpam: false, includeProbable: false }, 14)
    ).toMatchObject({ created: 14, joined: 0 });
    expect(
      summarizePreview(counts, { includeSpam: false, includeProbable: true }, 14)
    ).toMatchObject({ created: 10, joined: 4 });
  });
});

describe('exportFileProblem', () => {
  it('refuses a CSV before anything is uploaded, and accepts the JSON export', () => {
    expect(exportFileProblem({ name: 'tickets.csv', size: 10 })).toMatch(/JSON/);
    expect(exportFileProblem({ name: 'export-1.json.zip', size: 10 })).toBeNull();
    expect(exportFileProblem({ name: 'export_1.json', size: 10 })).toBeNull();
  });
});

describe('uploadZendeskExport', () => {
  it('sends the file in parts, by index, and retries a failed part', async () => {
    put.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ data: {} });
    const file = new Blob([new Uint8Array(PART_BYTES + 10)]);
    const progress: number[] = [];

    await uploadZendeskExport(5, file, (sent) => progress.push(sent));

    const urls = put.mock.calls.map((call) => call[0] as string);
    expect(urls).toEqual([
      '/api/imports/zendesk/runs/5/parts/0',
      '/api/imports/zendesk/runs/5/parts/0',
      '/api/imports/zendesk/runs/5/parts/1',
    ]);
    expect(progress).toEqual([PART_BYTES, PART_BYTES + 10]);
  });
});

describe('ZendeskImportSettings', () => {
  it('an older backend without the import: a notice, not an error', async () => {
    get.mockRejectedValue({ status: 404, data: '<html>Cannot GET</html>' });
    render(<ZendeskImportSettings />);
    expect(await screen.findByText(/not available on this server yet/)).toBeTruthy();
  });

  it('shows what will happen, who stays unassigned, and imports only after confirming', async () => {
    get.mockImplementation(routeGet([previewedRun]));
    post.mockResolvedValue({ data: { success: true, data: {} } });
    render(<ZendeskImportSettings />);

    expect(await screen.findByText(/become new threads/)).toBeTruthy();
    expect(screen.getByText(/2 tickets match more than one Odly thread/)).toBeTruthy();
    expect(screen.getByText(/nobody@shop\.example/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Import 58 tickets/ }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/imports/zendesk/runs/5/apply', {}));
  });

  it('the service unwraps the envelope', async () => {
    get.mockResolvedValue({ data: { success: true, data: [previewedRun] } });
    expect((await zendeskImportService.list())[0]?.id).toBe(5);
  });
});
