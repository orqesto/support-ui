import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { AiChoiceStep } from './steps/AiChoiceStep';
import { ChannelsStep } from './steps/ChannelsStep';
import { DatabaseStep } from './steps/DatabaseStep';
import { InviteTeamStep } from './steps/InviteTeamStep';
import { PaymentStep } from './steps/PaymentStep';
import { isConnectedChannel } from '@/components/onboarding/connectedChannel';
import { SetupReconcileNotice } from './SetupReconcileNotice';
import { StepIndicator } from './StepIndicator';
import {
  buildWizardSteps,
  initialWizardPlan,
  PAID_PLANS,
  resumeIndex,
  STEP_LABEL,
  STEP_NUMBER,
  STEP_TITLE,
  channelRequiredToFinish,
  type StepId,
  type WizardPlanState,
} from './wizardSteps';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import {
  onboardingService,
  type OnboardingState,
  type WorkspaceSetupStatus,
} from '@/services/onboarding.service';
import { integrationsService } from '@/services/integrations.service';
import type { DatabaseDisplay } from '@/services/database.service';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useBackendVersion } from '@/hooks/useBackendVersion';
import { getApiErrorMessage, getErrorBody } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { subscriptionService } from '@/services/subscription.service';

type StepNumber = OnboardingState['currentStep'];

const COUNT_WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];

/** The step list and the billing flag it was built from: taken once per mount (see below). */
type StepSnapshot = { billingEnabled: boolean; steps: StepId[] };

/**
 * Wizard shell: step state + navigation. Progress persists via fire-and-forget
 * PATCHes (resume point survives reloads); Finish stamps completion and starts
 * the 14-day trial clock; Skip keeps the original org-creation expiry.
 */
