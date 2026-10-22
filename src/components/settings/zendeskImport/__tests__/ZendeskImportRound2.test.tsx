/**
 * Zendesk import tab, review round 2: an upload running in another tab is left alone, older
 * stopped uploads stay deletable, the earlier import's report stays visible (and is labelled as
 * earlier), "import spam" re-checks the export, leaving mid-upload is silent, and option saves
 * really are serialised when two are in flight. All data invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { ZendeskImportSettings } from '../ZendeskImportSettings';
import { useSerialOptionSaves } from '../useSerialOptionSaves';
import {
  apiError,
  appliedRun,
  previewedRun,
  routeGet,
  uploadingRun,
} from './zendeskImportFixtures';

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();
const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args) as unknown,
    post: (...args: unknown[]) => post(...args) as unknown,
    put: (...args: unknown[]) => put(...args) as unknown,
    delete: (...args: unknown[]) => del(...args) as unknown,
  },
}));

vi.mock('@/lib/toast', () => ({ toast: toastMock }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('ZendeskImportSettings — review round 2', () => {
  it('an upload running in another tab is not offered for deletion', async () => {
    const live = { ...uploadingRun, updatedAt: new Date().toISOString() };
    get.mockImplementation(routeGet([live]));
    render(<ZendeskImportSettings />);
    expect(await screen.findByText(/being uploaded in another tab or window/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete this import' })).toBeNull();
    expect(screen.queryByText(/This upload stopped before it finished/)).toBeNull();
  });

  it('an older stopped upload stays listed, with Delete, once a newer run exists', async () => {
    const olderStopped = { ...uploadingRun, id: 3, fileName: 'stopped-export.json.zip' };
    get.mockImplementation(routeGet([previewedRun, olderStopped]));
    del.mockResolvedValue({ data: { success: true, data: null } });
    render(<ZendeskImportSettings />);

    expect(await screen.findByText(/stopped-export\.json\.zip · started/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete the stopped upload stopped-export.json.zip' })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/imports/zendesk/runs/3'));
  });

  it('CONTROL: an older upload still running elsewhere is not listed as stopped', async () => {
    const olderLive = { ...uploadingRun, id: 3, updatedAt: new Date().toISOString() };
    get.mockImplementation(routeGet([previewedRun, olderLive]));
    render(<ZendeskImportSettings />);
    await screen.findByText(/become new threads/);
    expect(screen.queryByText('Stopped uploads')).toBeNull();
  });

  it('after a new upload the earlier import stays visible, labelled as earlier', async () => {
    let listed: unknown[] = [appliedRun];
    get.mockImplementation((url: string) => routeGet(listed)(url));
    const fresh = { ...uploadingRun, id: 8, partsUploaded: 0, updatedAt: new Date().toISOString() };
    const checking = { ...fresh, status: 'previewing', report: null };
    post.mockImplementation((url: string) => {
      if (url.endsWith('/complete')) listed = [checking, appliedRun];
      return Promise.resolve({
        data: { success: true, data: url.endsWith('/runs') ? fresh : checking },
      });
    });
    put.mockResolvedValue({ data: { success: true, data: {} } });
    render(<ZendeskImportSettings />);
    expect(await screen.findByText(/12 new threads/)).toBeTruthy();

    const input = await screen.findByLabelText('Zendesk export file');
    fireEvent.change(input, { target: { files: [new File(['{}'], 'export.json')] } });

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/imports/zendesk/runs/8/complete', {})
    );
    expect(await screen.findByText(/Earlier import \(.+\): first-export\.json\.zip/)).toBeTruthy();
    expect(screen.getByText(/12 new threads/)).toBeTruthy();
  });

  it('"Check again" on an imported run: its report is cleared, the older one is shown as earlier', async () => {
    const imported = { ...appliedRun, id: 6, fileName: 'second-export.json.zip' };
    const olderImport = {
      ...appliedRun,
      report: { ...appliedRun.report, counts: { created: 99 } },
    };
    let listed: unknown[] = [imported, olderImport];
    get.mockImplementation((url: string) => routeGet(listed)(url));
    post.mockImplementation(() => {
      listed = [{ ...imported, status: 'previewed', report: null }, olderImport];
      return Promise.resolve({ data: { success: true, data: {} } });
    });
    render(<ZendeskImportSettings />);
    expect(await screen.findByText(/12 new threads/)).toBeTruthy();
    expect(screen.queryByText(/Earlier import/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Check again/ }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/imports/zendesk/runs/6/preview', {})
    );
    expect(await screen.findByText(/Earlier import \(.+\): first-export\.json\.zip/)).toBeTruthy();
    expect(screen.getByText(/99 new threads/)).toBeTruthy();
    expect(screen.queryByText(/Last import/)).toBeNull();
  });

  it('turning "import spam" on saves it and checks the export again', async () => {
    get.mockImplementation(routeGet([previewedRun]));
    put.mockImplementation((_url: string, body: unknown) =>
      Promise.resolve({
        data: {
          success: true,
          data: { ...previewedRun, options: { ...previewedRun.options, ...(body as object) } },
        },
      })
    );
    post.mockResolvedValue({ data: { success: true, data: {} } });
    render(<ZendeskImportSettings />);

    fireEvent.click(
      await screen.findByRole('switch', { name: /Also import tickets Zendesk closed as spam/ })
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/imports/zendesk/runs/5/preview', {})
    );
    expect(put).toHaveBeenCalledWith('/api/imports/zendesk/runs/5/options', { includeSpam: true });
  });

  it('if the new check cannot start, the numbers are marked stale and Import waits', async () => {
    get.mockImplementation(routeGet([previewedRun]));
    put.mockImplementation((_url: string, body: unknown) =>
      Promise.resolve({
        data: {
          success: true,
          data: { ...previewedRun, options: { ...previewedRun.options, ...(body as object) } },
        },
      })
    );
    const reason = 'The previous step is still stopping — try again in a minute';
    post.mockRejectedValue(apiError(409, { success: false, error: reason }, reason));
    render(<ZendeskImportSettings />);

    fireEvent.click(
      await screen.findByRole('switch', { name: /Also import tickets Zendesk closed as spam/ })
    );
    expect(await screen.findByText(/numbers are from before the spam choice changed/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Import \d+ tickets/ }).hasAttribute('disabled')
    ).toBe(true);
  });

  it('leaving the screen mid-upload: no "Upload stopped" notice and no reload', async () => {
    get.mockImplementation(routeGet([]));
    post.mockResolvedValue({
      data: { success: true, data: { ...uploadingRun, partsUploaded: 0 } },
    });
    put.mockImplementation(
      (_url: string, _body: unknown, config: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          config.signal?.addEventListener('abort', () =>
            reject(
              Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' })
            )
          );
        })
    );
    const { unmount } = render(<ZendeskImportSettings />);
    const input = await screen.findByLabelText('Zendesk export file');
    fireEvent.change(input, { target: { files: [new File(['{}'], 'export.json')] } });
    await screen.findByRole('progressbar', { name: 'Upload progress' });
    const lists = () =>
      get.mock.calls.filter((call) => call[0] === '/api/imports/zendesk/runs').length;
    const before = lists();

    unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(toastMock.info).not.toHaveBeenCalled();
    expect(lists()).toBe(before);
  });
});

describe('useSerialOptionSaves', () => {
  it('two saves in flight: the second waits for the first and builds on what it saved', async () => {
    const run = previewedRun as unknown as Parameters<typeof useSerialOptionSaves>[0];
    const resolvers: Array<(value: unknown) => void> = [];
    put.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    const saved = (groupDepartments: Record<string, number>) => ({
      data: {
        success: true,
        data: { ...previewedRun, options: { ...previewedRun.options, groupDepartments } },
      },
    });
    const { result } = renderHook(() => useSerialOptionSaves(run, () => undefined));

    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.save((current) => ({
        groupDepartments: { ...current.groupDepartments, Orders: 1 },
      }));
      second = result.current.save((current) => ({
        groupDepartments: { ...current.groupDepartments, Info: 2 },
      }));
    });
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    // The second is not on the wire while the first is.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(put).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]?.(saved({ Orders: 1 }));
      await first;
    });
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenLastCalledWith('/api/imports/zendesk/runs/5/options', {
      groupDepartments: { Orders: 1, Info: 2 },
    });
    await act(async () => {
      resolvers[1]?.(saved({ Orders: 1, Info: 2 }));
      await second;
    });
    expect(await second).toBe(true);
    expect(result.current.saving).toBe(false);
  });
});
