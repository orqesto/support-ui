import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

/**
 * The wizard by step id (settings quick wins, Task 4): Mailbox and People first, the AI step only
 * where the AI choice is still open, Database only without the managed one, Payment only with
 * billing. The step list is taken ONCE per mount, after billing is known, and never reshuffles.
 * The steps are stubbed (each has its own tests); invented data.
 */

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

vi.mock('../steps/AiChoiceStep', () => ({
  AiChoiceStep: ({ onChoose }: { onChoose: (choice: 'managed' | 'byo') => void }) => (
    <div>
      ai-step
      <button type="button" onClick={() => onChoose('managed')}>
        Our AI
      </button>
    </div>
  ),
}));
vi.mock('../steps/ChannelsStep', () => ({ ChannelsStep: () => <div>channels-step</div> }));
vi.mock('../steps/DatabaseStep', () => ({
  DatabaseStep: ({ managedAllowed }: { managedAllowed: boolean }) => (
    <div>{managedAllowed ? 'managed-card-enabled' : 'managed-card-no-plan'}</div>
  ),
}));
// The picker's guard the People step hands the wizard (null = no picker on this workspace).
const peopleGuard = vi.hoisted(() => ({ fn: null as null | (() => Promise<boolean>) }));
vi.mock('../steps/InviteTeamStep', async () => {
  const { useEffect } = await import('react');
  return {
    InviteTeamStep: ({
      registerBeforeNext,
    }: {
      registerBeforeNext?: (fn: (() => Promise<boolean>) | null) => void;
    }) => {
      useEffect(() => {
        if (!peopleGuard.fn) return undefined;
        registerBeforeNext?.(peopleGuard.fn);
        return () => registerBeforeNext?.(null);
      }, [registerBeforeNext]);
      return <div>people-step</div>;
    },
  };
});
vi.mock('../steps/PaymentStep', () => ({ PaymentStep: () => <div>payment-step</div> }));
vi.mock('../SetupReconcileNotice', () => ({ SetupReconcileNotice: () => null }));
vi.mock('@/components/layout/ThemeToggle', () => ({ ThemeToggle: () => null }));

const version = vi.hoisted(() => ({
  current: {
    data: { billingEnabled: true } as { billingEnabled: boolean } | undefined,
    isError: false,
  },
}));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => version.current }));

const role = vi.hoisted(() => ({ value: 'org_admin' }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (pick: (store: { user: { role: string } }) => unknown) =>
    pick({ user: { role: role.value } }),
}));

type Store = {
  onboarding: { status: string; currentStep: number; aiChoice?: 'managed' | 'byo' };
  managedAiAvailable: boolean;
  database: { managedAllowed: boolean; current: { mode: string } };
  markComplete: () => void;
  refresh: () => Promise<void>;
  setDatabaseCurrent: () => void;
};
const store = vi.hoisted(() => ({ current: null as unknown as Store }));
vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: (pick: (state: Store) => unknown) => pick(store.current),
}));

const service = vi.hoisted(() => ({
  updateProgress: vi.fn((_body: Record<string, unknown>) => Promise.resolve({})),
  complete: vi.fn(() => Promise.resolve(null) as Promise<unknown>),
  skip: vi.fn(() => Promise.resolve(null)),
  setup: { allSatisfied: false, steps: [] as unknown[] },
  reconcile: vi.fn(() => Promise.resolve({ isComplete: false })),
}));
vi.mock('@/services/onboarding.service', () => ({
  onboardingService: {
    getSetupStatus: () => Promise.resolve(service.setup),
    updateProgress: (body: Record<string, unknown>) => service.updateProgress(body),
    complete: () => service.complete(),
    skip: () => service.skip(),
    reconcile: () => service.reconcile(),
  },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: () => Promise.resolve({ success: true, data: [] }) },
}));
const getPlanState = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ name: 'free', status: 'trialing' }))
);
const chooseFree = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/services/subscription.service', () => ({
  subscriptionService: { getPlanState: () => getPlanState(), chooseFree: () => chooseFree() },
}));

const { OnboardingWizard } = await import('../OnboardingWizard');

const indicator = (text: string) => screen.findByText(text, { selector: 'p' });

