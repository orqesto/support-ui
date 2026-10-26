/**
 * The Knowledge Base `?id=` deep link names an entry by its public number with the workspace code
 * (ACM-KB-77) — the number the page shows and the search finds, in the form that cannot open
 * another workspace's KB-77 — and still opens a row-id link (how the other pages link), rewriting
 * it to that form.
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
const workspace = vi.hoisted(() => ({ code: 'ACM' as string | undefined }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => workspace.code }));
const locate = vi.fn();
vi.mock('@/services/sharedLink.service', () => ({ sharedLinkService: { locate } }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
const store = vi.hoisted(() => ({
  selectedOrganizationId: 1 as number | null,
  setSelectedOrganization: (id: number) => {
    store.selectedOrganizationId = id;
  },
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => store }));

const { parseKbEntryParam, kbEntryParamValue, useKbEntryParam } = await import(
  '../useKbEntryParam'
);

const entry = (over: Partial<KBEntry> = {}) =>
  ({ id: 4120, publicId: 'KB-77', title: 'Refund policy', ...over }) as KBEntry;

const setSelectedEntry = vi.fn();
const onNotFound = vi.fn();

// The page keeps the opened entry in state; the rewritten address must not fetch it again.
const open = (url: string) =>
  renderHook(
    () => {
      const [selectedEntry, setSelected] = useState<KBEntry | null>(null);
      const actions = useKbEntryParam({
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
      return { ...actions, location: useLocation() };
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
      ),
    }
  );

beforeEach(() => {
  vi.clearAllMocks();
  workspace.code = 'ACM';
  store.selectedOrganizationId = 1;
  // Before the code loads, even this workspace's own link is located — and found here.
  locate.mockResolvedValue({
    data: { status: 'found', organizationId: 1, organizationSlug: 'acme', publicId: 'KB-77' },
  });
});

describe('parseKbEntryParam / kbEntryParamValue', () => {
  it('reads the public number with or without a workspace code, and a bare row id', () => {
    expect(parseKbEntryParam('ACM-KB-77')).toEqual({ publicId: 'KB-77', workspaceCode: 'ACM' });
    expect(parseKbEntryParam('#kb-077')).toEqual({ publicId: 'KB-77', workspaceCode: null });
    expect(parseKbEntryParam('4120')).toEqual({ rowId: 4120 });
    expect(parseKbEntryParam('abc')).toBeNull();
    expect(parseKbEntryParam('ACM-SUP-4')).toBeNull();
  });

  it('a link never carries the bare number: the workspace code, or else the row id', () => {
    expect(kbEntryParamValue(entry(), 'acm')).toBe('ACM-KB-77');
    expect(kbEntryParamValue(entry(), undefined)).toBe('4120');
    expect(kbEntryParamValue(entry({ publicId: null }), 'ACM')).toBe('4120');
  });
});

describe('useKbEntryParam', () => {
  it('a row-id link opens the entry and the address then shows its number', async () => {
    getById.mockResolvedValue({ data: entry() });
    const { result } = open('/knowledge-base?id=4120#qa');
    await waitFor(() => expect(result.current.location.search).toBe('?id=ACM-KB-77'));
    expect(result.current.location.hash).toBe('#qa');
    expect(getById).toHaveBeenCalledTimes(1);
    expect(getById).toHaveBeenCalledWith(4120);
    expect(getAll).not.toHaveBeenCalled();
    expect(onNotFound).not.toHaveBeenCalled();
  });

  it('a link with this workspace code is found by the search by number', async () => {
    getAll.mockResolvedValue({ data: { entries: [], idMatch: { id: 4120 } } });
    getById.mockResolvedValue({ data: entry() });
    const { result } = open('/knowledge-base?id=ACM-KB-77');
    await waitFor(() => expect(setSelectedEntry).toHaveBeenCalledWith(entry()));
    expect(getAll).toHaveBeenCalledWith({ search: 'KB-77', limit: 1 });
    expect(getById).toHaveBeenCalledTimes(1);
    expect(result.current.location.search).toBe('?id=ACM-KB-77');
  });

  it('⛔ another workspace’s link switches there first, never resolving this workspace’s KB-77', async () => {
    locate.mockResolvedValue({
      data: { status: 'found', organizationId: 2, organizationSlug: 'orbit', publicId: 'KB-77' },
    });
    getAll.mockResolvedValue({ data: { entries: [], idMatch: { id: 4120 } } });
    getById.mockResolvedValue({ data: entry() });
    const view = open('/knowledge-base?id=ORB-KB-77');
    await waitFor(() => expect(store.selectedOrganizationId).toBe(2));
    expect(locate).toHaveBeenCalledWith('ORB-KB-77');
    expect(getAll).not.toHaveBeenCalled(); // nothing looked up in the wrong workspace
    workspace.code = 'ORB'; // the switched workspace's code loads
    view.rerender();
    await waitFor(() => expect(setSelectedEntry).toHaveBeenCalledWith(entry()));
    expect(getAll).toHaveBeenCalledWith({ search: 'KB-77', limit: 1 });
    expect(view.result.current.location.search).toBe('?id=ORB-KB-77');
  });

  it('another workspace you are not in: its link is dropped, nothing opened', async () => {
    locate.mockResolvedValue({ data: { status: 'not-a-member', organizationSlug: 'orbit' } });
    const { result } = open('/knowledge-base?id=ORB-KB-77');
    await waitFor(() => expect(result.current.location.search).toBe(''));
    expect(onNotFound).not.toHaveBeenCalled(); // the toast already named the workspace
    expect(getAll).not.toHaveBeenCalled();
    expect(getById).not.toHaveBeenCalled();
  });

  it('a code no workspace carries says the entry was not found', async () => {
    locate.mockRejectedValue(new Error('404'));
    const { result } = open('/knowledge-base?id=ZZZ-KB-77');
    await waitFor(() =>
      expect(onNotFound).toHaveBeenCalledWith(expect.objectContaining({ title: 'Entry Not Found' }))
    );
    expect(result.current.location.search).toBe('');
    expect(getAll).not.toHaveBeenCalled();
  });

  it('a coded link waits for the workspace code before deciding', async () => {
    workspace.code = undefined;
    getAll.mockResolvedValue({ data: { entries: [], idMatch: { id: 4120 } } });
    getById.mockResolvedValue({ data: entry() });
    const view = open('/knowledge-base?id=ACM-KB-77');
    expect(getAll).not.toHaveBeenCalled();
    workspace.code = 'ACM';
    view.rerender();
    await waitFor(() => expect(setSelectedEntry).toHaveBeenCalledWith(entry()));
    expect(onNotFound).not.toHaveBeenCalled();
  });

  it('a bare number typed by hand opens this workspace’s entry and gains the code', async () => {
    getAll.mockResolvedValue({ data: { entries: [], idMatch: { id: 4120 } } });
    getById.mockResolvedValue({ data: entry() });
    const { result } = open('/knowledge-base?id=KB-77');
    await waitFor(() => expect(result.current.location.search).toBe('?id=ACM-KB-77'));
  });

  it('a number nobody can read says so and leaves the address', async () => {
    getAll.mockResolvedValue({ data: { entries: [], idMatch: null } });
    const { result } = open('/knowledge-base?id=ACM-KB-999');
    await waitFor(() =>
      expect(onNotFound).toHaveBeenCalledWith(expect.objectContaining({ title: 'Entry Not Found' }))
    );
    expect(getById).not.toHaveBeenCalled();
    expect(result.current.location.search).toBe('');
  });

  it('an entry opened while an older link still loads is not replaced by it', async () => {
    let finish: (value: { data: KBEntry }) => void = () => undefined;
    getById.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { result } = open('/knowledge-base?id=4120');
    const other = entry({ id: 4121, publicId: 'KB-78', title: 'Shipping times' });
    act(() => result.current.openEntry(other));
    await act(() => {
      finish({ data: entry() });
      return Promise.resolve();
    });
    expect(setSelectedEntry).toHaveBeenLastCalledWith(other);
    expect(result.current.location.search).toBe('?id=ACM-KB-78');
  });

  it('opening and closing from the list write the address and keep the tab', () => {
    const { result } = open('/knowledge-base#qa');
    act(() => result.current.openEntry(entry()));
    expect(result.current.location.search).toBe('?id=ACM-KB-77');
    expect(result.current.location.hash).toBe('#qa');
    act(() => result.current.closeEntry());
    expect(result.current.location.search).toBe('');
    expect(setSelectedEntry).toHaveBeenLastCalledWith(null);
  });

  it('an entry without a public number keeps its row id in the address', async () => {
    getById.mockResolvedValue({ data: entry({ publicId: null }) });
    const { result } = open('/knowledge-base?id=4120');
    await waitFor(() => expect(setSelectedEntry).toHaveBeenCalled());
    expect(result.current.location.search).toBe('?id=4120');
  });
});
