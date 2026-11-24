/**
 * The text field in front of a secret collects the saved USER NAME when a browser fills a login
 * (seen live on the custom AI provider form: the admin's email landed in the base URL). Such a
 * field is named and marked so browsers and password managers leave it alone. jsdom cannot see
 * autofill, so this reads the attributes the real fix consists of. Invented data.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CustomProviderCard } from '../CustomProviderCard';

vi.mock('@/features/settings/hooks/useCustomProviderModels', () => ({
  useCustomProviderModels: () => ({ data: undefined, isLoading: false }),
}));

afterEach(cleanup);

describe('fields in front of a secret', () => {
  it("the custom provider's base URL is named and marked; its key asks for no saved password", () => {
    render(
      <CustomProviderCard
        integrations={[]}
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
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Endpoint/ }));
    const baseUrl = document.getElementById('custom-baseurl');
    expect(baseUrl).toHaveAttribute('name', 'custom-provider-base-url');
    expect(baseUrl).toHaveAttribute('autocomplete', 'off');
    expect(baseUrl).toHaveAttribute('data-1p-ignore');
    expect(baseUrl).toHaveAttribute('data-lpignore', 'true');
    expect(document.getElementById('custom-apikey')).toHaveAttribute(
      'autocomplete',
      'new-password'
    );
  });
});
