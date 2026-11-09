import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SkillPattern } from '@/types/skillRouting';

/**
 * Settings → Routing skills → a value's text patterns (BE 2026-11-09): ready-made patterns and the
 * admin's own regex count like keywords; the backend's reason for refusing one is shown.
 */
const setRoutingValuePatterns =
  vi.fn<(key: string, value: string, patterns: SkillPattern[]) => Promise<void>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    setRoutingValuePatterns: (key: string, value: string, patterns: SkillPattern[]) =>
      setRoutingValuePatterns(key, value, patterns),
  },
}));

import { RoutingValuePatterns } from '../RoutingValuePatterns';

describe('RoutingValuePatterns', () => {
  beforeEach(() => {
    setRoutingValuePatterns.mockReset();
    setRoutingValuePatterns.mockResolvedValue();
  });

  it('shows the saved patterns; ticking a preset and adding a regex saves both', async () => {
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        initial={[{ preset: 'tron_address' }, { regex: 'ORD-\\d{6}' }]}
      />
    );
    expect(screen.getByLabelText(/Tron address/)).toBeChecked();
    expect(screen.getByLabelText(/EVM transaction hash/)).not.toBeChecked();
    expect(screen.getByText('ORD-\\d{6}')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/EVM transaction hash/));
    fireEvent.change(screen.getByLabelText('Custom pattern for usdt'), {
      target: { value: '  INV-\\d+  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add pattern for usdt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save patterns for usdt' }));

    await waitFor(() =>
      expect(setRoutingValuePatterns).toHaveBeenCalledWith('payment_sys', 'usdt', [
        { preset: 'evm_tx_hash' },
        { preset: 'tron_address' },
        { regex: 'ORD-\\d{6}' },
        { regex: 'INV-\\d+' },
      ])
    );
    expect(await screen.findByText('Patterns saved.')).toBeInTheDocument();
  });

  it('removing everything saves an empty list', async () => {
    render(
      <RoutingValuePatterns routingKey="payment_sys" value="usdt" initial={[{ regex: 'x\\d' }]} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove pattern x\\d' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save patterns for usdt' }));
    await waitFor(() =>
      expect(setRoutingValuePatterns).toHaveBeenCalledWith('payment_sys', 'usdt', [])
    );
  });

  it('a refused pattern shows the backend reason, not a generic error', async () => {
    setRoutingValuePatterns.mockRejectedValue({
      status: 400,
      data: {
        success: false,
        message: 'This pattern matches empty text, so it would match every message: x?',
      },
    });
    render(<RoutingValuePatterns routingKey="payment_sys" value="usdt" initial={[]} />);
    fireEvent.change(screen.getByLabelText('Custom pattern for usdt'), { target: { value: 'x?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add pattern for usdt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save patterns for usdt' }));
    expect(await screen.findByText(/matches empty text/)).toBeInTheDocument();
  });

  it('an unsafe regex refusal (ApiError shape: `error`) shows its reason too', async () => {
    setRoutingValuePatterns.mockRejectedValue({
      status: 400,
      data: { success: false, error: 'Pattern contains nested quantifiers' },
    });
    render(<RoutingValuePatterns routingKey="payment_sys" value="usdt" initial={[]} />);
    fireEvent.change(screen.getByLabelText('Custom pattern for usdt'), {
      target: { value: '(a+)+' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save patterns for usdt' }));
    expect(await screen.findByText('Pattern contains nested quantifiers')).toBeInTheDocument();
  });

  it('a typed regex that was not added is saved too; Save is off when nothing changed (review 2026-11-09)', async () => {
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        initial={[{ preset: 'evm_tx_hash' }]}
      />
    );
    const save = screen.getByRole('button', { name: 'Save patterns for usdt' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Custom pattern for usdt'), {
      target: { value: ' ORD-\\d+ ' },
    });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() =>
      expect(setRoutingValuePatterns).toHaveBeenCalledWith('payment_sys', 'usdt', [
        { preset: 'evm_tx_hash' },
        { regex: 'ORD-\\d+' },
      ])
    );
    // Saved: the regex shows as a chip, the field is empty, Save is off again.
    expect(await screen.findByText('Patterns saved.')).toBeInTheDocument();
    expect(screen.getByText('ORD-\\d+')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom pattern for usdt')).toHaveValue('');
    expect(save).toHaveAttribute('aria-disabled', 'true');
  });
});
