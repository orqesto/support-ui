/**
 * The custom (OpenAI-compatible) provider form and its API key. An endpoint that asks for no key
 * is saved without one: the backend builds a client for a custom provider that names its base
 * URL. (For a while the form required the key, because no client was built without one.)
 * Invented data.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CustomProviderCard } from '../CustomProviderCard';
import type { Integration } from '@/services/integrations.service';

vi.mock('@/features/settings/hooks/useCustomProviderModels', () => ({
  useCustomProviderModels: () => ({ data: undefined, isLoading: false }),
}));

afterEach(cleanup);

const renderCard = (integrations: Integration[] = [], onSave = vi.fn()) => {
  render(
    <CustomProviderCard
      integrations={integrations}
      showModels={{}}
      testing={null}
      deleting={null}
      saving={null}
      toggling={null}
      editingId={null}
      onToggleModels={vi.fn()}
      onEdit={vi.fn()}
      onTest={vi.fn()}
      onDelete={vi.fn()}
      onToggleEnabled={vi.fn()}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  return onSave;
};
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const fill = (id: string, value: string) => fireEvent.change(field(id), { target: { value } });
const save = () => screen.getByRole('button', { name: /^Save$/ });
/** The design-system Button keeps a refused button focusable: it says so with aria-disabled. */
const refused = (button: HTMLElement) =>
  (button as HTMLButtonElement).disabled || button.getAttribute('aria-disabled') === 'true';

describe('Custom AI provider form', () => {
  const fillAllButKey = () => {
    fireEvent.click(screen.getByRole('button', { name: /Add Endpoint/ }));
    fill('custom-name', 'Our gateway');
    fill('custom-baseurl', 'https://llm.example.com/v1');
    fill('custom-model', 'example-model');
  };

  it('saves without an API key, and says the key may be left empty', () => {
    const onSave = renderCard();
    fillAllButKey();
    expect(screen.getByText('Leave empty if the endpoint asks for no key.')).toBeInTheDocument();
    expect(refused(save())).toBe(false);
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://llm.example.com/v1', apiKey: '' })
    );
  });

  it('CONTROL: without a base URL Save is not offered, key or no key', () => {
    const onSave = renderCard();
    fillAllButKey();
    fill('custom-baseurl', '   ');
    fill('custom-apikey', 'sk-example');
    expect(refused(save())).toBe(true);
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('with a key it saves what was typed', () => {
    const onSave = renderCard();
    fillAllButKey();
    fill('custom-apikey', 'sk-example');
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://llm.example.com/v1', apiKey: 'sk-example' })
    );
  });
});
