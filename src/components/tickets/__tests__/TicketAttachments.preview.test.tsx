/**
 * TicketAttachments must tell the preview dialog where the bytes live: a Jira-hosted
 * attachment (externalId + an absolute http url) downloads through the Jira proxy route,
 * everything else through the local route. Uses a PDF so the image-thumbnail loader
 * (which calls the same endpoints) stays out of the assertion.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { Attachment } from '@/services/comments.service';

const getBlob = vi.fn<(...args: unknown[]) => Promise<{ data: Blob }>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getBlob(...args),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));
const getTicketAttachments =
  vi.fn<(...args: unknown[]) => Promise<{ success: boolean; data: Attachment[] }>>();
vi.mock('@/services/comments.service', () => ({
  commentsService: { getTicketAttachments: (...args: unknown[]) => getTicketAttachments(...args) },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: vi.fn(),
  releaseSocket: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { TicketAttachments } from '@/components/tickets/TicketAttachments';

const pdf = (over: Partial<Attachment>): Attachment =>
  ({
    id: 42,
    originalFilename: 'invoice.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    createdAt: '2026-09-01T10:00:00Z',
    url: '/uploads/invoice.pdf',
    externalId: null,
    ...over,
  }) as Attachment;

const previewAndGetPath = async (attachment: Attachment) => {
  getTicketAttachments.mockResolvedValue({ success: true, data: [attachment] });
  render(<TicketAttachments ticketId={5} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));
  await waitFor(() => expect(getBlob).toHaveBeenCalled());
  return getBlob.mock.calls;
};

describe('TicketAttachments preview routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:preview-url',
      revokeObjectURL: vi.fn(),
    });
    getBlob.mockResolvedValue({ data: new Blob(['%PDF-1.4']) });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('downloads a Jira-hosted attachment (externalId + http url) through the Jira route', async () => {
    const calls = await previewAndGetPath(
      pdf({ externalId: '10001', url: 'https://acme.atlassian.net/secure/attachment/10001' })
    );
    expect(calls).toEqual([['/api/attachments/jira/42/download', { responseType: 'blob' }]]);
  });

  it('uses the local route when externalId is set but the url is not http', async () => {
    const calls = await previewAndGetPath(pdf({ externalId: '10001', url: '/uploads/x.pdf' }));
    expect(calls).toEqual([['/api/attachments/42/download', { responseType: 'blob' }]]);
  });

  it('uses the local route when there is no externalId', async () => {
    const calls = await previewAndGetPath(
      pdf({ externalId: null, url: 'https://cdn.example.com/x.pdf' })
    );
    expect(calls).toEqual([['/api/attachments/42/download', { responseType: 'blob' }]]);
  });

  it('uses the local route when externalId is an empty string', async () => {
    const calls = await previewAndGetPath(
      pdf({ externalId: '', url: 'https://cdn.example.com/x.pdf' } as Partial<Attachment>)
    );
    expect(calls).toEqual([['/api/attachments/42/download', { responseType: 'blob' }]]);
  });
});
