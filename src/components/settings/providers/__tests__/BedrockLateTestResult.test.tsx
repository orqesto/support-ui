import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const post = vi.fn<(...args: unknown[]) => Promise<{ data: { data: unknown } }>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args), get: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useBedrockModels', () => ({ useBedrockModels: () => ({ data: undefined }) }));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => ({ data: undefined }) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

import { BedrockProviderCard } from '@/components/settings/providers/BedrockProviderCard';

const OK = { assumeRole: 'skipped', invoke: 'ok', latencyMs: 9, account: '111122223333' };

const openFormWithKeys = () => {
  render(
    <BedrockProviderCard
      integrations={[]}
      showModels={{}}
      deleting={null}
      saving={null}
      toggling={null}
      editingId={null}
      onToggleModels={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onToggleEnabled={vi.fn()}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Add Bedrock/i }));
  fireEvent.change(screen.getByPlaceholderText('AKIA…'), { target: { value: 'AKIAOLD' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret-old' } });
};

const deferPost = () => {
  let settle: { resolve: (value: unknown) => void; reject: (reason: unknown) => void } = {
    resolve: () => {},
    reject: () => {},
  };
  post.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        settle = { resolve: (value) => resolve({ data: { data: value } }), reject };
      })
  );
  return () => settle;
};

describe('Bedrock card — a test that lands after the form changed', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('⛔ does not claim the new keys authenticated', async () => {
    const settle = deferPost();
    openFormWithKeys();
    fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));
    fireEvent.change(screen.getByPlaceholderText('AKIA…'), { target: { value: 'AKIANEW' } });
    await act(async () => {
      settle().resolve(OK);
      await Promise.resolve();
    });

    expect(post.mock.calls[0][1]).toMatchObject({ accessKeyId: 'AKIAOLD' });
    expect(screen.queryByText(/Authenticated as AWS account/)).not.toBeInTheDocument();
  });

  it('⛔ nor prints the old failure under the new keys', async () => {
    const settle = deferPost();
    openFormWithKeys();
    fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));
    fireEvent.change(screen.getByPlaceholderText('AKIA…'), { target: { value: 'AKIANEW' } });
    await act(async () => {
      settle().reject(new Error('The security token included in the request is invalid'));
      await Promise.resolve();
    });
    expect(screen.queryByText(/Failed at/)).not.toBeInTheDocument();
  });

  it('CONTROL: a test nobody overtook reports the account', async () => {
    const settle = deferPost();
    openFormWithKeys();
    fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));
    await act(async () => {
      settle().resolve(OK);
      await Promise.resolve();
    });
    expect(screen.getByText(/Authenticated as AWS account/)).toBeInTheDocument();
  });
});
