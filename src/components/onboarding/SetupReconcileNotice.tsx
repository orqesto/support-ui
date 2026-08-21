import { CheckCircle2 } from 'lucide-react';
import type { SetupStepKey, WorkspaceSetupStatus } from '@/services/onboarding.service';

/** Wizard step number → the setup step it configures. Payment (6) has no facts. */
export const STEP_TO_SETUP_KEY: Record<number, SetupStepKey | undefined> = {
  1: 'ai',
  2: 'storage',
  3: 'channels',
  4: 'team',
  5: 'knowledge',
  6: undefined,
};

type Props = {
  setup: WorkspaceSetupStatus | null;
  activeStep: number;
};

/**
 * "You already did this" banner shown above a wizard step whose configuration
 * exists already.
 *
 * Workspaces are often provisioned by hand — the admin sets up AI, channels and
 * the rest directly in Settings — and the wizard used to show every step as if
 * nothing had been done. Surfacing the evidence inline (`2 channels connected`)
 * is what turns the step from a chore into a confirmation.
 *
 * Renders nothing when the step is genuinely outstanding, so it never adds noise
 * to a real setup run.
 */
export const SetupReconcileNotice = ({ setup, activeStep }: Props) => {
  const key = STEP_TO_SETUP_KEY[activeStep];
  const step = key ? setup?.steps.find((candidate) => candidate.key === key) : undefined;
  if (!step?.satisfied) return null;

  return (
    <div
      className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
      data-testid="setup-already-configured"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-foreground">
        <span className="font-medium">Already set up.</span>{' '}
        <span className="text-muted-foreground">{step.detail}. You can move on, or change it here.</span>
      </p>
    </div>
  );
};
