import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { DatabaseStep } from '../steps/DatabaseStep';
import type { DatabaseDisplay } from '@/services/database.service';

const get = vi.fn(() =>
  Promise.resolve({ data: { success: true, data: managed() } })
);
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => get(...(args as [])), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), failure: vi.fn() } }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }));

const managed = (over: Partial<DatabaseDisplay> = {}): DatabaseDisplay => ({
  mode: 'managed',
  source: 'platform',
  hostMasked: null,
  provenance: null,
  region: null,
  status: 'active',
  schemaVersion: null,
  verifiedAt: null,
  provisionedAt: null,
  sharedRetentionUntil: null,
  updatedAt: '2026-09-07T00:00:00.000Z',
  move: null,
  ...over,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * Free = own database (BYODB §3.4). The managed card must say WHY it cannot be picked rather
 * than merely refuse the click — a disabled card with no reason reads as a bug.
 */
describe('DatabaseStep', () => {
  it('disables the managed card with the reason when the workspace is not entitled to it', () => {
    const onChoose = vi.fn();
    render(<DatabaseStep value={undefined} onChoose={onChoose} managedAllowed={false} current={managed()} />);

    const managedCard = screen.getByTestId('database-choice-managed');
    expect(managedCard).toBeDisabled();
    expect(screen.getByText(/Free runs on your own Postgres/)).toBeInTheDocument();
    fireEvent.click(managedCard);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('offers the managed card to an entitled workspace', () => {
    const onChoose = vi.fn();
    render(<DatabaseStep value={undefined} onChoose={onChoose} managedAllowed current={managed()} />);

    fireEvent.click(screen.getByTestId('database-choice-managed'));
    expect(onChoose).toHaveBeenCalledWith('managed');
    expect(screen.queryByText(/Free runs on your own Postgres/)).not.toBeInTheDocument();
  });

  it('reveals the Database card once "bring your own" is chosen', async () => {
    render(<DatabaseStep value="own" onChoose={vi.fn()} managedAllowed current={managed()} />);
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/integrations/database-config'));
    expect(await screen.findByLabelText(/Connection string/)).toBeInTheDocument();
  });

  // Resume: a workspace already on its own database has made its choice; the wizard must
  // not show two unselected cards over a live connection.
  it('pre-selects "own" for a workspace already on its own database', () => {
    const onChoose = vi.fn();
    render(
      <DatabaseStep
        value={undefined}
        onChoose={onChoose}
        managedAllowed={false}
        current={managed({ mode: 'own', source: 'customer', hostMasked: 'postgres://…@db.example.com:5432/odly' })}
      />
    );
    expect(onChoose).toHaveBeenCalledWith('own');
  });

  it('shows the server refusal under the cards', () => {
    render(
      <DatabaseStep
        value={undefined}
        onChoose={vi.fn()}
        managedAllowed
        current={managed()}
        choiceError="Free runs on your own Postgres — connect one, or upgrade."
      />
    );
    expect(screen.getByTestId('database-choice-error')).toHaveTextContent(/connect one, or upgrade/);
  });
});
