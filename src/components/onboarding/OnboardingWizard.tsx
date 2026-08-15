import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { AiChoiceStep } from './steps/AiChoiceStep';
import { ChannelsStep } from './steps/ChannelsStep';
import { DepartmentsStep } from './steps/DepartmentsStep';
import { InviteTeamStep } from './steps/InviteTeamStep';
import { KbStep } from './steps/KbStep';
import { PaymentStep } from './steps/PaymentStep';
import { StorageStep } from './steps/StorageStep';
import { StepIndicator } from './StepIndicator';
import { buildStepLabels, shouldShowPaymentStep } from './wizardSteps';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { onboardingService, type OnboardingState } from '@/services/onboarding.service';
import { integrationsService } from '@/services/integrations.service';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useBackendVersion } from '@/hooks/useBackendVersion';
import { logger } from '@/lib/logger';

type StepNumber = OnboardingState['currentStep'];

// Step order (KB is the last CORE step — see STEP_LABELS in StepIndicator).
const STEP_TITLES: Record<StepNumber, string> = {
  1: 'Review your departments',
  2: 'How should AI features work?',
  3: 'Where should files be stored?',
  4: 'Connect your message channels',
  5: 'Invite your team',
  6: 'Add knowledge for your AI',
  7: 'Add a payment method',
};

/**
 * Wizard shell: step state + navigation. Progress persists via fire-and-forget
 * PATCHes (resume point survives reloads); Finish stamps completion and starts
 * the 14-day trial clock; Skip keeps the original org-creation expiry.
 */
