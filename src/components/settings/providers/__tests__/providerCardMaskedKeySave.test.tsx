/**
 * FE audit 2026-09-29, B-H8: editing an OpenAI / Anthropic / DeepSeek / Perplexity / Qwen card
 * without retyping the masked key did nothing and said nothing — the card blanked the masked
 * key and skipped the save. The backend restores the stored secret for a masked value, so the
 * card now sends it as is; only an EMPTY key refuses.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render as rtlRender, screen, cleanup, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { OpenAIProviderCard } from '../OpenAIProviderCard';
import { AnthropicProviderCard } from '../AnthropicProviderCard';
import type { Integration } from '@/services/integrations.service';

afterEach(cleanup);

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const MASKED = 'sk-••••••••••••1234';
const stored = (over: Partial<Integration> = {}): Integration =>
  ({
    id: 1,
    name: 'OpenAI',
    type: 'openai',
    enabled: true,
    config: { apiKey: MASKED, baseUrl: '', organization: '', defaultChatModel: 'gpt-4o-mini' },
    ...over,
  }) as Integration;

const common = {
  models: [],
  showModels: {},
  testing: null,
  deleting: null,
  saving: null,
  toggling: null,
  onToggleModels: vi.fn(),
  onEdit: vi.fn(),
  onTest: vi.fn(),
  onDelete: vi.fn(),
  onToggleEnabled: vi.fn(),
  onCancel: vi.fn(),
};

describe('provider cards save an edit that keeps the masked key', () => {
  it('OpenAI: Update sends the masked key as is, so the backend restores the stored secret', () => {
    const onSave = vi.fn();
    // `editingId` is set by the PARENT from `onEdit` after the click; the row's Edit button is
    // disabled once it is this row, so the test starts before that.
    render(
      <OpenAIProviderCard {...common} integrations={[stored()]} editingId={null} onSave={onSave} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit provider' }));
    fireEvent.click(screen.getByRole('button', { name: /Save OpenAI/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      apiKey: MASKED,
      defaultChatModel: 'gpt-4o-mini',
    });
  });

  it('Anthropic: the same', () => {
    const onSave = vi.fn();
    render(
      <AnthropicProviderCard
        {...common}
        integrations={[stored({ name: 'Anthropic', type: 'anthropic' as Integration['type'] })]}
        editingId={null}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit provider' }));
    fireEvent.click(screen.getByRole('button', { name: /Save Anthropic/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0][0] as { apiKey: string }).apiKey).toBe(MASKED);
  });

  it('CONTROL: a new provider with no key still refuses to save', () => {
    const onSave = vi.fn();
    render(<OpenAIProviderCard {...common} integrations={[]} editingId={null} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Add OpenAI/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save OpenAI/ }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
