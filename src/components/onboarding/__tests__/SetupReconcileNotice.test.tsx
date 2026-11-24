import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SetupReconcileNotice, STEP_TO_SETUP_KEY } from '../SetupReconcileNotice';
import type { WorkspaceSetupStatus } from '@/services/onboarding.service';

const status = (over: Partial<WorkspaceSetupStatus> = {}): WorkspaceSetupStatus => ({
  steps: [
    { key: 'ai', satisfied: true, detail: '1 AI provider enabled' },
    { key: 'database', satisfied: true, detail: 'Running on the managed database' },
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
    render(<SetupReconcileNotice setup={status()} step="channels" />);
    expect(screen.getByTestId('setup-already-configured')).toBeInTheDocument();
    expect(screen.getByText(/2 channels connected/)).toBeInTheDocument();
  });

  // The banner must never claim credit for work that has not been done — that
  // would talk an admin past a step they still need.
  it('renders nothing for a step that is still outstanding', () => {
    render(<SetupReconcileNotice setup={status()} step="people" />);
    expect(screen.queryByTestId('setup-already-configured')).not.toBeInTheDocument();
  });

  it('renders nothing while the setup check is still in flight', () => {
    render(<SetupReconcileNotice setup={null} step="channels" />);
    expect(screen.queryByTestId('setup-already-configured')).not.toBeInTheDocument();
  });

  // Payment is about money, not workspace configuration, and the backend reports
  // no facts for it — so it must never be labelled "already set up".
  it('renders nothing on the payment step', () => {
    render(<SetupReconcileNotice setup={status({ allSatisfied: true })} step="payment" />);
    expect(screen.queryByTestId('setup-already-configured')).not.toBeInTheDocument();
  });

  it('renders nothing for a step key the backend did not report', () => {
    render(<SetupReconcileNotice setup={status({ steps: [] })} step="ai" />);
    expect(screen.queryByTestId('setup-already-configured')).not.toBeInTheDocument();
  });
});

describe('STEP_TO_SETUP_KEY', () => {
  it('maps each wizard step to the setup fact it configures; People is the team', () => {
    expect(STEP_TO_SETUP_KEY).toEqual({
      ai: 'ai',
      database: 'database',
      channels: 'channels',
      people: 'team',
      payment: undefined,
    });
  });
});