export const OnboardingWizard = () => {
  const navigate = useNavigate();
  const persisted = useOnboardingStore((state) => state.onboarding);
  const managedAiAvailable = useOnboardingStore((state) => state.managedAiAvailable);
  const markComplete = useOnboardingStore((state) => state.markComplete);
  const refreshOnboarding = useOnboardingStore((state) => state.refresh);
  const billingEnabled = useBackendVersion().data?.billingEnabled ?? false;
  // The payment step exists only for a signup that arrived with a paid plan
  // preselected, and only where a billing provider is actually configured — a
  // self-hosted or not-yet-activated box has no Stripe to talk to.
  const selectedPlan = persisted?.selectedPlan;
  const showPaymentStep = shouldShowPaymentStep(billingEnabled, selectedPlan);
  const stepLabels = buildStepLabels(showPaymentStep);
  // Clamp a resumed step into range: the step COUNT varies (6 core, 7 with
  // payment), and it dropped from 7 to 6 once before when the read-only Routing
  // step was removed. Clamping means an org that persisted step 7 — either as
  // old-Routing, or as payment before dropping out of the paid path — resumes on
  // the last step that exists instead of a blank screen. (Persisted step is a
  // bare index, so a reordered wizard resumes at the same NUMBER, i.e. a
  // possibly-different step — non-destructive; onboarding is a short one-off.)
  //
  // The raw resume point is kept unclamped and bounded at RENDER time, because
  // `billingEnabled` arrives from a query that may still be loading on the first
  // render: clamping in the initializer would permanently drop a resumed step 7
  // to 6 in the moment before the payment step is known to exist.
  const [rawStep, setRawStep] = useState<StepNumber>(persisted?.currentStep ?? 1);
  const activeStep = Math.min(rawStep, stepLabels.length) as StepNumber;
  const [aiChoice, setAiChoice] = useState<'managed' | 'byo' | undefined>(persisted?.aiChoice);
  const [channelsConnected, setChannelsConnected] = useState(false);
  const [channelsKnown, setChannelsKnown] = useState(false);
  // Per-step "the user actually engaged" signals, so the footer button reads
  // "Next" instead of "Skip this step" once they've added KB docs / picked storage.
  const [kbHasDocs, setKbHasDocs] = useState(false);
  const [storageChosen, setStorageChosen] = useState(false);
  // Whether a card was actually saved on the payment step — only changes the
  // finish-button wording, never whether the user is allowed to finish.
  const [cardAdded, setCardAdded] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  // Set when complete()/skip() fails — surfaced to the user instead of silently
  // navigating to /dashboard (where the still-pending status would bounce them
  // right back into the wizard, an invisible loop).
  const [exitError, setExitError] = useState<string | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the step heading on each step change so keyboard/screen-reader
  // users are told the step changed instead of being stranded on the old content.
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [activeStep]);

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
        setChannelsConnected(
          list.some(
            (item) =>
              (item.type === 'gmail' ||
                item.type === 'email' ||
                item.type === 'telegram' ||
                item.type === 'slack') &&
              !item.isKnowledgeBase
          )
        );
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

  const goTo = (step: StepNumber) => {
    setExitError(null);
    setRawStep(step);
    persistStep(step);
  };

  const handleChooseAi = (choice: 'managed' | 'byo') => {
    setAiChoice(choice);
    onboardingService.updateProgress({ aiChoice: choice }).catch((error: unknown) => {
      logger.error('Failed to persist AI choice:', error);
    });
  };

  const handleChannelsConnected = (connected: boolean) => {
    setChannelsConnected(connected);
    setChannelsKnown(true);
  };

  // Stable identities so the step components' report-up effects fire only on real
  // changes (doc count / storage choice), not on every wizard re-render.
  const handleKbDocsCount = useCallback((count: number) => setKbHasDocs(count > 0), []);
  const handleStorageChoice = useCallback(
    (choice: 'managed' | 'byo' | undefined) => setStorageChosen(!!choice),
    []
  );

  const leaveWizard = () => {
    markComplete();
    // Pull the fresh trial dates (completion restamped the clock) so the banner
    // shows the new countdown without a full reload.
    void refreshOnboarding();
    navigate('/dashboard', { replace: true });
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
    leaveWizard();
  };

  const handleFinish = async () => {
    setFinishing(true);
    setExitError(null);
    try {
      await onboardingService.complete();
    } catch (error) {
      logger.error('Failed to complete onboarding:', error);
      setExitError("Couldn't finish setup right now. Please check your connection and try again.");
      setFinishing(false);
      return;
    }
    setFinishing(false);
    leaveWizard();
  };

  // No step blocks advancing. AI (2 — managed or BYO), storage (3), channels (4)
  // and KB (6) are all optional — set up now or later. KB is the last step, so its
  // term only affects the (unshown) Next/Skip label there; the footer renders Finish.
  const nextDisabled = false;
  const optionalUnfinished =
    (activeStep === 2 && !aiChoice) ||
    (activeStep === 3 && !storageChosen) ||
    (activeStep === 4 && !channelsConnected) ||
    (activeStep === 6 && !kbHasDocs);
  // Per-step skip (footer) is distinct from ending the whole wizard (header).
  const nextLabel = optionalUnfinished ? 'Skip this step' : 'Next';
  const isLastStep = activeStep >= stepLabels.length;

  // Finishing STARTS the 14-day trial, so require the org to be minimally usable
  // first: an explicit AI choice, and at least one connected channel (else no mail
  // can arrive). "Finish later" (header) stays the escape hatch — it doesn't start
  // the trial. The channel requirement is only enforced once we could verify it
  // (channelsKnown), so a failed check never traps the user on this screen.
  // Payment is optional: finishing without a card is a supported outcome (the org
  // keeps its trial), so say so on the button rather than leaving the user
  // wondering whether they're about to skip something they needed.
  const finishLabel =
    showPaymentStep && activeStep === stepLabels.length && !cardAdded
      ? 'Finish without a card'
      : 'Finish setup';

  const missingAiChoice = !aiChoice;
  const missingChannel = channelsKnown && !channelsConnected;
  const readyToFinish = !missingAiChoice && !missingChannel;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-10">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Set up your workspace</h1>
            <p className="text-sm text-muted-foreground">
              A few quick steps. Finish setup to start your 14-day trial.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => setSkipConfirmOpen(true)}>
              Finish later
            </Button>
          </div>
        </div>
        <StepIndicator activeStep={activeStep} labels={stepLabels} />
      </div>

      <div className="space-y-6" style={{ minHeight: '22rem' }}>
        <h2
          ref={stepHeadingRef}
          tabIndex={-1}
          className="text-lg font-medium text-foreground outline-none"
        >
          <span className="sr-only">{`Step ${activeStep} of ${stepLabels.length}: `}</span>
          {STEP_TITLES[activeStep]}
        </h2>

        {activeStep === 1 && <DepartmentsStep />}
        {activeStep === 2 && (
          <AiChoiceStep
            value={aiChoice}
            onChoose={handleChooseAi}
            managedAvailable={managedAiAvailable}
          />
        )}
        {activeStep === 3 && <StorageStep onChoiceChange={handleStorageChoice} />}
        {activeStep === 4 && <ChannelsStep onConnectedChange={handleChannelsConnected} />}
        {activeStep === 5 && <InviteTeamStep />}
        {activeStep === 6 && <KbStep onDocsCountChange={handleKbDocsCount} />}
        {activeStep === 7 && showPaymentStep && selectedPlan && (
          <PaymentStep planName={selectedPlan} onPaidChange={setCardAdded} />
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
          disabled={activeStep === 1}
          onClick={() => goTo((activeStep - 1) as StepNumber)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {!isLastStep ? (
          <Button disabled={nextDisabled} onClick={() => goTo((activeStep + 1) as StepNumber)}>
            {nextLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <div className="flex flex-col items-end gap-1.5">
            {!readyToFinish && (
              <p className="text-right text-xs text-muted-foreground">
                To start your trial, finish setup:{' '}
                {missingAiChoice && (
                  <button
                    type="button"
                    onClick={() => goTo(2)}
                    className="font-medium text-primary underline"
                  >
                    choose how AI works
                  </button>
                )}
                {missingAiChoice && missingChannel && ' and '}
                {missingChannel && (
                  <button
                    type="button"
                    onClick={() => goTo(4)}
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
              onClick={() => void handleFinish()}
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
        description="You'll go to your dashboard. You can configure departments, AI, storage and channels anytime in Settings. Note: this won't start your 14-day trial — complete this setup to start it."
        confirmText="Go to dashboard"
        cancelText="Keep setting up"
        variant="info"
      />
    </div>
  );
};
