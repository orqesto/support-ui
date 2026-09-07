import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { DatabaseConfigCard, describeMove, describeProbe } from '../DatabaseConfigCard';
import type { DatabaseDisplay } from '@/services/database.service';

const { get, post, put, toast } = vi.hoisted(() => ({
  get: vi.fn<(...args: unknown[]) => unknown>(),
  post: vi.fn<(...args: unknown[]) => unknown>(),
  put: vi.fn<(...args: unknown[]) => unknown>(),
  toast: { error: vi.fn(), success: vi.fn(), failure: vi.fn() },
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    delete: vi.fn(),
  },
}));
vi.mock('@/lib/toast', () => ({ toast }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }));

const display = (over: Partial<DatabaseDisplay> = {}): DatabaseDisplay => ({
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

const serve = (value: DatabaseDisplay) =>
  get.mockResolvedValue({ data: { success: true, data: value } });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DatabaseConfigCard', () => {
  it('on the managed database, shows the retention deadline when there is one and nothing when there is not', async () => {
    serve(display({ sharedRetentionUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }));
    render(<DatabaseConfigCard />);
    expect(await screen.findByTestId('database-retention-note')).toHaveTextContent(/Connect yours before/);
    cleanup();

    serve(display());
    render(<DatabaseConfigCard />);
    await waitFor(() => expect(screen.getByText(/managed database/)).toBeInTheDocument());
    expect(screen.queryByTestId('database-retention-note')).not.toBeInTheDocument();
  });

  it('never renders the URL back — only the masked host — and offers Re-verify', async () => {
    serve(
      display({
        mode: 'own',
        source: 'customer',
        provenance: 'url',
        hostMasked: 'postgres://…@db.example.com:5432/odly',
        schemaVersion: '0105_public_tokens',
        verifiedAt: '2026-09-07T10:00:00.000Z',
      })
    );
    render(<DatabaseConfigCard />);
    expect(await screen.findByText('postgres://…@db.example.com:5432/odly')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /re-verify/i })).toBeInTheDocument();
    // An own database that went live cannot be dropped from here (the BE answers 409).
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Connection string/)).not.toBeInTheDocument();
  });

  it('shows what the probe checked, not just a green box', async () => {
    serve(display());
    post.mockResolvedValue({
      data: {
        success: true,
        data: { ok: true, latencyMs: 12, serverVersion: 'PostgreSQL 16.4', empty: true, canCreate: true, vectorAvailable: true },
      },
    });
    render(<DatabaseConfigCard />);
    await screen.findByText(/managed database/);
    fireEvent.click(screen.getByRole('button', { name: /bring your own postgres/i }));
    fireEvent.change(screen.getByLabelText(/Connection string/), {
      target: { value: 'postgres://u:p@db.example.com:5432/odly' },
    });
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

    const result = await screen.findByTestId('database-test-result');
    expect(result).toHaveTextContent('PostgreSQL 16.4');
    expect(result).toHaveTextContent('Empty database');
    expect(result).toHaveTextContent('CREATE privilege: yes');
    expect(result).toHaveTextContent('pgvector: available');
    expect(post).toHaveBeenCalledWith('/api/integrations/database-config/test', {
      url: 'postgres://u:p@db.example.com:5432/odly',
    });
  });

  it('says the data is being moved when connect returns a move', async () => {
    serve(display());
    put.mockResolvedValue({
      data: {
        success: true,
        data: display({ mode: 'own', status: 'provisioning', move: { id: 1, status: 'pending', totalRows: 0, copiedRows: 0, error: null, startedAt: null, finishedAt: null, cleanedAt: null } }),
        meta: { migrationsApplied: 106 },
      },
    });
    render(<DatabaseConfigCard />);
    await screen.findByText(/managed database/);
    fireEvent.click(screen.getByRole('button', { name: /bring your own postgres/i }));
    fireEvent.change(screen.getByLabelText(/Connection string/), { target: { value: 'postgres://u:p@h:5432/d' } });
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/being moved/)));
  });
});

describe('DatabaseConfigCard — when the card cannot load', () => {
  // The frontend ships from `main` independently of backend tags: against a backend without
  // the feature the card must say so, not offer a Connect button that 404s.
  it('says the feature is not on this deployment on a 404', async () => {
    get.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404, data: { error: 'Not found' } }));
    render(<DatabaseConfigCard />);
    expect(await screen.findByTestId('database-unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^connect$/i })).not.toBeInTheDocument();
  });

  it('explains a paused workspace on a DB_* 503 and offers to check again', async () => {
    get.mockRejectedValue(Object.assign(new Error('paused'), { status: 503, data: { code: 'DB_PROVISIONING', error: 'being provisioned' } }));
    render(<DatabaseConfigCard />);
    expect(await screen.findByTestId('database-paused')).toHaveTextContent(/being moved/);
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });
});

describe('describeProbe / describeMove', () => {
  it('names a missing privilege and a missing extension', () => {
    expect(describeProbe({ ok: false, latencyMs: 3, canCreate: false, vectorAvailable: false })).toEqual([
      'CREATE privilege: missing (migrations need it)',
      'pgvector: not available on this server',
    ]);
  });

  it('reports a failed move as the workspace staying where it was', () => {
    expect(
      describeMove({ id: 1, status: 'failed', totalRows: 10, copiedRows: 4, error: 'target refused', startedAt: null, finishedAt: null, cleanedAt: null })
    ).toMatch(/stayed on the managed database, untouched: target refused/);
  });
});