beforeEach(() => {
  peopleGuard.fn = null;
  navigate.mockReset();
  service.updateProgress.mockClear();
  service.complete.mockReset();
  service.complete.mockImplementation(() => Promise.resolve(null));
  service.skip.mockClear();
  service.reconcile.mockClear();
  service.setup = { allSatisfied: false, steps: [] };
  getPlanState.mockClear();
  chooseFree.mockClear();
  role.value = 'org_admin';
  version.current = { data: { billingEnabled: true }, isError: false };
  store.current = {
    onboarding: { status: 'pending', currentStep: 1, aiChoice: 'managed' },
    managedAiAvailable: true,
    database: { managedAllowed: true, current: { mode: 'managed' } },
    markComplete: vi.fn(),
    refresh: vi.fn(() => Promise.resolve()),
    setDatabaseCurrent: vi.fn(),
  };
});
afterEach(cleanup);

describe('the step list', () => {
  it('a self-serve signup: Step 1 of 3 Mailbox, then People, then Payment', async () => {
    render(<OnboardingWizard />);
    expect(await indicator('Step 1 of 3 — Mailbox')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Connect your mailbox/ })).toBeInTheDocument();
    expect(screen.getByText(/Three quick steps\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Skip this step|Next/ }));
    expect(await indicator('Step 2 of 3 — People')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Who answers your mail\?/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await indicator('Step 3 of 3 — Payment')).toBeInTheDocument();
    expect(screen.getByText('payment-step')).toBeInTheDocument();
    // Saved by the step's NUMBER, which does not change.
    expect(service.updateProgress).toHaveBeenCalledWith({ currentStep: 7 });
  });

  it('saved step 7 while billing is still loading: "Checking…", then Payment once it loads', async () => {
    store.current.onboarding.currentStep = 7;
    version.current = { data: undefined, isError: false };
    const { rerender } = render(<OnboardingWizard />);
    await waitFor(() =>
      expect(screen.getByText(/Checking what your workspace already has/)).toBeInTheDocument()
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('payment-step')).toBeNull();
    version.current = { data: { billingEnabled: true }, isError: false };
    rerender(<OnboardingWizard />);
    expect(await screen.findByText('payment-step')).toBeInTheDocument();
  });

  it('the version read fails: AI first, no Payment; a later success changes nothing', async () => {
    store.current.onboarding.currentStep = 7;
    version.current = { data: undefined, isError: true };
    const { rerender } = render(<OnboardingWizard />);
    expect(await indicator('Step 3 of 3 — People')).toBeInTheDocument();
    version.current = { data: { billingEnabled: true }, isError: true };
    rerender(<OnboardingWizard />);
    expect(screen.getByText('Step 3 of 3 — People', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Finish setup/ })).toBeInTheDocument();
    expect(getPlanState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await indicator('Step 1 of 3 — AI setup')).toBeInTheDocument();
  });

  it('remount after "Our AI" (saved 4): resumes on the mailbox, no AI step', async () => {
    store.current.onboarding = { status: 'pending', currentStep: 4, aiChoice: 'managed' };
    render(<OnboardingWizard />);
    expect(await indicator('Step 1 of 3 — Mailbox')).toBeInTheDocument();
    expect(screen.queryByText('ai-step')).toBeNull();
  });

  it('remount after "Own key" (saved 4): the AI step is still in the list', async () => {
    store.current.onboarding = { status: 'pending', currentStep: 4, aiChoice: 'byo' };
    render(<OnboardingWizard />);
    expect(await indicator('Step 2 of 4 — Mailbox')).toBeInTheDocument();
  });

  it('choosing the AI, then a store refresh, does not drop the AI step mid-wizard', async () => {
    store.current.onboarding = { status: 'pending', currentStep: 1 };
    const { rerender } = render(<OnboardingWizard />);
    expect(await indicator('Step 1 of 4 — AI setup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Our AI' }));
    store.current = {
      ...store.current,
      onboarding: { ...store.current.onboarding, aiChoice: 'managed' },
    };
    rerender(<OnboardingWizard />);
    expect(screen.getByText('Step 1 of 4 — AI setup', { selector: 'p' })).toBeInTheDocument();
  });

  it('"Start on Free" mid-wizard keeps the Database step; Next and the managed card are enabled', async () => {
    store.current.database = { managedAllowed: false, current: { mode: 'managed' } };
    store.current.onboarding.currentStep = 2;
    store.current.refresh = vi.fn(() => {
      store.current = {
        ...store.current,
        database: { managedAllowed: true, current: { mode: 'managed' } },
      };
      return Promise.resolve();
    });
    render(<OnboardingWizard />);
    expect(await indicator('Step 1 of 4 — Database')).toBeInTheDocument();
    expect(screen.getByText('managed-card-no-plan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start on Free' }));
    expect(await screen.findByText('managed-card-enabled')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4 — Database', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next|Skip this step/ })).not.toBeInactive();
  });

  it('billing off: the AI step comes first and Finish waits for a choice', async () => {
    version.current = { data: { billingEnabled: false }, isError: false };
    store.current.onboarding = { status: 'pending', currentStep: 5 };
    render(<OnboardingWizard />);
    expect(await indicator('Step 3 of 3 — People')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finish setup/ })).toBeInactive();
    fireEvent.click(screen.getByRole('button', { name: 'choose how AI works' }));
    expect(await indicator('Step 1 of 3 — AI setup')).toBeInTheDocument();
  });
});

