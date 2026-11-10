import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { chooseOption } from '@/test/chooseOption';
import {
  SKILL_PATTERN_PRESETS,
  type SkillPattern,
  type SkillPatternPreset,
} from '@/types/skillRouting';

/**
 * Settings → Routing skills → a value's text patterns (BE 2026-11-09): ready-made patterns from
 * the platform catalogue and the admin's own regex count like keywords; each decides or only
 * hints; the backend's reason for refusing one is shown.
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

const CATALOGUE: SkillPatternPreset[] = [...SKILL_PATTERN_PRESETS];
const saveButton = () => screen.getByRole('button', { name: 'Save patterns for usdt' });

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
        presets={CATALOGUE}
        initial={[{ preset: 'tron_address' }, { regex: 'ORD-\\d{6}' }]}
      />
    );
    expect(screen.getByRole('checkbox', { name: /Tron address/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /EVM transaction hash/ })).not.toBeChecked();
    expect(screen.getByText('ORD-\\d{6}')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /EVM transaction hash/ }));
    fireEvent.change(screen.getByLabelText('Custom pattern for usdt'), {
      target: { value: '  INV-\\d+  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add pattern for usdt' }));
    fireEvent.click(saveButton());

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

  it('groups the catalogue by category, from the list it is given (not the built-in one)', () => {
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        initial={[]}
        presets={[
          { id: 'iban', label: 'IBAN', category: 'banking', caseSensitive: true },
          {
            id: 'ups_tracking',
            label: 'UPS tracking',
            example: '1Z…',
            category: 'shipping',
            caseSensitive: true,
          },
        ]}
      />
    );
    expect(screen.getByText('banking')).toBeInTheDocument();
    expect(screen.getByText('shipping')).toBeInTheDocument();
    expect(screen.getByLabelText('IBAN')).toBeInTheDocument();
    expect(screen.getByLabelText('UPS tracking (1Z…)')).toBeInTheDocument();
    // CONTROL: the built-in crypto list is not shown when the backend sent its own.
    expect(screen.queryByRole('checkbox', { name: /Tron address/ })).not.toBeInTheDocument();
  });

  it('a stored preset the catalogue no longer offers shows as unavailable, is kept on save, and can be removed', async () => {
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        presets={CATALOGUE}
        initial={[{ preset: 'retired_code', strength: 'hint' }, { preset: 'evm_address' }]}
      />
    );
    expect(screen.getByText('retired_code')).toBeInTheDocument();
    expect(screen.getByText(/Unavailable/)).toBeInTheDocument();
    // Nothing changed ⇒ Save is off even though the stored order differs from the catalogue's.
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('checkbox', { name: /EVM transaction hash/ }));
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(setRoutingValuePatterns).toHaveBeenLastCalledWith('payment_sys', 'usdt', [
        { preset: 'evm_tx_hash' },
        { preset: 'evm_address' },
        { preset: 'retired_code', strength: 'hint' },
      ])
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove pattern retired_code' }));
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(setRoutingValuePatterns).toHaveBeenLastCalledWith('payment_sys', 'usdt', [
        { preset: 'evm_tx_hash' },
        { preset: 'evm_address' },
      ])
    );
  });

  it('while the catalogue is loading or failed, stored presets show by id without "unavailable"', () => {
    const { rerender } = render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        presets={null}
        initial={[{ preset: 'evm_address' }]}
      />
    );
    expect(screen.getByText('Loading ready-made patterns…')).toBeInTheDocument();
    expect(screen.getByText('evm_address')).toBeInTheDocument();
    expect(screen.queryByText(/Unavailable/)).not.toBeInTheDocument();
    rerender(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        presets={null}
        presetsFailed
        initial={[{ preset: 'evm_address' }]}
      />
    );
    expect(screen.getByText(/Could not load the ready-made patterns/)).toBeInTheDocument();
    expect(screen.queryByText(/Unavailable/)).not.toBeInTheDocument();
  });

  it('round-trips strength and case-sensitivity it loaded; an unrelated change keeps them', async () => {
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        presets={CATALOGUE}
        initial={[
          { preset: 'tron_address', strength: 'hint' },
          { regex: 'ORD-\\d{6}', caseSensitive: true, strength: 'hint' },
          { regex: 'inv-\\d+', caseSensitive: false, strength: 'decides' },
        ]}
      />
    );
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Case-sensitive ORD-\\d{6}')).toBeChecked();
    expect(screen.getByLabelText('Case-sensitive inv-\\d+')).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: /EVM address/ }));
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(setRoutingValuePatterns).toHaveBeenCalledWith('payment_sys', 'usdt', [
        { preset: 'evm_address' },
        { preset: 'tron_address', strength: 'hint' },
        { regex: 'ORD-\\d{6}', caseSensitive: true, strength: 'hint' },
        { regex: 'inv-\\d+' },
      ])
    );
  });

  it('choosing "Only a hint for the AI" and Case-sensitive is saved; back to defaults sends the plain shape', async () => {
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        presets={CATALOGUE}
        initial={[{ preset: 'tron_address' }, { regex: 'ORD-\\d{6}' }]}
      />
    );
    await chooseOption(
      screen.getByRole('combobox', { name: 'Strength of Tron address' }),
      'Only a hint for the AI'
    );
    fireEvent.click(screen.getByLabelText('Case-sensitive ORD-\\d{6}'));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(setRoutingValuePatterns).toHaveBeenLastCalledWith('payment_sys', 'usdt', [
        { preset: 'tron_address', strength: 'hint' },
        { regex: 'ORD-\\d{6}', caseSensitive: true },
      ])
    );
    expect(await screen.findByText('Patterns saved.')).toBeInTheDocument();
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');

    await chooseOption(
      screen.getByRole('combobox', { name: 'Strength of Tron address' }),
      'Decides'
    );
    fireEvent.click(screen.getByLabelText('Case-sensitive ORD-\\d{6}'));
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(setRoutingValuePatterns).toHaveBeenLastCalledWith('payment_sys', 'usdt', [
        { preset: 'tron_address' },
        { regex: 'ORD-\\d{6}' },
      ])
    );
  });

  it('a language key shows the note that a detected language still decides; a topic key does not', () => {
    const { rerender } = render(
      <RoutingValuePatterns
        routingKey="lang"
        value="russian"
        presets={CATALOGUE}
        initial={[]}
        languageKey
      />
    );
    expect(screen.getByText(/detected or requested language still decides/)).toBeInTheDocument();
    rerender(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        presets={CATALOGUE}
        initial={[]}
      />
    );
    expect(
      screen.queryByText(/detected or requested language still decides/)
    ).not.toBeInTheDocument();
  });

  it('removing everything saves an empty list', async () => {
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        presets={CATALOGUE}
        initial={[{ regex: 'x\\d' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove pattern x\\d' }));
    fireEvent.click(saveButton());
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
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        presets={CATALOGUE}
        initial={[]}
      />
    );
    fireEvent.change(screen.getByLabelText('Custom pattern for usdt'), { target: { value: 'x?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add pattern for usdt' }));
    fireEvent.click(saveButton());
    expect(await screen.findByText(/matches empty text/)).toBeInTheDocument();
  });

  it('an unsafe regex refusal (ApiError shape: `error`) shows its reason too', async () => {
    setRoutingValuePatterns.mockRejectedValue({
      status: 400,
      data: { success: false, error: 'Pattern contains nested quantifiers' },
    });
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        presets={CATALOGUE}
        initial={[]}
      />
    );
    fireEvent.change(screen.getByLabelText('Custom pattern for usdt'), {
      target: { value: '(a+)+' },
    });
    fireEvent.click(saveButton());
    expect(await screen.findByText('Pattern contains nested quantifiers')).toBeInTheDocument();
  });

  it('a typed regex that was not added is saved too; Save is off when nothing changed (review 2026-11-09)', async () => {
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        presets={CATALOGUE}
        initial={[{ preset: 'evm_tx_hash' }]}
      />
    );
    const save = saveButton();
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

  it('an older backend (drops options on save): no strength or case controls (review 2026-11-09)', () => {
    render(
      <RoutingValuePatterns
        routingKey="payment_sys"
        value="usdt"
        initial={[{ regex: 'ORD-\\d+' }]}
        presets={CATALOGUE}
        optionsSupported={false}
      />
    );
    expect(screen.getByText('ORD-\\d+')).toBeInTheDocument();
    expect(screen.queryByLabelText('Case-sensitive ORD-\\d+')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Strength of ORD-\\d+')).not.toBeInTheDocument();
  });
});
