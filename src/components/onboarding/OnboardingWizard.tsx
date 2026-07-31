import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { AiChoiceStep } from './steps/AiChoiceStep';
import { DepartmentsStep } from './steps/DepartmentsStep';
import { InviteTeamStep } from './steps/InviteTeamStep';
import { MailboxStep } from './steps/MailboxStep';
import { RoutingStep } from './steps/RoutingStep';
import { StepIndicator, STEP_LABELS } from './StepIndicator';
import { Button } from '@/components/ui/Button';
import { onboardingService, type OnboardingState } from '@/services/onboarding.service';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { logger } from '@/lib/logger';

type StepNumber = OnboardingState['currentStep'];

const STEP_TITLES: Record<StepNumber, string> = {
  1: 'How should AI features work?',
  2: 'Review your departments',
  3: 'Connect your mailbox',
  4: 'Confirm message routing',
  5: 'Invite your team',
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
  const [activeStep, setActiveStep] = useState<StepNumber>(persisted?.currentStep ?? 1);
  const [aiChoice, setAiChoice] = useState<'managed' | 'byo' | undefined>(persisted?.aiChoice);
  const [mailboxConnected, setMailboxConnected] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const persistStep = (step: StepNumber) => {
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

  const nextDisabled = activeStep === 1 && !aiChoice;
  const nextLabel = activeStep === 3 && !mailboxConnected ? 'Skip for now' : 'Next';

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

        {activeStep === 1 && <AiChoiceStep value={aiChoice} onChoose={handleChooseAi} />}
        {activeStep === 2 && <DepartmentsStep />}
        {activeStep === 3 && <MailboxStep onConnectedChange={setMailboxConnected} />}
        {activeStep === 4 && <RoutingStep />}
        {activeStep === 5 && <InviteTeamStep />}
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
