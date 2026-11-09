/** Console → Platform → System: API copies (architecture M7 B1). */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type State = {
  copies: { value: number; source: 'db' | 'default'; min: number; max: number };
  running: {
    copy: number;
    host: string;
    startedAt: string;
    copiesAtStart: number;
    gitSha: string;
  }[];
  appliesAtNextDeploy: boolean;
  selfHosted: boolean;
};

const one: State = {
  copies: { value: 1, source: 'default', min: 1, max: 3 },
  running: [
    {
      copy: 1,
      host: 'a1b2c3d4e5f6',
      startedAt: '2026-11-08T10:00:00.000Z',
      copiesAtStart: 1,
      gitSha: '7995024aadd47c5f',
    },
  ],
  appliesAtNextDeploy: false,
  selfHosted: false,
};

let current: State = one;
const puts: unknown[] = [];
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: () => Promise.resolve({ data: { data: current } }),
    put: (_url: string, body: { copies: number }) => {
      puts.push(body);
      current = {
        ...current,
        copies: { ...current.copies, value: body.copies, source: 'db' },
        appliesAtNextDeploy: body.copies !== current.running.length,
      };
      return Promise.resolve({ data: { data: current } });
    },
  },
}));

const { ApiCopiesCard } = await import('../ApiCopiesCard');

const renderCard = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ApiCopiesCard />
    </QueryClientProvider>
  );

describe('ApiCopiesCard', () => {
  beforeEach(() => {
    current = one;
    puts.length = 0;
  });
  afterEach(() => cleanup());

  it('shows the count set and the copies running, with nothing pending', async () => {
    renderCard();
    expect(await screen.findByText('Running now: 1')).toBeInTheDocument();
    expect(screen.getByText('a1b2c3d4e5f6')).toBeInTheDocument();
    expect(screen.getByText('7995024aa')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.queryByText(/the next deploy applies the count/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('saves a new count and says the next deploy applies it', async () => {
    renderCard();
    await screen.findByText('Running now: 1');
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText(/needs the worker split out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toEqual([{ copies: 2 }]));
    expect(await screen.findByText(/2 copies are set and 1 running/)).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('says a self-hosted install ignores the setting', async () => {
    current = { ...one, selfHosted: true };
    renderCard();
    expect(await screen.findByText(/This install is self-hosted/)).toBeInTheDocument();
  });

  it('says so when no copy has reported', async () => {
    current = { ...one, running: [], appliesAtNextDeploy: true };
    renderCard();
    expect(await screen.findByText(/No API copy has reported/)).toBeInTheDocument();
  });
});
