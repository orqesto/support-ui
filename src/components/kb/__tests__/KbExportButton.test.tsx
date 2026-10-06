/**
 * The KB export button, through the REAL api-client with only the wire faked: the count it shows
 * is the one the backend answered for the same filters, an older backend shows no button, and a
 * file that could not be downloaded says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok, routeAbsent, type WireHandler } from '@/test/apiTransport';
import { KbExportButton } from '../KbExportButton';

let transport: ReturnType<typeof installTransport>;
const click = vi.fn();

const useBackend = (handler: WireHandler) => {
  transport = installTransport(apiClient, handler);
};

beforeEach(() => {
  click.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:export');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
});

afterEach(() => {
  transport.restore();
  vi.restoreAllMocks();
});

const file = new Blob(['id,type\r\n'], { type: 'text/csv' });

describe('KbExportButton', () => {
  it('shows the count the backend answered for this type, and downloads with the same filter', async () => {
    useBackend((request) =>
      request.params.count === '1'
        ? ok({ count: 12, cap: 10000, truncated: false })
        : { status: 200, data: file }
    );
    render(<KbExportButton type="qa_pair" refreshKey={0} />);

    const button = await screen.findByRole('button', { name: 'Export approved to CSV (12)' });
    expect(transport.calls('GET', '/api/knowledge-base/export.csv')[0].params).toMatchObject({
      count: '1',
      type: 'qa_pair',
    });

    await userEvent.click(button);
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const download = transport.calls('GET', '/api/knowledge-base/export.csv')[1];
    expect(download.params).toEqual({ type: 'qa_pair' });
  });

  it('sends no type for the All and any other tab', async () => {
    useBackend(() => ok({ count: 3, cap: 10000, truncated: false }));
    render(<KbExportButton type="all" refreshKey={0} />);
    await screen.findByRole('button', { name: 'Export approved to CSV (3)' });
    expect(transport.calls('GET', '/api/knowledge-base/export.csv')[0].params).toEqual({
      count: '1',
    });
  });

  it('shows no button on a backend without the export', async () => {
    useBackend(routeAbsent);
    render(<KbExportButton type="all" refreshKey={0} />);
    await waitFor(() => expect(transport.requests.length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('shows no button when the backend answers something that is not a count', async () => {
    useBackend(() => ok({}));
    render(<KbExportButton type="all" refreshKey={0} />);
    await waitFor(() => expect(transport.requests.length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('disables the button when nothing is approved to export', async () => {
    useBackend(() => ok({ count: 0, cap: 10000, truncated: false }));
    render(<KbExportButton type="all" refreshKey={0} />);
    expect(
      await screen.findByRole('button', { name: 'Export approved to CSV (0)' })
    ).toBeDisabled();
  });

  it('says so when the cap cuts the file', async () => {
    useBackend(() => ok({ count: 25000, cap: 10000, truncated: true }));
    render(<KbExportButton type="all" refreshKey={0} />);
    expect(
      await screen.findByText(/Only the first 10000 of 25000 entries are exported/)
    ).toBeTruthy();
  });

  it('keeps the button, without a number, when the count itself failed', async () => {
    useBackend(() => ({ status: 500, data: { success: false, message: 'boom' } }));
    render(<KbExportButton type="all" refreshKey={0} />);
    const button = await screen.findByRole('button', { name: 'Export approved to CSV' });
    expect(button).toBeEnabled();
  });

  it('reads the count again when the list changed', async () => {
    let count = 1;
    useBackend(() => ok({ count, cap: 10000, truncated: false }));
    const view = render(<KbExportButton type="all" refreshKey={0} />);
    await screen.findByRole('button', { name: 'Export approved to CSV (1)' });
    count = 2;
    view.rerender(<KbExportButton type="all" refreshKey={1} />);
    expect(await screen.findByRole('button', { name: 'Export approved to CSV (2)' })).toBeTruthy();
  });

  it('says so when the download fails', async () => {
    useBackend((request) =>
      request.params.count === '1'
        ? ok({ count: 4, cap: 10000, truncated: false })
        : { status: 500, data: { success: false, message: 'Export failed on the server' } }
    );
    render(<KbExportButton type="all" refreshKey={0} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Export approved to CSV (4)' })
    );
    expect(
      await screen.findByText(/Export failed on the server|Could not download the CSV/)
    ).toBeTruthy();
    expect(click).not.toHaveBeenCalled();
  });
});
