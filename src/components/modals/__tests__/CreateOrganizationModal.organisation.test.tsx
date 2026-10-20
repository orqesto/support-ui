/**
 * Create workspace on a self-hosted server: the Organisation choice decides `allianceId`
 * (absent = the default organisation, null = standalone, a number = that organisation).
 * Hosted: no select, the field is never sent.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// The real Select is a react-select popover; a button per option stands in for it here.
vi.mock('@/components/ui/Select', () => ({
  Select: ({
    options,
    onChange,
    id,
  }: {
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
    id?: string;
  }) => (
    <div data-testid={id}>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

const { CreateOrganizationModal } = await import('../CreateOrganizationModal');

const ORGS = [
  { id: 3, name: 'Organisation', slug: '__self_hosted__' },
  { id: 9, name: 'Acme group', slug: 'acme' },
];

const submit = async (props: { selfHostedDeployment: boolean }, pick?: string) => {
  const onCreate = vi.fn<(data: Record<string, unknown>) => Promise<void>>().mockResolvedValue();
  render(
    <CreateOrganizationModal isOpen onClose={() => {}} onCreate={onCreate} organisations={ORGS} {...props} />
  );
  fireEvent.change(screen.getByLabelText('Workspace Name'), { target: { value: 'Arasaka' } });
  if (pick) fireEvent.click(screen.getByRole('button', { name: pick }));
  fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
  return onCreate.mock.calls[0][0];
};

afterEach(cleanup);

describe('CreateOrganizationModal organisation choice', () => {
  it('None (standalone) sends allianceId: null', async () => {
    const data = await submit({ selfHostedDeployment: true }, 'None (standalone)');
    expect(data).toHaveProperty('allianceId', null);
  });

  it('another organisation sends its number', async () => {
    const data = await submit({ selfHostedDeployment: true }, 'Acme group');
    expect(data.allianceId).toBe(9);
  });

  it('the default sends no allianceId at all', async () => {
    const data = await submit({ selfHostedDeployment: true });
    expect(data).not.toHaveProperty('allianceId');
  });

  it('the implicit organisation is offered once, by its stored name', () => {
    render(
      <CreateOrganizationModal isOpen onClose={() => {}} onCreate={vi.fn()} organisations={ORGS} selfHostedDeployment />
    );
    expect(screen.getAllByRole('button', { name: 'Organisation' })).toHaveLength(1);
  });

  it('hosted shows no select and sends no allianceId', async () => {
    const data = await submit({ selfHostedDeployment: false }, undefined);
    expect(screen.queryByTestId('create-workspace-organisation')).toBeNull();
    expect(data).not.toHaveProperty('allianceId');
  });
});
