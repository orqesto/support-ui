import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const uploadDocumentation = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/features/kb/shell', () => ({
  documentationService: {
    listDocumentation: () => Promise.resolve([]),
    getStats: () => Promise.resolve({ totalDocs: 0, totalChunks: 0, totalReferences: 0 }),
    uploadDocumentation: (...args: unknown[]) => uploadDocumentation(...args),
    getProgress: vi.fn(),
  },
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [], teamsEnabled: false }),
}));

const { DocumentationSettings } = await import('../DocumentationSettings');

const SERVER_ERROR = 'A server error occurred. Please try again later.';

const pickFiles = async (...files: File[]) => {
  render(
    <MemoryRouter>
      <DocumentationSettings compact />
    </MemoryRouter>
  );
  const input = await screen.findByLabelText(/choose file/i);
  fireEvent.change(input, { target: { files } });
};
const upload = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^upload \d+ files?$/i }));
    await Promise.resolve();
  });
};
/** Past the two seconds after which a finished batch is cleared. */
const waitPastClear = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2500);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  uploadDocumentation.mockReset();
});

/**
 * Onboarding, 2026-11: the server answered 500 and the wizard's file list simply emptied
 * two seconds later — no message, nothing to retry. A failure has to be said, and the files
 * that failed have to stay so Upload can send them again.
 */
describe('KB upload — a failed upload is said and kept', () => {
  it('⛔ keeps the failed file with its reason and says so', async () => {
    uploadDocumentation.mockRejectedValue(new Error(SERVER_ERROR));
    await pickFiles(new File(['# a'], 'faq.md', { type: 'text/markdown' }));
    await upload();
    await waitPastClear();

    expect(screen.getByText('faq.md')).toBeInTheDocument();
    expect(screen.getByText(SERVER_ERROR)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/1 of 1 file did not upload/);
  });

  it('⛔ keeps only the failed one of two, and Upload retries exactly it', async () => {
    uploadDocumentation.mockImplementation((file) =>
      (file as File).name === 'bad.md' ? Promise.reject(new Error(SERVER_ERROR)) : Promise.resolve({})
    );
    await pickFiles(
      new File(['ok'], 'good.txt', { type: 'text/plain' }),
      new File(['# no'], 'bad.md', { type: 'text/markdown' })
    );
    await upload();
    await waitPastClear();

    expect(screen.queryByText('good.txt')).not.toBeInTheDocument();
    expect(screen.getByText('bad.md')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/1 of 2 files did not upload/);

    uploadDocumentation.mockClear();
    uploadDocumentation.mockResolvedValue({});
    await upload();
    expect(uploadDocumentation).toHaveBeenCalledTimes(1);
    expect((uploadDocumentation.mock.calls[0][0] as File).name).toBe('bad.md');
  });

  it('CONTROL: a batch that all succeeds is cleared as before, with no notice', async () => {
    uploadDocumentation.mockResolvedValue({});
    await pickFiles(new File(['ok'], 'good.txt', { type: 'text/plain' }));
    await upload();
    await waitPastClear();

    expect(screen.queryByText('good.txt')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
