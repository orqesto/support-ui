/**
 * "Test Connection" exists to tell an admin WHY Bedrock will not work — a wrong
 * region, a role that cannot be assumed, model access not enabled in that account.
 * It read `err.response.data.error`, which the api-client interceptor never
 * produces, so it always rendered `Failed at assumeRole: Test request failed`.
 * A diagnostic that diagnoses nothing is worse than none: it looks authoritative.
 *
 * Fixtures come from the real interceptor via `@/test/apiError`.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const post = vi.fn<(...args: unknown[]) => Promise<{ data: { data: unknown } }>>();
// The factory is hoisted above the `const`, so it must reference `post` lazily —
// naming it directly throws "Cannot access 'post' before initialization".
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args), get: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useBedrockModels', () => ({ useBedrockModels: () => ({ data: undefined }) }));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => ({ data: undefined }) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

import { BedrockProviderCard } from '@/components/settings/providers/BedrockProviderCard';
import { apiError, networkError } from '@/test/apiError';

const openFormAndTest = () => {
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
  // EMPTY_CONFIG already carries a region and a default model, so the form is
  // submittable the moment it opens — no dropdown interaction needed.
  fireEvent.click(screen.getByRole('button', { name: /Add Bedrock/i }));
  fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));
};

describe('Bedrock "Test Connection" reports the real reason', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('surfaces the AWS error instead of "Test request failed"', async () => {
    post.mockRejectedValue(
      await apiError(400, {
        error: 'User is not authorized to perform sts:AssumeRole on resource arn:aws:iam::…',
      })
    );
    openFormAndTest();
    expect(await screen.findByText(/sts:AssumeRole/)).toBeInTheDocument();
    expect(screen.queryByText(/Test request failed/)).not.toBeInTheDocument();
  });

  it('names a model-access problem, which is the most common real cause', async () => {
    post.mockRejectedValue(
      await apiError(403, { error: "You don't have access to the model with the specified model ID." })
    );
    openFormAndTest();
    expect(
      await screen.findByText(/don't have access to the model with the specified model ID/)
    ).toBeInTheDocument();
  });

  it('falls back when the failure carries nothing to say', async () => {
    post.mockRejectedValue(await networkError());
    openFormAndTest();
    expect(await screen.findByText(/Test request failed/)).toBeInTheDocument();
  });

  it('does not put a 5xx body in front of the admin', async () => {
    post.mockRejectedValue(
      await apiError(502, { error: 'connect ETIMEDOUT 10.4.0.9:443 at /srv/app/dist/bedrock.js:71' })
    );
    openFormAndTest();
    expect(await screen.findByText(/Test request failed/)).toBeInTheDocument();
    expect(screen.queryByText(/ETIMEDOUT/)).not.toBeInTheDocument();
  });
});
