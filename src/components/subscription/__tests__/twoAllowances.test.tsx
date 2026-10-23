/**
 * Free has two one-time allowances on our AI (BE #1112): live mail and knowledge-base / history
 * import. Each line hides when its block is null; a used KB allowance shows its own banner (not
 * the AI-paused one); a Free workspace with no AI says why (verify email / own key); the two new
 * refusal codes get our words.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AiStatus } from '../aiStatus';
import type { OrgUsage } from '@/services/subscription.service';

const resent: string[] = [];
vi.mock('@/services/auth.service', () => ({
  authService: {
    resendVerification: (email: string) => {
      resent.push(email);
      return Promise.resolve({ success: true });
    },
  },
}));
vi.mock('@/lib/toast', () => ({
  toast: { success: () => undefined, failure: () => undefined },
}));

const { useAuthStore } = await import('@/stores/authStore');
const { StarterAllowanceLine } = await import('../StarterAllowanceLine');
const { KbPausedBanner } = await import('../KbPausedBanner');
const { AiPausedBanner } = await import('../AiPausedBanner');
const { AiUnavailableNotice } = await import('../AiUnavailableNotice');
const {
  ADMIN_NOT_VERIFIED_ADMIN_TEXT,
  ADMIN_NOT_VERIFIED_AGENT_TEXT,
  AI_KEY_SETTINGS_PATH,
  AI_REFUSAL_CODES,
  KB_USED_ADMIN_TEXT,
  KB_USED_AGENT_TEXT,
  OWN_KEY_REQUIRED_ADMIN_TEXT,
  OWN_KEY_REQUIRED_AGENT_TEXT,
  aiRefusalText,
  kbAllowanceLine,
  parseKbStarterAllowance,
  parseUnavailableReason,
} = await import('../starterAllowance');
const { normalizeUsage } = await import('@/services/subscription.service');

const MLN = 1_000_000;
const live = {
  totalMicros: 400_000,
  usedMicros: 100_000,
  remainingMicros: 300_000,
  exhausted: false,
};
const kb = { totalMicros: MLN, usedMicros: 370_000, remainingMicros: 630_000, exhausted: false };
const KB_MESSAGE =
  'Your free AI allowance for knowledge-base processing is used. Add your own AI key to process more history.';

const ai = (over: Partial<AiStatus> = {}): AiStatus => ({
  currency: 'USD',
  active: true,
  usedMicros: 0,
  budgetMicros: null,
  paused: false,
  bulkPaused: false,
  reason: null,
  message: null,
  resetsAt: null,
  ...over,
});
const inRouter = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);
const refusal = (code: string, error = 'Server sentence.') => ({
  status: 402,
  data: { code, error },
});

beforeEach(() => {
  resent.length = 0;
  useAuthStore.setState({ user: { email: 'owner@example.com' } as never });
});
afterEach(cleanup);

describe('the wire: normalizeUsage keeps the new ai fields only when they parse', () => {
  const usage = (aiBlock: Record<string, unknown>) =>
    normalizeUsage({ ai: { ...ai(), ...aiBlock } } as unknown as OrgUsage).ai;

  it('both allowances, kbPaused + kbMessage, a known unavailableReason', () => {
    const out = usage({
      starterAllowance: live,
      kbStarterAllowance: kb,
      kbPaused: true,
      kbMessage: KB_MESSAGE,
      unavailableReason: 'own_key_required',
    });
    expect(out?.starterAllowance?.totalMicros).toBe(400_000);
    expect(out?.kbStarterAllowance).toEqual(kb);
    expect(out?.kbPaused).toBe(true);
    expect(out?.kbMessage).toBe(KB_MESSAGE);
    expect(out?.unavailableReason).toBe('own_key_required');
  });

  it('null blocks, kbPaused false, an unknown reason (older or newer backend) ⇒ absent', () => {
    const out = usage({
      starterAllowance: null,
      kbStarterAllowance: null,
      kbPaused: false,
      kbMessage: null,
      unavailableReason: 'something_new',
    });
    expect(out).not.toHaveProperty('starterAllowance');
    expect(out).not.toHaveProperty('kbStarterAllowance');
    expect(out).not.toHaveProperty('kbPaused');
    expect(out).not.toHaveProperty('unavailableReason');
    expect(parseKbStarterAllowance({ kbStarterAllowance: { totalMicros: 0 } })).toBeUndefined();
    expect(parseUnavailableReason({ unavailableReason: 'admin_not_verified' })).toBe(
      'admin_not_verified'
    );
  });
});

describe('StarterAllowanceLine: one line per allowance, each hidden when null', () => {
  it('both allowances: the live line and the KB line', () => {
    render(
      <StarterAllowanceLine
        ai={ai({ starterAllowance: live, kbStarterAllowance: kb })}
        isAdmin={false}
      />
    );
    expect(screen.getByTestId('starter-allowance-line')).toBeInTheDocument();
    expect(screen.getByTestId('kb-allowance-line')).toHaveTextContent(
      'AI allowance for the knowledge base and history import: about 63% left.'
    );
  });

  it('KB null: no KB line; live null: no live line; both null: nothing', () => {
    const { rerender, container } = render(
      <StarterAllowanceLine ai={ai({ starterAllowance: live })} isAdmin />
    );
    expect(screen.queryByTestId('kb-allowance-line')).not.toBeInTheDocument();
    rerender(<StarterAllowanceLine ai={ai({ kbStarterAllowance: kb })} isAdmin />);
    expect(screen.queryByTestId('starter-allowance-line')).not.toBeInTheDocument();
    expect(screen.getByTestId('kb-allowance-line')).toBeInTheDocument();
    rerender(<StarterAllowanceLine ai={ai()} isAdmin />);
    expect(container).toBeEmptyDOMElement();
  });

  it('admins also read the KB money; used up says so', () => {
    expect(kbAllowanceLine(kb, true)).toBe(
      'AI allowance for the knowledge base and history import: about 63% left (≈ $0.63 of $1.00 left).'
    );
    expect(kbAllowanceLine({ ...kb, remainingMicros: 0, exhausted: true }, false)).toBe(
      'AI allowance for the knowledge base and history import: used up.'
    );
  });
});

describe('KbPausedBanner: KB allowance used, live mail still fine', () => {
  it('admin: the server sentence, that new mail keeps AI, and Add your AI key', () => {
    inRouter(<KbPausedBanner ai={ai({ kbPaused: true, kbMessage: KB_MESSAGE })} isAdmin />);
    expect(screen.getByTestId('kb-paused-banner')).toHaveTextContent(
      `${KB_MESSAGE} AI for new mail keeps running.`
    );
    expect(screen.getByText('Add your AI key')).toHaveAttribute('href', AI_KEY_SETTINGS_PATH);
  });

  it('agent: ask your admin, no link', () => {
    inRouter(<KbPausedBanner ai={ai({ kbPaused: true, kbMessage: KB_MESSAGE })} isAdmin={false} />);
    expect(screen.getByTestId('kb-paused-banner')).toHaveTextContent(KB_USED_AGENT_TEXT);
    expect(screen.queryByText('Add your AI key')).not.toBeInTheDocument();
  });

  it('not the AI-paused banner: kbPaused alone leaves AiPausedBanner empty', () => {
    inRouter(<AiPausedBanner ai={ai({ kbPaused: true, bulkPaused: true })} isAdmin />);
    expect(screen.queryByTestId('ai-paused-banner')).not.toBeInTheDocument();
  });

  it('hidden when kbPaused is false, and while live AI is paused (that banner shows)', () => {
    const { container, rerender } = inRouter(<KbPausedBanner ai={ai()} isAdmin />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <MemoryRouter>
        <KbPausedBanner ai={ai({ kbPaused: true, paused: true })} isAdmin />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('kb-paused-banner')).not.toBeInTheDocument();
  });
});

describe('AiUnavailableNotice: a Free workspace with no AI says why', () => {
  it('admin_not_verified (admin): verify text, resend verification, AI settings', async () => {
    inRouter(<AiUnavailableNotice ai={ai({ unavailableReason: 'admin_not_verified' })} isAdmin />);
    expect(screen.getByTestId('ai-unavailable-notice')).toHaveTextContent(
      ADMIN_NOT_VERIFIED_ADMIN_TEXT
    );
    expect(ADMIN_NOT_VERIFIED_ADMIN_TEXT).toBe(
      'Verify your email address to use the free AI allowance — or add your own AI key.'
    );
    expect(screen.getByText('AI settings')).toHaveAttribute('href', AI_KEY_SETTINGS_PATH);
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
    await waitFor(() => expect(resent).toEqual(['owner@example.com']));
    expect(await screen.findByText('Verification email sent')).toBeInTheDocument();
  });

  it('own_key_required (admin): add your own key, AI settings, no resend', () => {
    inRouter(<AiUnavailableNotice ai={ai({ unavailableReason: 'own_key_required' })} isAdmin />);
    expect(screen.getByTestId('ai-unavailable-notice')).toHaveTextContent(
      OWN_KEY_REQUIRED_ADMIN_TEXT
    );
    expect(OWN_KEY_REQUIRED_ADMIN_TEXT).toBe('Add your own AI key to use AI.');
    expect(screen.getByText('AI settings')).toHaveAttribute('href', AI_KEY_SETTINGS_PATH);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('agents read who can fix it, with no actions', () => {
    const { rerender } = inRouter(
      <AiUnavailableNotice ai={ai({ unavailableReason: 'admin_not_verified' })} isAdmin={false} />
    );
    expect(screen.getByTestId('ai-unavailable-notice')).toHaveTextContent(
      ADMIN_NOT_VERIFIED_AGENT_TEXT
    );
    expect(screen.queryByText('AI settings')).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <AiUnavailableNotice ai={ai({ unavailableReason: 'own_key_required' })} isAdmin={false} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('ai-unavailable-notice')).toHaveTextContent(
      OWN_KEY_REQUIRED_AGENT_TEXT
    );
  });

  it('no reason: nothing', () => {
    const { container } = inRouter(<AiUnavailableNotice ai={ai()} isAdmin />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('aiRefusalText: the two new codes', () => {
  it('FREE_KB_ALLOWANCE_USED: our KB sentence (admin and agent)', () => {
    expect(aiRefusalText(refusal('FREE_KB_ALLOWANCE_USED'), true)).toBe(KB_USED_ADMIN_TEXT);
    expect(aiRefusalText(refusal('FREE_KB_ALLOWANCE_USED'), false)).toBe(KB_USED_AGENT_TEXT);
  });

  it('AI_ADMIN_NOT_VERIFIED (403): verify your email (admin), who can fix it (agent)', () => {
    const forbidden = { status: 403, data: { code: 'AI_ADMIN_NOT_VERIFIED', error: 'x' } };
    expect(aiRefusalText(forbidden, true)).toBe(ADMIN_NOT_VERIFIED_ADMIN_TEXT);
    expect(aiRefusalText(forbidden, false)).toBe(ADMIN_NOT_VERIFIED_AGENT_TEXT);
  });

  it('both are AI refusals (kept out of the 402 subscription gate)', () => {
    expect(AI_REFUSAL_CODES).toContain('FREE_KB_ALLOWANCE_USED');
    expect(AI_REFUSAL_CODES).toContain('AI_ADMIN_NOT_VERIFIED');
  });
});
