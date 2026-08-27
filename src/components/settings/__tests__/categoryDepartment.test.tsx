/**
 * A category's department has to be choosable, not just displayed.
 *
 * The list showed a DepartmentBadge for every category while the form held only
 * `{ name, description, keywords }` — so the column existed and nothing could set it. The
 * API has accepted `departmentId` on create and update all along, and omitting it is NOT
 * neutral: it falls back to `bodyDeptId ?? firstDept ?? null`, quietly stamping the category
 * with whichever department the caller happened to be scoped to.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// Typed explicitly: a bare `vi.fn(async () => ({}))` infers a ZERO-parameter signature, so
// every call site and every `mock.calls[0][0]` is a type error under tsconfig.app.json —
// which is the config `npm run type-check` uses and `npm run build` does not.
const createCategory = vi.fn<(...args: unknown[]) => Promise<unknown>>(() => Promise.resolve({}));
const updateCategory = vi.fn<(...args: unknown[]) => Promise<unknown>>(() => Promise.resolve({}));
const getCategories = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(() => Promise.resolve([
  { id: 7, name: 'Billing Query', description: 'd', keywords: 'k', departmentId: 21, createdAt: '', updatedAt: '' },
]));

vi.mock('@/services/settings.service', () => ({
  settingsService: {
    getCategories: () => getCategories(),
    createCategory: (data: unknown) => createCategory(data),
    updateCategory: (id: number, data: unknown) => updateCategory(id, data),
    deleteCategory: vi.fn(),
  },
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [
    { id: 19, name: 'Support', active: true },
    { id: 21, name: 'Billing', active: true },
    { id: 99, name: 'Retired', active: false },
  ] }),
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => <span /> }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { CategoriesSettings } = await import('../CategoriesSettings');

beforeEach(() => { createCategory.mockClear(); updateCategory.mockClear(); });
afterEach(cleanup);

const openCreate = async () => {
  render(<CategoriesSettings />);
  await waitFor(() => expect(screen.getByText('Billing Query')).toBeTruthy());
  fireEvent.click(screen.getByText(/Add Category|New Category/i));
};

describe('choosing a category department', () => {
  it('offers every ACTIVE department, plus baseline', async () => {
    await openCreate();
    expect(screen.getByText('All departments')).toBeTruthy();
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Billing')).toBeTruthy();
    // A retired department must not be offered — it could never be assigned.
    expect(screen.queryByText('Retired')).toBeNull();
  });

  it('sends the chosen department on create', async () => {
    await openCreate();
    fireEvent.change(screen.getByPlaceholderText(/e\.g\., Technical Support/i), { target: { value: 'Refunds' } });
    fireEvent.click(screen.getByText('Billing'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(createCategory).toHaveBeenCalled());
    expect(createCategory.mock.calls[0]?.[0]).toMatchObject({ name: 'Refunds', departmentId: 21 });
  });

  it('sends null for baseline rather than omitting the field', async () => {
    // Omitting is not the same as null: the API would fall back to the caller's own
    // department context and stamp a scope nobody asked for.
    await openCreate();
    fireEvent.change(screen.getByPlaceholderText(/e\.g\., Technical Support/i), { target: { value: 'Account Management' } });
    fireEvent.click(screen.getByText('Support'));
    fireEvent.click(screen.getByText('All departments'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(createCategory).toHaveBeenCalled());
    const sent = createCategory.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.departmentId).toBeNull();
    expect('departmentId' in sent).toBe(true);
  });
});