describe('leaving the wizard', () => {
  it('Finish on a billing install without an AI step: completes and opens the inbox', async () => {
    store.current.onboarding.currentStep = 7;
    render(<OnboardingWizard />);
    const finish = await screen.findByRole('button', { name: /Finish without a card/ });
    await waitFor(() => expect(finish).not.toBeInactive());
    fireEvent.click(finish);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/threads', { replace: true }));
    expect(service.complete).toHaveBeenCalled();
    // Regression guard: no AI choice is sent beyond what the AI step saves.
    expect(service.updateProgress.mock.calls.some(([body]) => 'aiChoice' in body)).toBe(false);
  });

  it('"Finish later" goes to the dashboard', async () => {
    render(<OnboardingWizard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Finish later' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Go to dashboard' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('no Database step: a "no active plan" refusal says how to get out, not the old Settings path', async () => {
    store.current.onboarding.currentStep = 7;
    service.complete.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('Old text from the server.'), {
          response: {
            status: 402,
            data: { code: 'MANAGED_DB_NOT_ENTITLED', error: 'Old text from the server.' },
          },
        })
      )
    );
    render(<OnboardingWizard />);
    const finish = await screen.findByRole('button', { name: /Finish without a card/ });
    await waitFor(() => expect(finish).not.toBeInactive());
    fireEvent.click(finish);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'This workspace has no active plan. Choose one in the Payment step (Free included), or use “Finish later”, then connect your own Postgres in Settings › Integrations › Database (turn on “Show advanced settings”).'
    );
  });

  it('a global admin opening a workspace that is already set up: no confirm, it just leaves', async () => {
    role.value = 'admin';
    service.setup = { allSatisfied: true, steps: [] };
    service.reconcile.mockImplementation(() => Promise.resolve({ isComplete: true }));
    render(<OnboardingWizard />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Next on the People step saves unsaved team ticks first', () => {
  const toPeople = async () => {
    render(<OnboardingWizard />);
    await indicator('Step 1 of 3 — Mailbox');
    fireEvent.click(screen.getByRole('button', { name: /Skip this step|Next/ }));
    await indicator('Step 2 of 3 — People');
  };

  it('the save worked: it goes on to the next step', async () => {
    const save = vi.fn(() => Promise.resolve(true));
    peopleGuard.fn = save;
    await toPeople();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await indicator('Step 3 of 3 — Payment')).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('the save failed: it stays on the People step', async () => {
    const save = vi.fn(() => Promise.resolve(false));
    peopleGuard.fn = save;
    await toPeople();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.getByText('people-step')).toBeInTheDocument();
    expect(await indicator('Step 2 of 3 — People')).toBeInTheDocument();
    // Next works again once the save can succeed.
    save.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await indicator('Step 3 of 3 — Payment')).toBeInTheDocument();
  });

  it('no picker on this workspace: Next goes on as before', async () => {
    await toPeople();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await indicator('Step 3 of 3 — Payment')).toBeInTheDocument();
  });
});
