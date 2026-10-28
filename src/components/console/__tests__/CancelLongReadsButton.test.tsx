import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancelLongReads = vi.fn(() =>
  Promise.resolve({ olderThanSeconds: 300, cancelled: 3, reads: [] })
);
vi.mock('@/services/platform.service', () => ({ platformService: { cancelLongReads } }));

const { CancelLongReadsButton } = await import('../CancelLongReadsButton');

const renderButton = (longestSeconds: number | null) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CancelLongReadsButton longestSeconds={longestSeconds} />
    </QueryClientProvider>
  );

describe('CancelLongReadsButton', () => {
  beforeEach(() => cancelLongReads.mockClear());

  it('stops the reads only after the confirm, and says how many', async () => {
    renderButton(2442);
    await userEvent.click(screen.getByRole('button', { name: /stop reads running over 5 min/i }));
    expect(cancelLongReads).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Stop them' }));
    await waitFor(() => expect(screen.getByText('Stopped 3 reads.')).toBeInTheDocument());
    expect(cancelLongReads).toHaveBeenCalledTimes(1);
  });

  it('CONTROL — nothing past five minutes: the button is off', () => {
    renderButton(120);
    expect(screen.getByRole('button', { name: /stop reads running over 5 min/i })).toBeDisabled();
  });
});
