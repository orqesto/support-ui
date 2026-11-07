/**
 * The threads filter's options for a role with few permissions (staging 2026-10-19): the Source
 * list comes from the options route every role may read, and labels are not asked for without
 * VIEW_LABELS (an associate) — the console showed both refused.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const perms = { viewLabels: true };
const getLabels = vi.fn(() => Promise.resolve([{ id: 5, name: 'Urgent', color: '#ff0000' }]));
const getMessageSourceOptions = vi.fn(() =>
  Promise.resolve([
    { id: 1, name: 'Inbox', type: 'gmail', active: true },
    { id: 2, name: 'OpenAI', type: 'openai', active: true },
  ])
);

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) => (permission === 'view_labels' ? perms.viewLabels : true),
  }),
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));
vi.mock('@/services/assignment.service', () => ({
  assignmentService: { getAssignableUsers: () => Promise.resolve([]) },
}));
vi.mock('@/services/messageSourceOptions.service', () => ({
  getMessageSourceOptions: () => getMessageSourceOptions(),
}));
vi.mock('@/services/settings.service', () => ({ labelService: { getLabels: () => getLabels() } }));
vi.mock('@/services/message.service', () => ({
  messageService: { getReceivedAtOptions: () => Promise.resolve([]) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: () => {}, info: () => {}, debug: () => {} } }));

const { useFilterOptions } = await import('../useFilterOptions');

describe('useFilterOptions — what a role may read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    perms.viewLabels = true;
  });

  it('the Source list comes from the options every role may read (message sources only)', async () => {
    const { result } = renderHook(() => useFilterOptions());
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    expect(result.current.sources[0]).toMatchObject({ value: '1', label: 'Inbox' });
  });

  it('without VIEW_LABELS no labels are asked for', async () => {
    perms.viewLabels = false;
    const { result } = renderHook(() => useFilterOptions());
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    expect(getLabels).not.toHaveBeenCalled();
    expect(result.current.labels).toEqual([]);
  });

  it('CONTROL: with VIEW_LABELS they are', async () => {
    const { result } = renderHook(() => useFilterOptions());
    await waitFor(() => expect(result.current.labels).toHaveLength(1));
    expect(getLabels).toHaveBeenCalled();
  });
});