export const OnboardingWizard = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  // A global admin can reach the wizard on demand (opt-in banner) to set up a client
  // workspace; finishing on their behalf starts that org's trial, so it's confirmed.
  const isGlobalAdmin = currentUser?.role === 'admin';
  const persisted = useOnboardingStore((state) => state.onboarding);
  const managedAiAvailable = useOnboardingStore((state) => state.managedAiAvailable);
  // Database step facts (BYODB Phase 2). A backend that predates the step sends nothing,
  // and the honest default for "unknown" is the old behaviour: managed allowed.
  const database = useOnboardingStore((state) => state.database);
  const managedDbAllowed = database?.managedAllowed ?? true;
  const currentDatabase = database?.current ?? null;
  const markComplete = useOnboardingStore((state) => state.markComplete);
  const refreshOnboarding = useOnboardingStore((state) => state.refresh);
  const backendVersion = useBackendVersion();
  // The payment step exists only for a signup that arrived with a paid plan
  // preselected, and only where a billing provider is actually configured — a
  // self-hosted or not-yet-activated box has no Stripe to talk to.
  const selectedPlan = persisted?.selectedPlan;
  // A plan from the marketing site opens the step directly on that plan; anyone
  // else gets a selector defaulted to the recommended tier.
  const planWasPreselected = !!selectedPlan && PAID_PLANS.includes(selectedPlan);
  // The step list is taken ONCE, on the first render where billing is known (the version read
  // answered, or failed: billing then counts as off, so the AI step shows and Payment does not).
  // Within one mount it never changes: a later answer of the version read, or a store refresh
  // ("Start on Free", the AI choice), must not add or drop a step under the user. A reload — or
  // the Gmail redirect — takes it again, so "Our AI" picked earlier then drops the AI step.
  const [snapshot, setSnapshot] = useState<StepSnapshot | null>(null);
  if (snapshot === null && (backendVersion.data !== undefined || backendVersion.isError)) {
    const snapshotBilling = backendVersion.data?.billingEnabled ?? false;
    setSnapshot({
      billingEnabled: snapshotBilling,
      steps: buildWizardSteps({
        billingEnabled: snapshotBilling,
        managedAiAvailable,
        managedDbAllowed,
        savedAiChoice: persisted?.aiChoice,
      }),
    });
  }
  const billingEnabled = snapshot?.billingEnabled ?? false;
  const steps: StepId[] = snapshot?.steps ?? [];
  const showPaymentStep = steps.includes('payment');
  // What the workspace ALREADY has, read from the backend rather than from wizard
  // progress. null while the check is in flight; a failed check resolves to null
  // and the wizard simply renders as it always did (fail open — a broken
  // reconciliation must never block setup).
  const [setup, setSetup] = useState<WorkspaceSetupStatus | null>(null);
  // Blocks the first paint: a workspace that is already fully configured should
  // bounce straight past the wizard rather than flash step 1 on its way out.
  const [checkingSetup, setCheckingSetup] = useState(true);

  // The SAVED step number; which step it is is worked out at render, from the step list.
  const [rawStep, setRawStep] = useState<StepNumber>(persisted?.currentStep ?? 1);
  const index = resumeIndex(steps, rawStep);
  const currentId: StepId | undefined = steps[index];
  const [aiChoice, setAiChoice] = useState<'managed' | 'byo' | undefined>(persisted?.aiChoice);
  const [dbChoice, setDbChoice] = useState<'managed' | 'own' | undefined>(persisted?.dbChoice);
  // The BE's refusal of the managed database (402 MANAGED_DB_NOT_ENTITLED), shown in the step.
  const [dbChoiceError, setDbChoiceError] = useState<string | null>(null);
  const [channelsConnected, setChannelsConnected] = useState(false);
  const [channelsKnown, setChannelsKnown] = useState(false);
  // Whether a card was actually saved on the payment step — changes the finish-button wording,
  // and makes the plan paid at once for the channel rule (channelRequiredToFinish).
  const [cardAdded, setCardAdded] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  // Set when complete()/skip() fails — surfaced to the user instead of silently
  // navigating to /dashboard (where the still-pending status would bounce them
  // right back into the wizard, an invisible loop).
  const [exitError, setExitError] = useState<string | null>(null);
  // "Start on Free" at the Database step: a workspace with no plan is blocked there, and the
  // Payment step (where the Free card lives) comes after it — so the way out must be here too.
  const [startingFree, setStartingFree] = useState(false);
  // The workspace's plan, for the Finish gate: only a paid plan needs a channel. undefined while the
  // read is in flight (Finish waits for it, so a paid plan cannot slip through); a failed read gives
  // `{}`, which does not gate — it must never trap the user.
  const [planState, setPlanState] = useState<WizardPlanState | undefined>(undefined);
  useEffect(() => {
    if (!billingEnabled) return;
    let cancelled = false;
    // getPlanState never throws; an unreadable plan stays null and does not gate.
    void subscriptionService.getPlanState().then((plan) => {
      if (!cancelled) setPlanState(plan);
    });
    return () => {
      cancelled = true;
    };
  }, [billingEnabled]);
  const handleStartFree = async () => {
    setStartingFree(true);
    setExitError(null);
    try {
      await subscriptionService.chooseFree();
      await refreshOnboarding();
    } catch (error) {
      logger.error('Failed to start the Free plan from onboarding:', error);
      setExitError(getApiErrorMessage(error) ?? "Couldn't start Free right now. Please try again.");
    } finally {
      setStartingFree(false);
    }
  };
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the step heading on each step change so keyboard/screen-reader
  // users are told the step changed instead of being stranded on the old content.
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [currentId]);

  // Seed connected-channel state up front so the Finish gate is correct even when
  // the user resumes at a later step without mounting the Channels step. The
  // Channels step keeps it fresh (onConnectedChange) while the user is on step 5.
  useEffect(() => {
    let cancelled = false;
    integrationsService
      .getAll()
      .then((res) => {
        if (cancelled) return;
        const list = res.success && res.data ? res.data : [];
        // Must match ChannelsStep's predicate exactly — this seeds the same gate. A
        // KB-marked mailbox IS a connected channel (post-cutoff mail is live), and
        // excluding it blocked "Finish setup" for users who followed the step's own tip
        // to tick "Use as Knowledge Base source".
        setChannelsConnected(list.some(isConnectedChannel));
        setChannelsKnown(true);
      })
      .catch((error: unknown) => {
        // Couldn't verify channels — leave the requirement un-enforced rather than
        // trap the user; the AI-choice requirement still applies.
        logger.error('Failed to check connected channels for onboarding:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistStep = (step: StepNumber) => {
    // Fire-and-forget: a 409 here just means the wizard was already finished/skipped
    // (e.g. this step-change raced a complete) — benign, log only, never surface it.
    onboardingService.updateProgress({ currentStep: step }).catch((error: unknown) => {
      logger.error('Failed to persist onboarding step:', error);
    });
  };

  // The People step's picker: Next saves its unsaved ticks first (null when there is no picker).
  const peopleBeforeNext = useRef<(() => Promise<boolean>) | null>(null);
  const registerPeopleBeforeNext = useCallback((fn: (() => Promise<boolean>) | null) => {
    peopleBeforeNext.current = fn;
  }, []);
  const [advancing, setAdvancing] = useState(false);
  const stepNow = useRef(currentId);
  stepNow.current = currentId;
  // Another step (Back) ends a wait that is still running: Next must not stay disabled.
  useEffect(() => setAdvancing(false), [currentId]);
  const handleNext = async () => {
    if (currentId === 'people' && peopleBeforeNext.current) {
      setAdvancing(true);
      const ok = await peopleBeforeNext.current();
      setAdvancing(false);
      // Left the step meanwhile: this Next is stale.
      if (!ok || stepNow.current !== 'people') return;
    }
    goTo(steps[index + 1]);
  };

  const goTo = (id: StepId) => {
    setExitError(null);
    setRawStep(STEP_NUMBER[id]);
    persistStep(STEP_NUMBER[id]);
  };

  const handleChooseAi = (choice: 'managed' | 'byo') => {
    setAiChoice(choice);
    onboardingService.updateProgress({ aiChoice: choice }).catch((error: unknown) => {
      logger.error('Failed to persist AI choice:', error);
    });
  };

  const handleChooseDb = useCallback((choice: 'managed' | 'own') => {
    setDbChoice(choice);
    setDbChoiceError(null);
    onboardingService.updateProgress({ dbChoice: choice }).catch((error: unknown) => {
      // No active plan: the managed choice is refused, not persisted. Say so where the
      // click happened and un-select it, rather than leaving a card lit that the server
      // rejected. Any other failure is the usual fire-and-forget progress write.
      if (getErrorBody(error)?.code === 'MANAGED_DB_NOT_ENTITLED') {
        setDbChoice(undefined);
        setDbChoiceError(
          getApiErrorMessage(error) ??
            'This workspace has no active plan — choose one in the Payment step (Free included) to use the managed database, or connect your own Postgres.'
        );
        return;
      }
      logger.error('Failed to persist database choice:', error);
    });
  }, []);

  // The Database card connected (or re-verified) an own database. Write its response straight
  // into the store — the Finish gate follows at once — and refresh best-effort after: a busy
  // workspace that just connected is PAUSED for the copy, so the refetch itself answers 503.
  const setDatabaseCurrent = useOnboardingStore((state) => state.setDatabaseCurrent);
  const handleDatabaseChanged = useCallback(
    (display: DatabaseDisplay) => {
      setDatabaseCurrent(display);
      void refreshOnboarding();
    },
    [refreshOnboarding, setDatabaseCurrent]
  );

  const handleChannelsConnected = (connected: boolean) => {
    setChannelsConnected(connected);
    setChannelsKnown(true);
  };

  // Finish opens the inbox; "Finish later" keeps the dashboard its dialog promises.
  const leaveWizard = (to: '/threads' | '/dashboard') => {
    markComplete();
    // Pull the fresh trial dates (completion restamped the clock) so the banner
    // shows the new countdown without a full reload.
    void refreshOnboarding();
    navigate(to, { replace: true });
  };

  const handleSkip = async () => {
    setExitError(null);
    try {
      await onboardingService.skip();
    } catch (error) {
      logger.error('Failed to skip onboarding:', error);
      // Stay on the wizard and surface it — navigating away on a failed skip
      // just loops the user back (status is still pending).
      setExitError("Couldn't skip setup right now. Please check your connection and try again.");
      return;
    }
    leaveWizard('/dashboard');
  };

  const handleFinish = async () => {
    setFinishing(true);
    setExitError(null);
    try {
      await onboardingService.complete();
    } catch (error) {
      logger.error('Failed to complete onboarding:', error);
      // The one refusal with a reason the user can act on: a workspace with no active plan
      // still on the managed database. Everything else reads as the connection problem it usually is.
      // With no Database step in the list the server's sentence (which names the Database step's
      // way out) cannot be followed here: say what can.
      const noPlanWithoutDatabaseStep = `This workspace has no active plan. ${
        showPaymentStep ? 'Choose one in the Payment step (Free included), or use' : 'Use'
      } “Finish later”, then connect your own Postgres in Settings › Integrations › Database (turn on “Show advanced settings”).`;
      setExitError(
        getErrorBody(error)?.code === 'MANAGED_DB_NOT_ENTITLED'
          ? steps.includes('database')
            ? (getApiErrorMessage(error) ??
              'This workspace has no active plan — choose one in the Payment step (Free included), or connect your own Postgres in the Database step before finishing.')
            : noPlanWithoutDatabaseStep
          : "Couldn't finish setup right now. Please check your connection and try again."
      );
      setFinishing(false);
      return;
    }
    setFinishing(false);
    leaveWizard('/threads');
  };

  // BYODB §3.4: a workspace that may not use the managed database (no active plan) and
  // has not connected its own cannot go past the Database step — mail must not start landing
  // in a database it will have to leave. Every other step is optional: set up now or later.
  // "Finish later" (header) stays the escape hatch.
  // It reads the LIVE store ("Start on Free" works by allowing the managed database), gated on
  // the step list: without a Database step there is nothing here to connect.
  const missingDatabase =
    steps.includes('database') &&
    !managedDbAllowed &&
    (currentDatabase?.mode ?? 'managed') === 'managed';
  const nextDisabled = currentId === 'database' && missingDatabase;
  const optionalUnfinished =
    (currentId === 'ai' && !aiChoice) ||
    (currentId === 'database' && !dbChoice) ||
    (currentId === 'channels' && !channelsConnected);
  // Per-step skip (footer) is distinct from ending the whole wizard (header).
  // A gated step is not skippable — say "Next" (disabled), not "Skip this step".
  const nextLabel = optionalUnfinished && !nextDisabled ? 'Skip this step' : 'Next';
  const isLastStep = index >= steps.length - 1;

  // Finishing STARTS the 14-day trial, so require the org to be minimally usable
  // first: an explicit AI choice, and — on a paid plan — at least one connected channel
  // (else no mail can arrive); Free may finish without one (channelRequiredToFinish).
  // "Finish later" (header) stays the escape hatch — it doesn't start
  // the trial. The channel requirement is only enforced once we could verify it
  // (channelsKnown), so a failed check never traps the user on this screen.
  // Payment is optional: finishing without a card is a supported outcome (the org
  // keeps its trial), so say so on the button rather than leaving the user
  // wondering whether they're about to skip something they needed.
  const finishLabel =
    currentId === 'payment' && !cardAdded
      ? 'Finish without a card'
      : 'Finish setup';

  // Only where the AI step is asked: a self-serve signup on our AI already has its choice saved.
  const missingAiChoice = steps.includes('ai') && !aiChoice;
  const missingChannel =
    channelRequiredToFinish({ billingEnabled, cardAdded, plan: planState ?? null }) &&
    channelsKnown &&
    !channelsConnected;
  const planPending = showPaymentStep && planState === undefined;
  const readyToFinish = !missingAiChoice && !missingChannel && !missingDatabase && !planPending;

  // Reconcile against what already exists, once, on mount.
  //
  // Workspaces are sometimes built by hand in Settings and never touched the
  // wizard, which left `onboarding.status` pending forever and kept redirecting
  // the admin into a wizard with nothing left to do. `reconcile` finishes the
  // wizard when — and only when — the backend agrees every step is satisfied
  // (it re-derives that itself, so this cannot be used to skip setup).
  useEffect(() => {
    let cancelled = false;
    onboardingService
      .getSetupStatus()
      .then(async (status) => {
        if (cancelled) return;
        setSetup(status);
        // Only ask to finish when the read says there is nothing left; the POST
        // re-derives satisfaction server-side anyway, so this is an optimisation
        // (no write-path call on an ordinary mount), not the security boundary.
        if (!status.allSatisfied) {
          setCheckingSetup(false);
          return;
        }
        const result = await onboardingService.reconcile();
        if (cancelled) return;
        if (result.isComplete) {
          // Nothing left to configure — leave without ever showing a step.
          markComplete();
          navigate('/', { replace: true });
          return;
        }
        setCheckingSetup(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Fail open: render the wizard exactly as before rather than trapping
        // the admin behind a failed reconciliation.
        logger.error('Failed to reconcile existing workspace setup:', error);
        setCheckingSetup(false);
      });
    return () => {
      cancelled = true;
    };
    // Mount-only: re-running would re-check on every keystroke-driven rerender.
  }, [markComplete, navigate]);

  if (checkingSetup || snapshot === null) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <p className="text-sm text-muted-foreground" role="status">
          Checking what your workspace already has…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-10">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Set up your workspace</h1>
            <p className="text-sm text-muted-foreground">
              {COUNT_WORD[steps.length] ?? steps.length} quick steps. Finish setup to start your 14-day trial of everything — then Free, no card needed.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => setSkipConfirmOpen(true)}>
              Finish later
            </Button>
          </div>
        </div>
        <StepIndicator activeStep={index + 1} labels={steps.map((id) => STEP_LABEL[id])} />
      </div>

      <div className="space-y-6" style={{ minHeight: '22rem' }}>
        <h2
          ref={stepHeadingRef}
          tabIndex={-1}
          className="font-display text-lg font-medium text-foreground outline-none"
        >
          <span className="sr-only">{`Step ${index + 1} of ${steps.length}: `}</span>
          {currentId && STEP_TITLE[currentId]}
        </h2>

        <SetupReconcileNotice setup={setup} step={currentId} />

        {currentId === 'ai' && (
          <AiChoiceStep
            value={aiChoice}
            onChoose={handleChooseAi}
            managedAvailable={managedAiAvailable}
          />
        )}
        {currentId === 'database' && (
          <DatabaseStep
            value={dbChoice}
            onChoose={handleChooseDb}
            managedAllowed={managedDbAllowed}
            current={currentDatabase}
            choiceError={dbChoiceError}
            onConnected={handleDatabaseChanged}
          />
        )}
        {currentId === 'channels' && <ChannelsStep onConnectedChange={handleChannelsConnected} />}
        {currentId === 'people' && <InviteTeamStep registerBeforeNext={registerPeopleBeforeNext} />}
        {currentId === 'payment' && (
          <PaymentStep
            initialPlan={initialWizardPlan(selectedPlan)}
            planWasPreselected={planWasPreselected}
            onPaidChange={setCardAdded}
          />
        )}
      </div>

      {exitError && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {exitError}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-6">
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => goTo(steps[index - 1])}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {!isLastStep ? (
          <div className="flex flex-col items-end gap-1.5">
            {nextDisabled && (
              <p className="text-right text-xs text-muted-foreground" data-testid="database-step-required">
                This workspace has no active plan — start on Free (no card) or connect your own Postgres to continue, or use “Finish later”.
              </p>
            )}
            {nextDisabled && (
              <Button variant="outline" onClick={() => void handleStartFree()} isLoading={startingFree}>
                Start on Free
              </Button>
            )}
            <Button disabled={nextDisabled || advancing} onClick={() => void handleNext()}>
              {nextLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1.5">
            {(missingAiChoice || missingChannel || missingDatabase) && (
              <p className="text-right text-xs text-muted-foreground">
                To start your trial, finish setup:{' '}
                {missingAiChoice && (
                  <button
                    type="button"
                    onClick={() => goTo('ai')}
                    className="font-medium text-primary underline"
                  >
                    choose how AI works
                  </button>
                )}
                {missingAiChoice && (missingDatabase || missingChannel) && ', '}
                {missingDatabase && (
                  <button
                    type="button"
                    onClick={() => goTo('database')}
                    className="font-medium text-primary underline"
                  >
                    connect your own database
                  </button>
                )}
                {missingDatabase && missingChannel && ' and '}
                {missingChannel && (
                  <button
                    type="button"
                    onClick={() => goTo('channels')}
                    className="font-medium text-primary underline"
                  >
                    connect a channel
                  </button>
                )}
                . Or use “Finish later”.
              </p>
            )}
            <Button
              isLoading={finishing}
              disabled={!readyToFinish}
              onClick={() => {
                // A global admin finishing on behalf of a client workspace STARTS
                // (and restamps) that workspace's trial — confirm before doing so.
                if (isGlobalAdmin) {
                  setFinishConfirmOpen(true);
                } else {
                  void handleFinish();
                }
              }}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {finishLabel}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={skipConfirmOpen}
        onOpenChange={setSkipConfirmOpen}
        onConfirm={() => void handleSkip()}
        title="Finish setup later?"
        description="You'll go to your dashboard, and can pick this up again any time from the “Finish setup” banner. Heads up: your 14-day trial is already running from signup — finishing setup extends it to 14 days from today, so the sooner you finish, the more trial you keep."
        confirmText="Go to dashboard"
        cancelText="Keep setting up"
        variant="info"
      />

      <ConfirmDialog
        open={finishConfirmOpen}
        onOpenChange={setFinishConfirmOpen}
        onConfirm={() => void handleFinish()}
        title="Start this workspace's 14-day trial?"
        description="Finishing setup as a platform admin STARTS (and restamps) this workspace's 14-day trial. Only continue if you're intentionally activating the workspace on its behalf."
        confirmText="Start trial & finish"
        cancelText="Cancel"
        variant="info"
      />
    </div>
  );
};
