import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AiProviderModeSwitch, modeSwitchErrorText } from '@/components/settings/AiProviderModeSwitch';

afterEach(cleanup);

const managedCard = () => screen.getByText('Use our AI').closest('button');
const byoCard = () => screen.getByText('Bring your own keys').closest('button');

describe('AiProviderModeSwitch', () => {
  it('offers no way to pick managed when the platform has no managed key', () => {
    const onSelect = vi.fn();
    render(
      <AiProviderModeSwitch mode="byo" managedAvailable={false} saving={false} onSelect={onSelect} />
    );

    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    // The managed card must not be a button at all — there is nothing to click, so no
    // request can be sent that the backend would have to 403.
    expect(managedCard()).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('lets an entitled workspace select managed', () => {
    const onSelect = vi.fn();
    render(
      <AiProviderModeSwitch mode="byo" managedAvailable={true} saving={false} onSelect={onSelect} />
    );

    // Control: with managed available the "coming soon" affordance is gone...
    expect(screen.queryByText('Coming soon')).toBeNull();
    // ...and the card is live.
    const card = managedCard();
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    expect(onSelect).toHaveBeenCalledWith('managed');
  });

  it('marks the active mode with aria-pressed and leaves the other unpressed', () => {
    render(
      <AiProviderModeSwitch
        mode="managed"
        managedAvailable={true}
        saving={false}
        onSelect={vi.fn()}
      />
    );

    expect(managedCard()).toHaveAttribute('aria-pressed', 'true');
    expect(byoCard()).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables both cards while a switch is in flight', () => {
    const onSelect = vi.fn();
    render(
      <AiProviderModeSwitch mode="byo" managedAvailable={true} saving={true} onSelect={onSelect} />
    );

    expect(managedCard()).toBeDisabled();
    expect(byoCard()).toBeDisabled();

    fireEvent.click(managedCard()!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders nothing as selected while the mode is still loading', () => {
    render(
      <AiProviderModeSwitch
        mode={undefined}
        managedAvailable={true}
        saving={false}
        onSelect={vi.fn()}
      />
    );

    expect(managedCard()).toHaveAttribute('aria-pressed', 'false');
    expect(byoCard()).toHaveAttribute('aria-pressed', 'false');
  });

  describe('Free starter allowance (Free stays on our AI after the trial)', () => {
    const allowance = (remaining: number) => ({
      totalMicros: 400_000,
      usedMicros: 400_000 - remaining,
      remainingMicros: remaining,
      exhausted: remaining <= 0,
      microsPerMessage: 4_000,
    });

    it('allowance left on own key: "Use our AI" can be switched back on, and says what it runs on', () => {
      const onSelect = vi.fn();
      render(
        <AiProviderModeSwitch
          mode="byo"
          managedAvailable={true}
          saving={false}
          onSelect={onSelect}
          starter={allowance(252_000)}
        />
      );
      expect(screen.getByText(/one-time starter allowance on us/)).toBeInTheDocument();
      expect(screen.getByText(/about 63 of 100 messages left/)).toBeInTheDocument();
      fireEvent.click(managedCard()!);
      expect(onSelect).toHaveBeenCalledWith('managed');
    });

    it('used up on own key: the card says why and cannot be picked', () => {
      const onSelect = vi.fn();
      render(
        <AiProviderModeSwitch
          mode="byo"
          managedAvailable={true}
          saving={false}
          onSelect={onSelect}
          starter={allowance(0)}
        />
      );
      expect(screen.getByTestId('managed-ai-starter-used')).toHaveTextContent(
        /free AI allowance is used/
      );
      expect(managedCard()).toBeNull();
      expect(byoCard()).not.toBeNull();
    });

    it('used up while on our AI: the active card stays (the banner explains the pause)', () => {
      render(
        <AiProviderModeSwitch
          mode="managed"
          managedAvailable={true}
          saving={false}
          onSelect={vi.fn()}
          starter={allowance(0)}
        />
      );
      expect(managedCard()).not.toBeNull();
    });

    it('paid plan / older backend (no allowance): the plan wording', () => {
      render(
        <AiProviderModeSwitch mode="byo" managedAvailable={true} saving={false} onSelect={vi.fn()} />
      );
      expect(screen.getByText(/Included in your plan/)).toBeInTheDocument();
    });
  });
});

describe('modeSwitchErrorText (review finding 5)', () => {
  it('"allowance is used" only for the FREE_AI_ALLOWANCE_USED code', () => {
    expect(modeSwitchErrorText('FREE_AI_ALLOWANCE_USED', undefined)).toMatch(
      /free AI allowance is used/
    );
  });

  it('a generic not-entitled refusal (also a failed allowance read) keeps the generic text', () => {
    const text = modeSwitchErrorText('managed_ai_not_entitled', undefined);
    expect(text).toMatch(/not available on your current plan/);
    expect(text).not.toMatch(/allowance/);
  });

  it('unknown codes fall back to the server message', () => {
    expect(modeSwitchErrorText('something_else', 'Server says no.')).toBe('Server says no.');
    expect(modeSwitchErrorText(undefined, undefined)).toBe('Failed to change AI mode.');
  });
});
