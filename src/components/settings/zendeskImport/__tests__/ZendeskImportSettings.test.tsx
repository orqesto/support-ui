/**
 * Settings → Integrations → Import (Zendesk). The arithmetic of the preview (spam counted twice
 * by the backend; re-imported spam is updated, not skipped), the CSV refusal before any upload,
 * the older-backend notice, the chunked upload (abort, backoff, no retry on 4xx), an abandoned
 * upload after a reload, polling start/stop, delete, serialised option saves, a 409 from a step
 * that is still stopping, and the CSV download. All data invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { downloadConflicts } from '../ZendeskImportPreview';
import { ZendeskImportSettings } from '../ZendeskImportSettings';
import { exportFileProblem, summarizePreview } from '../zendeskImportSummary';
import {
  PART_BYTES,
  uploadZendeskExport,
  zendeskImportService,
} from '@/services/zendeskImport.service';
import { chooseOption } from '@/test/chooseOption';
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

describe('summarizePreview', () => {
  it('takes spam off its kind when spam is skipped — the backend counts it twice', () => {
    const summary = summarizePreview(
      previewedRun.preview.counts,
      { includeSpam: false, includeProbable: false },
      110
    );
    expect(summary.created).toBe(30);
    expect(summary.joined).toBe(33);
    expect(summary.skippedSpam).toBe(40);
  });

  it('re-import: already-imported spam is updated (not taken off "join"), unchanged spam is not "skipped as spam"', () => {
    const counts = {
      new: 10,
      spam_new: 4,
      mapped: 20,
      spam_mapped: 3,
      skipped_unchanged: 15,
      spam_skipped_unchanged: 5,
      skipped_deleted: 2,
      spamClosed: 12,
    };
    expect(
      summarizePreview(counts, { includeSpam: false, includeProbable: false }, 47)
    ).toMatchObject({ created: 6, joined: 20, unchanged: 15, skippedSpam: 4, deletedInOdly: 2 });
  });

  it('an older backend without the re-import keys: missing keys count as 0', () => {
    expect(
      summarizePreview(
        { new: 3, spamClosed: 1, spam_new: 1 },
        { includeSpam: false, includeProbable: false },
        3
      )
    ).toMatchObject({ created: 2, joined: 0, skippedSpam: 1, deletedInOdly: 0, unchanged: 0 });
  });

  it('CONTROL: with spam included the kinds are taken as they are', () => {
    const summary = summarizePreview(
      previewedRun.preview.counts,
      { includeSpam: true, includeProbable: false },
      110
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

    await uploadZendeskExport(5, file, (sent) => progress.push(sent), undefined, [0, 0]);

    const urls = put.mock.calls.map((call) => call[0] as string);
    expect(urls).toEqual([
      '/api/imports/zendesk/runs/5/parts/0',
      '/api/imports/zendesk/runs/5/parts/0',
      '/api/imports/zendesk/runs/5/parts/1',
    ]);
    expect(progress).toEqual([PART_BYTES, PART_BYTES + 10]);
  });

  it('a 4xx is not retried: the server refused the part, and says why', async () => {
    put.mockRejectedValue(
      apiError(
        409,
        { success: false, error: 'This import is no longer accepting parts' },
        'This import is no longer accepting parts'
      )
    );
    await expect(
      uploadZendeskExport(5, new Blob(['abc']), () => undefined, undefined, [0, 0])
    ).rejects.toThrow('This import is no longer accepting parts');
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a 5xx is retried up to 3 tries', async () => {
    put.mockRejectedValue(apiError(502, {}, 'A server error occurred.'));
    await expect(
      uploadZendeskExport(5, new Blob(['abc']), () => undefined, undefined, [0, 0])
    ).rejects.toThrow();
    expect(put).toHaveBeenCalledTimes(3);
  });

  it('waits before re-sending a failed part', async () => {
    vi.useFakeTimers();
    put.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ data: {} });
    const done = uploadZendeskExport(
      5,
      new Blob(['abc']),
      () => undefined,
      undefined,
      [1000, 4000]
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(put).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(put).toHaveBeenCalledTimes(2);
    await done;
  });

  it('passes the abort signal to the request, and an abort is not retried', async () => {
    const controller = new AbortController();
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
    const done = uploadZendeskExport(
      5,
      new Blob(['abc']),
      () => undefined,
      controller.signal,
      [0, 0]
    );
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(done).rejects.toMatchObject({ name: 'CanceledError' });
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe('downloadConflicts', () => {
  it('revokes the file URL only after the click, on a later tick', async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:conflicts');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    get.mockResolvedValue({ data: new Blob(['ticketId\n1']) });

    await downloadConflicts(5);
    expect(click).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith('blob:conflicts');
    click.mockRestore();
  });

  it("an error body sent as a Blob still shows the backend's reason", async () => {
    get.mockRejectedValue(
      apiError(
        404,
        new Blob([JSON.stringify({ success: false, error: 'No conflicts listed for this import' })])
      )
    );
    await expect(downloadConflicts(5)).rejects.toThrow('No conflicts listed for this import');
  });

  it('CONTROL: a 5xx keeps the masked message', async () => {
    get.mockRejectedValue(
      apiError(
        500,
        new Blob([JSON.stringify({ success: false, error: 'pg: relation missing' })]),
        'A server error occurred.'
      )
    );
    await expect(downloadConflicts(5)).rejects.toThrow('A server error occurred.');
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

    expect(screen.getByText('1 deleted in Odly — skipped')).toBeTruthy();
    expect(screen.getByText(/40 closed as spam by Zendesk are skipped/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Import 63 tickets/ }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/imports/zendesk/runs/5/apply', {}));
  });

  it('the service unwraps the envelope', async () => {
    get.mockResolvedValue({ data: { success: true, data: [previewedRun] } });
    expect((await zendeskImportService.list())[0]?.id).toBe(5);
  });
});

describe('ZendeskImportSettings — runs that are not simply "previewed"', () => {
  it('an upload abandoned before a reload is shown with Delete, and the last import stays visible', async () => {
    get.mockImplementation(routeGet([uploadingRun, appliedRun]));
    del.mockResolvedValue({ data: { success: true, data: null } });
    render(<ZendeskImportSettings />);

    expect(
      await screen.findByText(/This upload stopped before it finished \(2 parts sent\)/)
    ).toBeTruthy();
    expect(screen.getByText('Upload stopped')).toBeTruthy();
    expect(screen.getByText(/Earlier import \(.+\): first-export\.json\.zip/)).toBeTruthy();
    expect(screen.getByText(/12 new threads, 3 threads updated/)).toBeTruthy();
    // The earlier run's report is for reference: no follow-up steps that would act on it.
    expect(screen.queryByRole('button', { name: /Check again/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete this import' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/imports/zendesk/runs/7'));
  });

  it('"Stop upload" aborts the part on the wire and is a notice, not an error', async () => {
    get.mockImplementation(routeGet([]));
    post.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          success: true,
          data: url.endsWith('/runs') ? { ...uploadingRun, partsUploaded: 0 } : {},
        },
      })
    );
    let partSignal: AbortSignal | undefined;
    put.mockImplementation(
      (_url: string, _body: unknown, config: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          partSignal = config.signal;
          config.signal?.addEventListener('abort', () =>
            reject(
              Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' })
            )
          );
        })
    );
    render(<ZendeskImportSettings />);
    const input = await screen.findByLabelText('Zendesk export file');
    fireEvent.change(input, { target: { files: [new File(['{}'], 'export.json')] } });

    expect(await screen.findByRole('progressbar', { name: 'Upload progress' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Stop upload/ }));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith('Upload stopped'));
    expect(partSignal?.aborted).toBe(true);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('a step refused with 409 (the previous one still stopping): the reason as a notice, the run unchanged', async () => {
    get.mockImplementation(routeGet([previewedRun]));
    const reason = 'The previous step is still stopping — try again in a minute';
    post.mockRejectedValue(apiError(409, { success: false, error: reason }, reason));
    render(<ZendeskImportSettings />);

    fireEvent.click(await screen.findByRole('button', { name: /Import 63 tickets/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));

    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledWith(reason));
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Import 63 tickets/ })).toBeTruthy();
  });

  it('option saves are serialised: every choice is locked while one saves, and the next builds on the saved run', async () => {
    get.mockImplementation(routeGet([previewedRun]));
    let finishFirst: (value: unknown) => void = () => undefined;
    put
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockImplementation((_url: string, body: unknown) =>
        Promise.resolve({
          data: {
            success: true,
            data: { ...previewedRun, options: { ...previewedRun.options, ...(body as object) } },
          },
        })
      );
    render(<ZendeskImportSettings />);

    await chooseOption(await screen.findByRole('combobox', { name: 'Team for Orders' }), 'Support');
    expect(put).toHaveBeenLastCalledWith('/api/imports/zendesk/runs/5/options', {
      groupDepartments: { Orders: 1 },
    });
    const infoLocked = () =>
      screen.getByRole('combobox', { name: 'Team for Info' }).hasAttribute('disabled');
    expect(infoLocked()).toBe(true);

    act(() => {
      finishFirst({
        data: {
          success: true,
          data: {
            ...previewedRun,
            options: { ...previewedRun.options, groupDepartments: { Orders: 1 } },
          },
        },
      });
    });
    await waitFor(() => expect(infoLocked()).toBe(false));
    await chooseOption(screen.getByRole('combobox', { name: 'Team for Info' }), 'Support');
    await waitFor(() =>
      expect(put).toHaveBeenLastCalledWith('/api/imports/zendesk/runs/5/options', {
        groupDepartments: { Orders: 1, Info: 1 },
      })
    );
  });

  const applyingRun = {
    ...previewedRun,
    status: 'applying',
    progress: { phase: 'apply', done: 10, total: 110 },
  };

  it('polls a running step, with a named progress bar, and stops with a notice when the run is gone (404)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockImplementation((url: string) =>
      url === '/api/imports/zendesk/runs/5'
        ? Promise.reject(apiError(404, { success: false, error: 'Import not found' }))
        : routeGet([applyingRun])(url)
    );
    render(<ZendeskImportSettings />);
    expect(await screen.findByRole('progressbar', { name: 'Importing progress' })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(await screen.findByText(/This import is no longer there/)).toBeTruthy();
    // The run is gone: no Stop that would only fail.
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    const polls = () =>
      get.mock.calls.filter((call) => call[0] === '/api/imports/zendesk/runs/5').length;
    expect(polls()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(polls()).toBe(1);
  });

  it('CONTROL: a passing blip (500) keeps polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockImplementation((url: string) =>
      url === '/api/imports/zendesk/runs/5'
        ? Promise.reject(apiError(500, {}))
        : routeGet([applyingRun])(url)
    );
    render(<ZendeskImportSettings />);
    await screen.findByRole('progressbar', { name: 'Importing progress' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(get.mock.calls.filter((call) => call[0] === '/api/imports/zendesk/runs/5').length).toBe(
      3
    );
    expect(screen.queryByText(/no longer there/)).toBeNull();
  });
});

describe('ZendeskImportSettings — an agent with no Odly account under that address', () => {
  it('is mapped to a chosen Odly person; an agent matched by email gets no picker', async () => {
    get.mockImplementation(routeGet([previewedRun]));
    put.mockImplementation((_url: string, body: unknown) =>
      Promise.resolve({
        data: {
          success: true,
          data: { ...previewedRun, options: { ...previewedRun.options, ...(body as object) } },
        },
      })
    );
    render(<ZendeskImportSettings />);

    await chooseOption(
      await screen.findByRole('combobox', { name: 'Odly person for nobody@shop.example' }),
      /Nora Body/
    );
    expect(put).toHaveBeenLastCalledWith('/api/imports/zendesk/runs/5/options', {
      agentUsers: { 'nobody@shop.example': 21 },
    });
    // CONTROL: kurt@ has an Odly account by that address — nothing to choose.
    expect(screen.queryByRole('combobox', { name: 'Odly person for kurt@shop.example' })).toBeNull();
  });
});

