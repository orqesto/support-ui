/**
 * MergeThreads — the "Merge with another thread" picker and the "Same conversation" section.
 * Pins what the agent reads and does: the search races, the empty / error states, the picker's
 * close button, each candidate's sender line, and the unmerge wording.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import type * as MergeServiceModule from '@/services/conversationMerge.service';
import type { Message } from '@/types';

const mocks = vi.hoisted(() => ({
  getThreads: vi.fn(),
  unmerge: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/services/conversationMerge.service', async () => {
  const real = await vi.importActual<typeof MergeServiceModule>(
    '@/services/conversationMerge.service'
  );
  return {
    ...real,
    conversationMergeService: { ...real.conversationMergeService, unmerge: mocks.unmerge },
  };
});
vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: mocks.getThreads },
}));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));
vi.mock('@/lib/toast', () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { MergePickerDialog, MergedSection } = await import('../MergeThreads');

const CURRENT = {
  id: 100,
  publicId: 'SUP-100',
  subject: 'Order question',
  sender: 'ann@acme.io',
  channel: 'email',
  createdAt: '2026-09-01T00:00:00Z',
} as unknown as Message;

const threadRow = (id: number, sender: string | null, subject = `Subject ${id}`) => ({
  sender,
  latestMessage: {
    id,
    publicId: `SUP-${id}`,
    subject,
    sender: null,
    channel: 'email',
    createdAt: '2026-09-02T00:00:00Z',
  },
});

type Deferred = { resolve: (value: unknown) => void; reject: (reason: unknown) => void };
const deferred = (): { promise: Promise<unknown> } & Deferred => {
  const handle = {} as Deferred;
  const promise = new Promise((resolve, reject) => {
    handle.resolve = resolve;
    handle.reject = reject;
  });
  return { promise, ...handle };
};

const Host = ({ initialOpen = true }: { initialOpen?: boolean }) => {
  const [open, setOpen] = useState(initialOpen);
  return (
    <MemoryRouter>
      <button type="button" onClick={() => setOpen(true)}>
        open picker
      </button>
      <MergePickerDialog open={open} onOpenChange={setOpen} message={CURRENT} />
    </MemoryRouter>
  );
};

const picker = () => screen.getByRole('dialog');
const pressSearch = () => fireEvent.click(within(picker()).getByRole('button', { name: 'Search' }));

beforeEach(() => {
  mocks.getThreads.mockReset();
  mocks.unmerge.mockReset();
  mocks.toastSuccess.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('MergePickerDialog — opening', () => {
  it('searches nothing while closed; opening searches the customer’s organisation', async () => {
    mocks.getThreads.mockResolvedValue({ data: [] });
    render(<Host initialOpen={false} />);
    expect(mocks.getThreads).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'open picker' }));
    await waitFor(() => expect(mocks.getThreads).toHaveBeenCalledTimes(1));
    expect(mocks.getThreads).toHaveBeenCalledWith({ search: 'acme.io', lifecycle: 'all' }, 1, 25);
    expect(within(picker()).getByDisplayValue('acme.io')).toBeInTheDocument();
  });

  it('a reopen starts again: the search runs once more', async () => {
    mocks.getThreads.mockResolvedValue({ data: [] });
    render(<Host />);
    await waitFor(() => expect(mocks.getThreads).toHaveBeenCalledTimes(1));
    fireEvent.click(within(picker()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'open picker' }));
    await waitFor(() => expect(mocks.getThreads).toHaveBeenCalledTimes(2));
  });

  it('its X closes it', async () => {
    mocks.getThreads.mockResolvedValue({ data: [] });
    render(<Host />);
    expect(picker()).toHaveTextContent('Merge with another thread');
    fireEvent.click(within(picker()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(mocks.getThreads).toHaveBeenCalled());
  });
});

describe('MergePickerDialog — results', () => {
  it('no match: says so, with no error line', async () => {
    mocks.getThreads.mockResolvedValue({ data: [] });
    render(<Host />);
    expect(await within(picker()).findByText('No other threads match.')).toBeInTheDocument();
    expect(picker().querySelector('p.text-destructive')).toBeNull();
    expect(picker().querySelector('ul')).toBeNull();
  });

  it('a failed search: the error in a destructive line, and no “No other threads match.”', async () => {
    mocks.getThreads.mockRejectedValue(new Error('network down'));
    render(<Host />);
    const line = await within(picker()).findByText('Could not search threads just now.');
    expect(line.tagName).toBe('P');
    expect(line).toHaveClass('text-destructive');
    expect(within(picker()).queryByText('No other threads match.')).toBeNull();
  });

  it('results: no error line; each row names its sender, and a row without one has no sender line', async () => {
    mocks.getThreads.mockResolvedValue({
      data: [threadRow(201, 'bob@acme.io'), threadRow(202, null)],
    });
    render(<Host />);
    const rows = await within(picker()).findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(picker().querySelector('p.text-destructive')).toBeNull();
    expect(within(rows[0]).getByText('bob@acme.io')).toBeInTheDocument();
    const column = (row: HTMLElement) => row.querySelector('span.flex-col') as HTMLElement;
    expect(column(rows[0]).children).toHaveLength(3);
    // CONTROL above: the sender line is a third child; without a sender there are two.
    expect(column(rows[1]).children).toHaveLength(2);
    expect(rows[1].querySelector('.truncate.text-\\[12px\\]')).toBeNull();
  });
});

describe('MergePickerDialog — overlapping searches', () => {
  it('an older search failing AFTER a newer one listed rows: the rows stay, no error', async () => {
    const first = deferred();
    mocks.getThreads
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ data: [threadRow(201, 'bob@acme.io')] });
    render(<Host />);
    await waitFor(() => expect(mocks.getThreads).toHaveBeenCalledTimes(1));
    pressSearch();
    expect(await within(picker()).findByText('bob@acme.io')).toBeInTheDocument();
    await act(async () => {
      first.reject(new Error('late failure'));
      await Promise.resolve();
    });
    expect(within(picker()).getByText('bob@acme.io')).toBeInTheDocument();
    expect(within(picker()).queryByText('Could not search threads just now.')).toBeNull();
  });

  it('an older search settling while a newer one runs: still “Searching…”', async () => {
    const first = deferred();
    const second = deferred();
    mocks.getThreads.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<Host />);
    await waitFor(() => expect(mocks.getThreads).toHaveBeenCalledTimes(1));
    pressSearch();
    expect(mocks.getThreads).toHaveBeenCalledTimes(2);
    await act(async () => {
      first.resolve({ data: [] });
      await Promise.resolve();
    });
    expect(within(picker()).getByText('Searching…')).toBeInTheDocument();
    expect(within(picker()).queryByText('No other threads match.')).toBeNull();
    await act(async () => {
      second.resolve({ data: [] });
      await Promise.resolve();
    });
    expect(await within(picker()).findByText('No other threads match.')).toBeInTheDocument();
  });
});

describe('MergedSection', () => {
  const merge = {
    id: 50,
    publicId: 'SUP-50',
    subject: 'Older thread',
    mergedAt: null,
    mergedBy: null,
  };
  const renderSection = (onUnmerged = vi.fn()) =>
    render(
      <MergedSection
        message={{ id: 100 }}
        merges={[merge]}
        canManage
        onMerge={vi.fn()}
        onUnmerged={onUnmerged}
      />
    );

  it('each row reads “<number> merged in”, with the space', () => {
    renderSection();
    const row = screen.getByRole('listitem');
    expect(row.querySelector('span.flex-1')?.textContent).toBe('TES-SUP-50 merged in');
  });

  it('an unmerge says the thread is its own again', async () => {
    mocks.unmerge.mockResolvedValue(undefined);
    const onUnmerged = vi.fn();
    renderSection(onUnmerged);
    fireEvent.click(screen.getByRole('button', { name: 'Unmerge TES-SUP-50' }));
    await waitFor(() => expect(onUnmerged).toHaveBeenCalledWith(50));
    expect(mocks.unmerge).toHaveBeenCalledWith(100, 50);
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'TES-SUP-50 unmerged — it is its own thread again'
    );
  });

  it('a failed unmerge with no server reason: the fallback words', async () => {
    mocks.unmerge.mockRejectedValue(new Error('boom'));
    const onUnmerged = vi.fn();
    renderSection(onUnmerged);
    fireEvent.click(screen.getByRole('button', { name: 'Unmerge TES-SUP-50' }));
    expect(
      await screen.findByText('That thread could not be unmerged. Nothing was changed.')
    ).toBeInTheDocument();
    expect(onUnmerged).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
