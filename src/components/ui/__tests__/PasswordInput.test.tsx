/**
 * Every secret in Settings — 24 fields across 18 files: API keys, SMTP passwords,
 * bot tokens, the AWS secret access key — was a masked input with no way to check
 * what had been typed or pasted. Only the four auth pages had a reveal, each with
 * its own hand-rolled copy.
 *
 * Revealing is safe here because the backend masks secrets on read as
 * `first4••••••••last4` and the edit form round-trips that mask, so a pre-filled
 * field holds a mask rather than a live credential.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasswordInput } from '@/components/ui/PasswordInput';

describe('PasswordInput', () => {
  it('starts masked and reveals on demand', () => {
    render(<PasswordInput label="API Key" value="sk-secret" onChange={vi.fn()} />);
    const field = screen.getByLabelText('API Key');
    expect(field).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('names what it reveals, so a screen reader user is not told "password" for an API key', () => {
    render(<PasswordInput label="API Key" revealLabel="API key" value="" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Show API key' })).toBeInTheDocument();
  });

  it('reports its state, and never submits the form it sits in', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput label="Secret" value="" onChange={vi.fn()} />
      </form>
    );
    const toggle = screen.getByRole('button', { name: 'Show password' });
    // A bare <button> in a form defaults to type="submit" — clicking the eye would
    // save the form. That is the failure this assertion exists for.
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('tells the browser not to autofill a saved login password into a secret field', () => {
    // Observed on the OpenAI card: Chrome injected a saved password into the API-key
    // box, and submitting would have stored it AS the key. Chrome largely ignores
    // `autocomplete="off"` on password inputs; `new-password` is the value it honours.
    render(<PasswordInput label="API Key" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('API Key')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('still lets a real login field offer the stored password', () => {
    render(
      <PasswordInput
        label="Current Password"
        autoComplete="current-password"
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Current Password')).toHaveAttribute(
      'autocomplete',
      'current-password'
    );
  });

  it('keeps label, error and toggle wired to the same input', () => {
    // The toggle is centred against a box that must wrap the INPUT and nothing else.
    // Delegating label/error to `Input` grew that box and needed a magic offset per
    // combination — offsets jsdom cannot check. Rendering them here keeps the box
    // exactly one input tall, so `inset-y-0` is correct at sm, md and lg alike.
    render(
      <PasswordInput label="API Key" error="That key was rejected" value="" onChange={vi.fn()} />
    );
    const field = screen.getByLabelText('API Key');
    expect(field).toHaveAttribute('aria-describedby', field.getAttribute('id') + '-error');
    expect(screen.getByText('That key was rejected')).toBeInTheDocument();
    // One input, one toggle — not a duplicate label pointing at nothing.
    expect(screen.getAllByLabelText('API Key')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });

  it('cannot be revealed while the field is disabled', () => {
    render(<PasswordInput label="API Key" value="sk-secret" onChange={vi.fn()} disabled />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password');
  });

  it('passes the value and change handler straight through', () => {
    const onChange = vi.fn();
    render(<PasswordInput label="API Key" value="abc" onChange={onChange} />);
    const field = screen.getByLabelText('API Key');
    expect(field).toHaveValue('abc');
    fireEvent.change(field, { target: { value: 'abcd' } });
    expect(onChange).toHaveBeenCalled();
  });
});
