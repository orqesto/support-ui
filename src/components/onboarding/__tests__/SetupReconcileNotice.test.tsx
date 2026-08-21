import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SetupReconcileNotice, STEP_TO_SETUP_KEY } from '../SetupReconcileNotice';
import { STEP_LABELS } from '../wizardSteps';
import type { WorkspaceSetupStatus } from '@/services/onboarding.service';

const status = (over: Partial<WorkspaceSetupStatus> = {}): WorkspaceSetupStatus => ({
  steps: [
    { key: 'ai', satisfied: true, detail: '1 AI provider enabled' },
    { key: 'storage', satisfied: false, detail: 'Using default managed storage' },
    { key: 'channels', satisfied: true, detail: '2 channels connected' },
    { key: 'team', satisfied: false, detail: 'Only the workspace owner so far' },
    { key: 'knowledge', satisfied: false, detail: 'Knowledge base is empty' },
  ],
  allSatisfied: false,
  missing: ['storage', 'team', 'knowledge'],
  ...over,
});

describe('SetupReconcileNotice', () => {
  it('shows the evidence for a step that is already configured', () => {
    render(<SetupReconcileNotice setup={status()} activeStep={3} />);
    expect(screen.getByTestId('setup-already-configured')).toBeInTheDocument();
    expect(screen.getByText(/2 channels connected/)).toBeInTheDocument();
  });

  // The banner must never claim credit for work that has not been done — that
  // would talk an admin past a step they still need.
  it('renders nothing for a step that is still outstanding', () => {
    render(<SetupReconcileNotice setup={status()} activeStep={2} />);
    expect(screen.queryByTestId('setup-already-configured')).not.toBeInTheDocument();
  });

  it('renders nothing while the setup check is still in flight', () => {
    render(<SetupReconcileNotice setup={null} activeStep={3} />);
    expect(screen.queryByTestId('setup-already-configured')).not.toBeInTheDocument();
  });

  // Payment is about money, not workspace configuration, and the backend reports
  // no facts for it — so it must never be labelled "already set up".
  it('renders nothing on the payment step', () => {
    render(<SetupReconcileNotice setup={status({ allSatisfied: true })} activeStep={6} />);
    expect(screen.queryByTestId('setup-already-configured')).not.toBeInTheDocument();
  });

  it('renders nothing for a step key the backend did not report', () => {
    render(<SetupReconcileNotice setup={status({ steps: [] })} activeStep={1} />);
    expect(screen.queryByTestId('setup-already-configured')).not.toBeInTheDocument();
  });
});

describe('STEP_TO_SETUP_KEY', () => {
  // Asserted over STEP_LABELS rather than a hand-copied list: adding a core step
  // to the wizard without mapping it here would otherwise silently never show
  // its "already set up" banner.
  it('maps every core wizard step to a setup key', () => {
    STEP_LABELS.forEach((_label, index) => {
      expect(STEP_TO_SETUP_KEY[index + 1]).toBeDefined();
    });
  });

  it('leaves the payment step unmapped', () => {
    expect(STEP_TO_SETUP_KEY[STEP_LABELS.length + 1]).toBeUndefined();
  });
});
