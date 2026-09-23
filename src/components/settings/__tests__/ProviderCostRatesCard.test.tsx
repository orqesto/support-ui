/**
 * The workspace's own provider rates — the only way a value gets IN. The console prices this
 * workspace's own-key usage at them, so a field that shows one number and saves another (or
 * saves half a pair) puts a wrong figure on the platform's spend page with nothing to flag it.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { Integration } from '@/services/integrations.service';
import { ProviderCostRatesCard, parseRates } from '../ProviderCostRatesCard';

const updateAiCostRates = vi.fn();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    updateAiCostRates: (...args: unknown[]) => updateAiCostRates(...args) as unknown,
  },
}));

const provider = (over: Partial<Integration> = {}): Integration =>
  ({
    id: 11,
    organizationId: 5,
    name: 'Our OpenAI',
    type: 'openai',
    enabled: true,
    config: {},
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
    inputCostPer1M: 1.25,
    outputCostPer1M: 10,
    ...over,
  }) as Integration;

const inputField = () => screen.getByLabelText<HTMLInputElement>('Our OpenAI input cost per 1M tokens');
const outputField = () => screen.getByLabelText<HTMLInputElement>('Our OpenAI output cost per 1M tokens');

beforeEach(() => {
  updateAiCostRates.mockReset();
  updateAiCostRates.mockImplementation((id: number, rates: Record<string, unknown>) =>
    Promise.resolve({ success: true, data: { id, ...rates } })
  );
});
afterEach(cleanup);

describe('ProviderCostRatesCard', () => {
  it('shows the stored rates', () => {
    render(<ProviderCostRatesCard integrations={[provider()]} onSaved={vi.fn()} />);
    expect(inputField().value).toBe('1.25');
    expect(outputField().value).toBe('10');
  });

  it('shows empty fields — not zero — for a provider with no rates', () => {
    render(
      <ProviderCostRatesCard
        integrations={[provider({ inputCostPer1M: null, outputCostPer1M: null })]}
        onSaved={vi.fn()}
      />
    );
    expect(inputField().value).toBe('');
    expect(outputField().value).toBe('');
  });

  it('saves the typed numbers and reports what the server stored', async () => {
    const onSaved = vi.fn();
    render(<ProviderCostRatesCard integrations={[provider()]} onSaved={onSaved} />);
    fireEvent.change(inputField(), { target: { value: '0,4' } });
    fireEvent.change(outputField(), { target: { value: '1.6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(updateAiCostRates).toHaveBeenCalledWith(11, { inputCostPer1M: 0.4, outputCostPer1M: 1.6 });
    expect(onSaved).toHaveBeenCalledWith(11, { inputCostPer1M: 0.4, outputCostPer1M: 1.6 });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('refuses half a pair without calling the server', async () => {
    render(<ProviderCostRatesCard integrations={[provider()]} onSaved={vi.fn()} />);
    fireEvent.change(outputField(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Set both the input and the output rate/)).toBeInTheDocument();
    expect(updateAiCostRates).not.toHaveBeenCalled();
  });

  it('clears both rates when both fields are emptied', async () => {
    render(<ProviderCostRatesCard integrations={[provider()]} onSaved={vi.fn()} />);
    fireEvent.change(inputField(), { target: { value: '' } });
    fireEvent.change(outputField(), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateAiCostRates).toHaveBeenCalled());
    expect(updateAiCostRates).toHaveBeenCalledWith(11, { inputCostPer1M: null, outputCostPer1M: null });
  });

  it('does not say Saved when the save failed', async () => {
    updateAiCostRates.mockRejectedValue(new Error('500'));
    render(<ProviderCostRatesCard integrations={[provider()]} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Could not save the rates/)).toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it("shows the server's reason when it refuses the rates", async () => {
    updateAiCostRates.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { success: false, error: 'Rates must be at most 10000' } },
    });
    render(<ProviderCostRatesCard integrations={[provider()]} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Rates must be at most 10000')).toBeInTheDocument();
  });

  it('shows the new stored values when the provider list reloads', () => {
    const { rerender } = render(<ProviderCostRatesCard integrations={[provider()]} onSaved={vi.fn()} />);
    rerender(
      <ProviderCostRatesCard integrations={[provider({ inputCostPer1M: 3, outputCostPer1M: 15 })]} onSaved={vi.fn()} />
    );
    expect(inputField().value).toBe('3');
    expect(outputField().value).toBe('15');
  });

  it('says the rate covers every model the provider serves', () => {
    // One rate per provider (owner's choice, 2026-09-23): a vision model on the same key is
    // priced at it too. The card must not read as a per-model price.
    render(<ProviderCostRatesCard integrations={[provider()]} onSaved={vi.fn()} />);
    expect(screen.getByText(/applied to every\s+model the provider serves/)).toBeInTheDocument();
  });

  it('renders nothing when the workspace has no AI provider', () => {
    const { container } = render(<ProviderCostRatesCard integrations={[]} onSaved={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('parseRates', () => {
  it.each([
    ['-1', '2'],
    ['1', '10001'],
    ['abc', '2'],
    ['1', 'Infinity'],
  ])('rejects %s / %s', (input, output) => {
    expect('error' in parseRates(input, output)).toBe(true);
  });

  it('accepts zero — a free self-hosted model is a real price', () => {
    expect(parseRates('0', '0')).toEqual({ rates: { inputCostPer1M: 0, outputCostPer1M: 0 } });
  });
});
