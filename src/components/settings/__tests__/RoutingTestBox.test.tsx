import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { RoutingTestResult } from '@/types/skillRouting';

const testRoutingMessage =
  vi.fn<(body: { text: string; askAi?: boolean }) => Promise<RoutingTestResult>>();
const getMembers =
  vi.fn<
    () => Promise<
      Array<{ id: number; userId: number; firstName?: string; lastName?: string; email?: string }>
    >
  >();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    testRoutingMessage: (body: { text: string; askAi?: boolean }) => testRoutingMessage(body),
    getMembers: () => getMembers(),
  },
}));

import { RoutingTestBox } from '../RoutingTestBox';

const result = (overrides: Partial<RoutingTestResult> = {}): RoutingTestResult => ({
  detectedLanguage: 'en',
  keys: [
    {
      key: 'payment_sys',
      status: 'clear',
      accepted: [{ key: 'payment_sys', value: 'usdt', source: 'keyword', evidence: 'Tether' }],
      candidates: [],
    },
  ],
  judgement: null,
  aiRefused: null,
  matches: [{ key: 'payment_sys', value: 'usdt', source: 'keyword', evidence: 'Tether' }],
  wouldAssign: { userId: 9, reason: 'skill_match', matches: [] },
  notes: ['Contact manager and client history are skipped: a pasted message has no sender.'],
  ...overrides,
});

describe('RoutingTestBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMembers.mockResolvedValue([
      { id: 1, userId: 9, firstName: 'Ada', lastName: 'Example', email: 'ada@example.com' },
    ]);
  });

  it('shows what matched, the evidence, and who would get it', async () => {
    testRoutingMessage.mockResolvedValue(result());
    render(<RoutingTestBox />);
    fireEvent.change(screen.getByLabelText('Message to test'), {
      target: { value: 'My Tether transfer is stuck' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText(/Ada Example/)).toBeInTheDocument();
    expect(screen.getByText(/by skill match/)).toBeInTheDocument();
    expect(screen.getByText('payment_sys = usdt — mentions “Tether”')).toBeInTheDocument();
    expect(testRoutingMessage).toHaveBeenCalledWith({
      text: 'My Tether transfer is stuck',
      askAi: false,
    });
  });

  it('Ask AI sends askAi and an unclear key shows as unclear', async () => {
    testRoutingMessage.mockResolvedValue(
      result({
        keys: [
          {
            key: 'payment_sys',
            status: 'unclear',
            accepted: [],
            candidates: [
              { key: 'payment_sys', value: 'usdt', source: 'keyword', evidence: 'TRC20' },
              { key: 'payment_sys', value: 'usdc', source: 'keyword', evidence: 'TRC20' },
            ],
          },
        ],
        wouldAssign: null,
        aiRefused: 'no_ai',
      })
    );
    render(<RoutingTestBox />);
    fireEvent.change(screen.getByLabelText('Message to test'), {
      target: { value: 'sent via TRC20' },
    });
    fireEvent.click(screen.getByRole('switch', { name: /Ask AI/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() =>
      expect(testRoutingMessage).toHaveBeenCalledWith({ text: 'sent via TRC20', askAi: true })
    );
    expect(await screen.findByText('unclear')).toBeInTheDocument();
    expect(screen.getByText(/Nobody would get it/)).toBeInTheDocument();
    expect(screen.getByText(/could be usdt or usdc/)).toBeInTheDocument();
    expect(screen.getByText(/No AI provider/)).toBeInTheDocument();
  });

  it('Test is disabled until there is text', () => {
    render(<RoutingTestBox />);
    expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
  });
});
