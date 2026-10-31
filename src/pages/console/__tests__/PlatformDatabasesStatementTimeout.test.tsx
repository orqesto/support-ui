/**
 * Console → Databases: the request statement timeout (`apiStatementTimeoutMs`). Shown in seconds,
 * stored in ms; empty or 0 = off; 5–600 s otherwise (the backend's 5,000–600,000 ms). A backend
 * that does not report it gets no field.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({
  database: undefined as undefined | Record<string, unknown>,
  mutate: vi.fn(),
}));
vi.mock('@/hooks/usePlatformSettings', () => ({
  usePlatformSettings: () => ({ isLoading: false, data: { database: state.database } }),
  useUpdatePlatformDatabase: () => ({ isPending: false, mutate: state.mutate }),
}));
vi.mock('@/hooks/useDatabaseConsole', () => ({
  useDatabaseRetentionList: () => ({ isLoading: false, data: [] }),
  useDegradedDatabases: () => ({ isLoading: false, data: [] }),
}));
vi.mock('@/components/console/WorkspaceDatabaseDialog', () => ({
  WorkspaceDatabaseDialog: () => null,
}));
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PlatformDatabases } from '../PlatformDatabases';

const RETENTION = { value: 90, source: 'default' };
const field = () => screen.getByLabelText<HTMLInputElement>('Seconds (empty or 0 = off)');
const save = () => screen.getAllByRole('button', { name: 'Save' }).at(-1) as HTMLButtonElement;
const type = (value: string) => fireEvent.change(field(), { target: { value } });

beforeEach(() => state.mutate.mockReset());
afterEach(cleanup);

describe('Query time limit', () => {
  it('hidden on a backend that does not report it', () => {
    state.database = { freeSharedRetentionDays: RETENTION };
    render(<PlatformDatabases />);
    expect(screen.queryByText('Query time limit')).toBeNull();
  });

  it('shows the stored value in seconds, with the helper text', () => {
    state.database = { freeSharedRetentionDays: RETENTION, apiStatementTimeoutMs: 30_000 };
    render(<PlatformDatabases />);
    expect(field().value).toBe('30');
    expect(
      screen.getByText(
        'Longest a single database query may run for a user request. Off = no limit.'
      )
    ).toBeTruthy();
    expect(save()).toBeDisabled();
  });

  it('saves seconds as ms', () => {
    state.database = { freeSharedRetentionDays: RETENTION, apiStatementTimeoutMs: 0 };
    render(<PlatformDatabases />);
    expect(field().value).toBe('');
    type('45');
    fireEvent.click(save());
    expect(state.mutate).toHaveBeenCalledWith({ apiStatementTimeoutMs: 45_000 }, expect.anything());
  });

  it('empty turns it off (0)', () => {
    state.database = { freeSharedRetentionDays: RETENTION, apiStatementTimeoutMs: 30_000 };
    render(<PlatformDatabases />);
    type('');
    fireEvent.click(save());
    expect(state.mutate).toHaveBeenCalledWith({ apiStatementTimeoutMs: 0 }, expect.anything());
  });

  it.each(['3', '601', '12.5', '-5'])('refuses %s s: says the range, cannot save', (value) => {
    state.database = { freeSharedRetentionDays: RETENTION, apiStatementTimeoutMs: 0 };
    render(<PlatformDatabases />);
    type(value);
    expect(screen.getByText('0 (off) or a whole number from 5 to 600')).toBeTruthy();
    expect(save()).toBeDisabled();
  });

  it('CONTROL: the range ends are accepted', () => {
    state.database = { freeSharedRetentionDays: RETENTION, apiStatementTimeoutMs: 0 };
    render(<PlatformDatabases />);
    for (const [value, ms] of [
      ['5', 5_000],
      ['600', 600_000],
    ] as const) {
      type(value);
      fireEvent.click(save());
      expect(state.mutate).toHaveBeenLastCalledWith(
        { apiStatementTimeoutMs: ms },
        expect.anything()
      );
    }
  });
});
