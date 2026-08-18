import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AiProviderModeSwitch } from '@/components/settings/AiProviderModeSwitch';

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
});
