/**
 * The Bedrock model picker: a model enabled in the AWS account must be reachable from the card.
 *
 * Before: the live list only worked for AssumeRole workspaces, the hint under the dropdown blamed
 * a missing permission whatever the real cause was, and there was no way to enter a model the
 * built-in list did not have — a newly released model could not be selected at all.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { BedrockDiscovery } from '@/services/bedrockDiscovery.service';

const post = vi.fn<(...args: unknown[]) => Promise<{ data: { data: unknown } }>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args), get: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
let discovery: { data?: BedrockDiscovery; isLoading?: boolean } = { data: undefined };
vi.mock('@/hooks/useBedrockModels', () => ({ useBedrockModels: () => discovery }));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => ({ data: undefined }) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

import { BedrockProviderCard } from '@/components/settings/providers/BedrockProviderCard';
import { chooseOption, listOptions } from '@/test/chooseOption';

const LIVE: BedrockDiscovery = {
  payload: {
    source: 'live',
    fetchedAt: '2026-10-12T10:00:00Z',
    models: [
      { id: 'eu.anthropic.claude-example-9', name: 'Claude Example 9 (inference profile)', type: 'chat' },
      { id: 'amazon.titan-embed-example', name: 'Titan Embed (Amazon)', type: 'embedding' },
    ],
  },
};

const openForm = () => {
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
};

describe('Bedrock model picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discovery = { data: undefined };
    post.mockResolvedValue({ data: { data: { assumeRole: 'ok', invoke: 'ok', latencyMs: 1 } } });
  });
  afterEach(cleanup);

  it('offers the live chat models from AWS and says the list is live', async () => {
    discovery = { data: LIVE };
    openForm();

    expect(screen.getByText('Live from AWS · 1 chat models')).toBeInTheDocument();
    // The preset default is not in this account's list, so it opens as text rather than hiding.
    expect(screen.getByDisplayValue('anthropic.claude-3-5-sonnet-20241022-v2:0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pick from the list instead/i }));
    const options = await listOptions(screen.getByRole('combobox', { name: /Default Model/i }));
    expect(options).toContain('Claude Example 9 (inference profile)');
    // Embedding models cannot be a chat default.
    expect(options).not.toContain('Titan Embed (Amazon)');
    expect(options).toContain('Other (type a model id)…');
  });

  it('names the missing permission when AWS refuses the listing', () => {
    discovery = { data: { payload: null, reason: 'access_denied' } };
    openForm();
    expect(screen.getByText(/bedrock:ListFoundationModels/)).toBeInTheDocument();
  });

  it('asks to save first when there is no stored connection to list with', () => {
    discovery = { data: { payload: null, reason: 'not_configured' } };
    openForm();
    expect(screen.getByText(/save this connection to load the models/)).toBeInTheDocument();
    // Control: the permission hint is NOT shown for this reason.
    expect(screen.queryByText(/bedrock:ListFoundationModels/)).not.toBeInTheDocument();
  });

  it('"Other" accepts any model id, and that id is what gets tested', async () => {
    openForm();
    await chooseOption(screen.getByRole('combobox', { name: /Default Model/i }), /Other \(type a model id\)/);

    const input = screen.getByPlaceholderText(/eu\.anthropic\.claude-… or an inference profile ARN/);
    fireEvent.change(input, { target: { value: 'eu.anthropic.claude-new-model-v1:0' } });
    fireEvent.click(screen.getByRole('button', { name: /Test Connection/i }));

    expect(post).toHaveBeenCalledWith(
      '/api/integrations/test-bedrock',
      expect.objectContaining({ modelId: 'eu.anthropic.claude-new-model-v1:0' })
    );
  });

  it('keeps the text field while it is cleared to type a new id', () => {
    discovery = { data: LIVE };
    openForm();
    const field = screen.getByDisplayValue('anthropic.claude-3-5-sonnet-20241022-v2:0');
    fireEvent.change(field, { target: { value: '' } });
    expect(
      screen.getByPlaceholderText(/eu\.anthropic\.claude-… or an inference profile ARN/)
    ).toHaveValue('');
    // Typing an id that happens to be listed does not swap the field out either.
    fireEvent.change(
      screen.getByPlaceholderText(/eu\.anthropic\.claude-… or an inference profile ARN/),
      { target: { value: 'eu.anthropic.claude-example-9' } }
    );
    expect(screen.getByDisplayValue('eu.anthropic.claude-example-9')).toBeInTheDocument();
  });

  it('moves focus to the text field after choosing Other', async () => {
    openForm();
    await chooseOption(screen.getByRole('combobox', { name: /Default Model/i }), /Other \(type a model id\)/);
    expect(
      screen.getByPlaceholderText(/eu\.anthropic\.claude-… or an inference profile ARN/)
    ).toHaveFocus();
  });
});
