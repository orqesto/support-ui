import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { AiChoiceStep } from './steps/AiChoiceStep';
import { ChannelsStep } from './steps/ChannelsStep';
import { DepartmentsStep } from './steps/DepartmentsStep';
import { InviteTeamStep } from './steps/InviteTeamStep';
import { RoutingStep } from './steps/RoutingStep';
import { StorageStep } from './steps/StorageStep';
import { StepIndicator, STEP_LABELS } from './StepIndicator';
import { Button } from '@/components/ui/Button';
import { onboardingService, type OnboardingState } from '@/services/onboarding.service';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { logger } from '@/lib/logger';

type StepNumber = OnboardingState['currentStep'];

const STEP_TITLES: Record<StepNumber, string> = {
  1: 'Review your departments',
  2: 'How should AI features work?',
  3: 'Where should files be stored?',
  4: 'Connect your message channels',
  5: 'Confirm message routing',
  6: 'Invite your team',
};

/**
 * Wizard shell: step state + navigation. Progress persists via fire-and-forget
 * PATCHes (resume point survives reloads); Finish stamps completion and starts
 * the 14-day trial clock; Skip keeps the original org-creation expiry.
 */
export const OnboardingWizard = () => {
  const navigate = useNavigate();
  const persisted = useOnboardingStore((state) => state.onboarding);
  const markComplete = useOnboardingStore((state) => state.markComplete);
  const refreshOnboarding = useOnboardingStore((state) => state.refresh);
  const [activeStep, setActiveStep] = useState<StepNumber>(persisted?.currentStep ?? 1);
  const [aiChoice, setAiChoice] = useState<'managed' | 'byo' | undefined>(persisted?.aiChoice);
  const [channelsConnected, setChannelsConnected] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const persistStep = (step: StepNumber) => {
    // Fire-and-forget: a 409 here just means the wizard was already finished/skipped
    // (e.g. this step-change raced a complete) — benign, log only, never surface it.
    onboardingService.updateProgress({ currentStep: step }).catch((error: unknown) => {
      logger.error('Failed to persist onboarding step:', error);
    });
  };

  const goTo = (step: StepNumber) => {
    setActiveStep(step);
    persistStep(step);
  };

  const handleChooseAi = (choice: 'managed' | 'byo') => {
    setAiChoice(choice);
    onboardingService.updateProgress({ aiChoice: choice }).catch((error: unknown) => {
      logger.error('Failed to persist AI choice:', error);
    });
  };

  const leaveWizard = () => {
    markComplete();
    // Pull the fresh trial dates (completion restamped the clock) so the banner
    // shows the new countdown without a full reload.
    void refreshOnboarding();
    navigate('/dashboard', { replace: true });
  };

  const handleSkip = async () => {
    try {
      await onboardingService.skip();
    } catch (error) {
      logger.error('Failed to skip onboarding:', error);
    }
    leaveWizard();
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await onboardingService.complete();
    } catch (error) {
      logger.error('Failed to complete onboarding:', error);
    } finally {
      setFinishing(false);
    }
    leaveWizard();
  };

  // Only the AI step (2) blocks Next until a choice is made. Storage (3) and
  // channels (4) are optional — the client can skip and set them up later.
  const nextDisabled = activeStep === 2 && !aiChoice;
  const optionalUnfinished =
    activeStep === 3 || (activeStep === 4 && !channelsConnected);
  const nextLabel = optionalUnfinished ? 'Skip for now' : 'Next';

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-10">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Set up your workspace</h1>
            <p className="text-sm text-muted-foreground">
              A few quick steps — your 14-day trial starts when you finish.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void handleSkip()}>
            Skip setup
          </Button>
        </div>
        <StepIndicator activeStep={activeStep} />
      </div>

      <div className="space-y-6">
        <h2 className="text-lg font-medium text-foreground">{STEP_TITLES[activeStep]}</h2>

        {activeStep === 1 && <DepartmentsStep />}
        {activeStep === 2 && <AiChoiceStep value={aiChoice} onChoose={handleChooseAi} />}
        {activeStep === 3 && <StorageStep />}
        {activeStep === 4 && <ChannelsStep onConnectedChange={setChannelsConnected} />}
        {activeStep === 5 && <RoutingStep />}
        {activeStep === 6 && <InviteTeamStep />}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-6">
        <Button
          variant="outline"
          disabled={activeStep === 1}
          onClick={() => goTo((activeStep - 1) as StepNumber)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {activeStep < STEP_LABELS.length ? (
          <Button disabled={nextDisabled} onClick={() => goTo((activeStep + 1) as StepNumber)}>
            {nextLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button isLoading={finishing} onClick={() => void handleFinish()}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Finish setup
          </Button>
        )}
      </div>
    </div>
  );
};
