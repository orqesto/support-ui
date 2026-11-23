/**
 * The backend refuses to save, or to switch on, an AI provider no client can be built from, and
 * says why in a sentence ("An API key is required for OpenAI."). The page showed its own generic
 * "Failed to save …" over it, so the admin never learned what was missing. Invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AIProvidersSettings } from '../AIProvidersSettings';

const api = vi.hoisted(() => ({
  rows: [] as unknown[],
  upsert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAiModeState: () => Promise.resolve({ resolved: 'byo', stored: 'byo' }),
  },
}));
vi.mock('@/services/onboarding.service', () => ({
  onboardingService: { getStatus: () => Promise.resolve({ managedAiAvailable: false }) },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getAll: () => Promise.resolve({ success: true, data: api.rows }),
    test: vi.fn(),
    updateAiCostRates: vi.fn(),
    upsert: api.upsert,
    update: api.update,
  },
}));
vi.mock('@/services/ai.service', () => ({
  aiService: { getModels: () => Promise.resolve({ success: false }) },
}));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/settings/components/AckReplyPerSourceList', () => ({
  AckReplyPerSourceList: () => null,
}));
vi.mock('@/features/settings/components/VisionSettings', () => ({ VisionSettings: () => null }));
vi.mock('@/features/settings/components/AIProviderHealthCheck', () => ({
  AIProviderHealthCheck: () => null,
}));

/** The shape the api-client's interceptor rejects with: the server's `error` as the message. */
const refusal = (sentence: string) =>
  Object.assign(new Error(sentence), { status: 400, data: { success: false, error: sentence } });
const serverFailure = () =>
  Object.assign(new Error('Request failed with status code 500'), {
    status: 500,
    data: { success: false, error: 'connection terminated unexpectedly' },
  });

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AIProvidersSettings showModeSwitch showCostRates={false} />
    </QueryClientProvider>
  );

const saveOpenAi = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Add OpenAI/ }));
  fireEvent.change(screen.getByPlaceholderText('sk-...'), { target: { value: 'sk-test-key' } });
  fireEvent.click(screen.getByRole('button', { name: /Save OpenAI/ }));
};

beforeEach(() => {
  api.rows = [];
  api.upsert.mockReset();
  api.update.mockReset();
});
afterEach(cleanup);

describe('AI providers: a save the backend refuses', () => {
  it("shows the backend's own sentence", async () => {
    api.upsert.mockRejectedValue(refusal('The base URL points to a private or reserved address.'));
    renderPage();
    await saveOpenAi();
    expect(
      await screen.findByText('The base URL points to a private or reserved address.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Failed to save OpenAI integration')).toBeNull();
  });

  it('CONTROL: a server failure keeps the plain sentence, with no technical text', async () => {
    api.upsert.mockRejectedValue(serverFailure());
    renderPage();
    await saveOpenAi();
    expect(await screen.findByText('Failed to save OpenAI integration')).toBeInTheDocument();
    expect(screen.queryByText(/connection terminated/)).toBeNull();
  });
});

describe('AI providers: switching on a provider the backend refuses', () => {
  beforeEach(() => {
    api.rows = [
      { id: 7, organizationId: 5, name: 'Our OpenAI', type: 'openai', enabled: false, config: {} },
      {
        id: 8,
        organizationId: 5,
        name: 'Our Anthropic',
        type: 'anthropic',
        enabled: true,
        config: {},
      },
    ];
  });
  const isOn = (label: string) => {
    // The name sits on the <label>; the state is its checkbox's.
    const named = screen.getByLabelText(label);
    const box = named instanceof HTMLInputElement ? named : named.querySelector('input');
    return box?.checked === true;
  };

  it("shows the backend's own sentence and leaves the switch off", async () => {
    api.update.mockRejectedValue(refusal('An API key is required for OpenAI.'));
    renderPage();
    const toggle = await screen.findByLabelText('Toggle Our OpenAI');
    fireEvent.click(toggle);
    expect(await screen.findByText('An API key is required for OpenAI.')).toBeInTheDocument();
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Failed to enable Our OpenAI')).toBeNull();
    // The refused one is off again, and the provider that was working is still shown as on: the
    // click had drawn it as off, and the server changed nothing.
    await waitFor(() => expect(isOn('Toggle Our Anthropic')).toBe(true));
    expect(isOn('Toggle Our OpenAI')).toBe(false);
  });

  it('CONTROL: a server failure keeps the plain sentence', async () => {
    api.update.mockRejectedValue(serverFailure());
    renderPage();
    fireEvent.click(await screen.findByLabelText('Toggle Our OpenAI'));
    expect(await screen.findByText('Failed to enable Our OpenAI')).toBeInTheDocument();
  });
});
