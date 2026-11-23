/**
 * The custom (OpenAI-compatible) provider form called its API key optional, "for unauthenticated
 * endpoints". No AI client is built for a custom provider without a key, so such a provider was
 * saved, looked configured, and answered nothing; the backend now refuses the save. The form asks
 * for the key. Invented data.
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
  it('does not offer Save without an API key, and no longer calls the key optional', () => {
    const onSave = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Add Endpoint/ }));
    fill('custom-name', 'Our gateway');
    fill('custom-baseurl', 'https://llm.example.com/v1');
    fill('custom-model', 'example-model');
    expect(refused(save())).toBe(true);
    fireEvent.click(save());
    expect(screen.queryByText(/optional/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/unauthenticated/i)).toBeNull();
    fill('custom-apikey', '   ');
    expect(refused(save())).toBe(true);
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('CONTROL: with a key it saves what was typed', () => {
    const onSave = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Add Endpoint/ }));
    fill('custom-name', 'Our gateway');
    fill('custom-baseurl', 'https://llm.example.com/v1');
    fill('custom-model', 'example-model');
    fill('custom-apikey', 'sk-example');
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://llm.example.com/v1', apiKey: 'sk-example' })
    );
  });
});
