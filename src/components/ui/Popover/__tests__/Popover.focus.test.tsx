import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Button } from '@/components/ui/Button';
import { Popover } from '../Popover';

/**
 * Opening a popover moves the focus into its panel (it is portalled to the end of <body>, so Tab
 * from the trigger never reaches it). A browser will not focus an element under
 * `visibility: hidden`, and the panel is hidden until it has been placed. jsdom focuses it anyway,
 * so this stand-in does what the browser does: a focus call on a hidden panel's content is a no-op.
 * Until 2026-11-16 the focus was moved before the panel was placed, and it stayed on the trigger.
 */

type Focus = (this: HTMLElement, options?: FocusOptions) => void;
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- jsdom always defines it
const realFocus = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus')!.value as Focus;
const hiddenByPanel = (el: HTMLElement) => {
  const panel = el.closest<HTMLElement>('[role="dialog"]');
  return panel?.style.visibility === 'hidden';
};

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

const Harness = () => {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      ariaLabel="Period"
      width={200}
      trigger={({ toggle }) => <Button onClick={toggle}>30 days</Button>}
    >
      <Button>7 days</Button>
      <Button>90 days</Button>
    </Popover>
  );
};

describe('Popover — focus on open', () => {
  it('moves the focus to the first choice once the panel is visible, as a browser allows', async () => {
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions
    ) {
      if (hiddenByPanel(this)) return;
      realFocus.call(this, options);
    });
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '30 days' });
    realFocus.call(trigger);
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('button', { name: '7 days' })).toHaveFocus());
  });

  it('CONTROL: without the hidden-element rule the focus lands in the panel too', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '7 days' })).toHaveFocus());
  });
});
