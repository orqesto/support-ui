/**
 * The Knowledge Base `?id=` deep link names an entry by its public number (KB-159) — the number the
 * page shows and the search finds — and still opens a row-id link (`?id=3797`, how the other pages
 * link), rewriting it to the public number.
 */
import { useState, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { KBEntry } from '@/services/kb.service';

const getById = vi.fn();
const getAll = vi.fn();
vi.mock('@/services/kb.service', () => ({ kbService: { getById, getAll } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { parseKbEntryParam, kbEntryParamValue, useKbEntryParam } = await import(
  '../useKbEntryParam'
);

const entry = (over: Partial<KBEntry> = {}) =>
  ({ id: 3797, publicId: 'KB-159', title: 'Cancel a subscription', ...over }) as KBEntry;

const setSelectedEntry = vi.fn();
const onNotFound = vi.fn();

// The page keeps the opened entry in state; the rewritten address must not fetch it again.
const open = (url: string) =>
  renderHook(
    () => {
      const [selectedEntry, setSelected] = useState<KBEntry | null>(null);
      useKbEntryParam({
        selectedEntry,
        setSelectedEntry: (opened) => {
          setSelectedEntry(opened);
          setSelected(opened);
        },
        canReview: false,
        entries: [],
        filterStatus: 'all',
        onNotFound,
      });
      return useLocation();
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
      ),
    }
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseKbEntryParam / kbEntryParamValue', () => {
  it('reads a public number in any spelling the page shows, and a bare row id', () => {
    expect(parseKbEntryParam('KB-159')).toEqual({ publicId: 'KB-159' });
    expect(parseKbEntryParam('#kb-0159')).toEqual({ publicId: 'KB-159' });
    expect(parseKbEntryParam('3797')).toEqual({ rowId: 3797 });
    expect(parseKbEntryParam('abc')).toBeNull();
    expect(parseKbEntryParam('BIL-T-4')).toBeNull();
  });

  it('a link carries the public number when the entry has one', () => {
    expect(kbEntryParamValue(entry())).toBe('KB-159');
    expect(kbEntryParamValue(entry({ publicId: null }))).toBe('3797');
  });
});

describe('useKbEntryParam', () => {
  it('a row-id link opens the entry and the address then shows its public number', async () => {
    getById.mockResolvedValue({ data: entry() });
    const { result } = open('/knowledge-base?id=3797#qa');
    await waitFor(() => expect(result.current.search).toBe('?id=KB-159'));
    expect(result.current.hash).toBe('#qa');
    expect(getById).toHaveBeenCalledTimes(1);
    expect(getById).toHaveBeenCalledWith(3797);
    expect(getAll).not.toHaveBeenCalled();
    expect(setSelectedEntry).toHaveBeenCalledWith(entry());
    expect(onNotFound).not.toHaveBeenCalled();
  });

  it('a public-number link is found by the search by number, then opened by its row', async () => {
    getAll.mockResolvedValue({ data: { entries: [], idMatch: { id: 3797 } } });
    getById.mockResolvedValue({ data: entry() });
    const { result } = open('/knowledge-base?id=KB-159');
    await waitFor(() => expect(setSelectedEntry).toHaveBeenCalledWith(entry()));
    expect(getAll).toHaveBeenCalledWith({ search: 'KB-159', limit: 1 });
    expect(getById).toHaveBeenCalledWith(3797);
    expect(result.current.search).toBe('?id=KB-159');
  });

  it('a public number nobody can read says so and leaves the address', async () => {
    getAll.mockResolvedValue({ data: { entries: [], idMatch: null } });
    const { result } = open('/knowledge-base?id=KB-999');
    await waitFor(() => expect(onNotFound).toHaveBeenCalled());
    expect(getById).not.toHaveBeenCalled();
    expect(result.current.search).toBe('');
  });

  it('opening an entry from the list puts its public number in the address', () => {
    const { result } = renderHook(
      () => ({
        ...useKbEntryParam({
          selectedEntry: null,
          setSelectedEntry,
          canReview: false,
          entries: [],
          filterStatus: 'all',
          onNotFound,
        }),
        location: useLocation(),
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <MemoryRouter initialEntries={['/knowledge-base#qa']}>{children}</MemoryRouter>
        ),
      }
    );
    act(() => result.current.openEntry(entry()));
    expect(result.current.location.search).toBe('?id=KB-159');
    expect(result.current.location.hash).toBe('#qa');
    act(() => result.current.closeEntry());
    expect(result.current.location.search).toBe('');
    expect(setSelectedEntry).toHaveBeenLastCalledWith(null);
  });

  it('an entry without a public number keeps its row id in the address', async () => {
    getById.mockResolvedValue({ data: entry({ publicId: null }) });
    const { result } = open('/knowledge-base?id=3797');
    await waitFor(() => expect(setSelectedEntry).toHaveBeenCalled());
    expect(result.current.search).toBe('?id=3797');
  });
});
