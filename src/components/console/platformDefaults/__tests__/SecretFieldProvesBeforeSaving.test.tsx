/**
 * The console must distinguish "verified", "stored but unproven", and "refused".
 *
 * On 2026-09-02 a password-manager autofill landed in this field when it was cleared. It
 * saved, the badge went green, and managed AI answered 401 for four hours. The backend now
 * checks a credential before storing it; this field is where that answer is either shown or
 * thrown away.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecretField } from '../SecretField';
import type { SecretStatus } from '@/services/platformSettings.service';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CONFIGURED: SecretStatus = { configured: true, source: 'db', last4: 'x4EA' };
const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };

const type = async (value: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(/Enter a value|Enter a new value/), value);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  return user;
};

describe('saving a platform secret', () => {
  it('says the provider accepted it when the check passed', async () => {
    const onSave = vi.fn().mockResolvedValue({ ...CONFIGURED, verification: { checked: true, ok: true } });

    render(<SecretField label="API key" status={UNSET} onSave={onSave} onClear={vi.fn()} />);
    await type('sk-good');

    expect(await screen.findByText(/the provider accepted it/)).toBeTruthy();
  });

  it('does not call an unchecked save "verified"', async () => {
    // Bedrock, half an S3 pair, a provider that was down. Saved — and nothing was proven.
    const onSave = vi.fn().mockResolvedValue({
      ...CONFIGURED,
      verification: { checked: false, ok: false, reason: 'Bedrock authenticates per call.' },
    });

    render(<SecretField label="Access key" status={UNSET} onSave={onSave} onClear={vi.fn()} />);
    await type('AKIA');

    expect(await screen.findByText(/Saved, but not verified/)).toBeTruthy();
    expect(screen.getByText(/Bedrock authenticates per call/)).toBeTruthy();
  });

  it('shows the refusal and offers an explicit override', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('openai rejected this key (401 Unauthorized). It was NOT saved.'))
      .mockResolvedValueOnce({ ...CONFIGURED, verification: { checked: true, ok: false } });

    render(<SecretField label="API key" status={UNSET} onSave={onSave} onClear={vi.fn()} />);
    const user = await type('autofilled-junk');

    expect(await screen.findByText(/401 Unauthorized/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save anyway' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    // The override is the ONLY thing that differs — the same value, sent again on purpose.
    expect(onSave).toHaveBeenLastCalledWith('autofilled-junk', { force: true });
  });

  it('keeps the typed value when the save was refused', async () => {
    // It used to clear on every press. Retyping a long key is exactly when a password manager
    // fills it in for you — which is how this whole defect started.
    const onSave = vi.fn().mockRejectedValue(new Error('openai rejected this key (401 Unauthorized).'));

    render(<SecretField label="API key" status={UNSET} onSave={onSave} onClear={vi.fn()} />);
    await type('still-here');

    await waitFor(() => expect(screen.getByDisplayValue('still-here')).toBeTruthy());
  });

  it('CONTROL: clears the field once a save succeeds', async () => {
    const onSave = vi.fn().mockResolvedValue({ ...CONFIGURED, verification: { checked: true, ok: true } });

    render(<SecretField label="API key" status={UNSET} onSave={onSave} onClear={vi.fn()} />);
    await type('sk-good');

    await waitFor(() => expect(screen.queryByDisplayValue('sk-good')).toBeNull());
  });
});

describe('a stored value that cannot be read', () => {
  it('says so, and still names the credential that resolves', () => {
    // The row is there; it is not what traffic sends. Reporting it as the configured key is
    // what made the console look like proof while the environment served every call.
    render(
      <SecretField
        label="API key"
        status={{ configured: true, source: 'env', last4: 'envv', storedValueUnusable: true }}
        onSave={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByText(/Set · Environment ····envv/)).toBeTruthy();
    expect(screen.getByText(/A stored value can’t be read/)).toBeTruthy();
  });

  it('CONTROL: an ordinary console-set key says nothing about unusable rows', () => {
    render(<SecretField label="API key" status={CONFIGURED} onSave={vi.fn()} onClear={vi.fn()} />);

    expect(screen.getByText(/Set · Console ····x4EA/)).toBeTruthy();
    expect(screen.queryByText(/can’t be read/)).toBeNull();
  });
});
