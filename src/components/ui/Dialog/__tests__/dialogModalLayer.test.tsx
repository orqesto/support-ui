import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useRef, useState } from 'react';
import { Dialog } from '../Dialog';
import { Button } from '../../Button';
import { useModalLayer, openModalLayersForTests } from '@/hooks/useModalLayer';

/**
 * Message detail v4 audit (MED): every open Dialog listened for Escape on the document, so with
 * the merge CONFIRM stacked over the merge PICKER one Escape closed both — the agent lost the
 * picker's search results instead of going back to them. And `aria-modal="true"` promised a
 * modal that nothing enforced: Tab walked out of a phone sheet into the page under its scrim.
 */

afterEach(cleanup);

const Stack = ({ onPickerClose }: { onPickerClose: () => void }) => {
  const [confirmOpen, setConfirmOpen] = useState(true);
  return (
    <>
      <Dialog open onOpenChange={() => onPickerClose()}>
        <p>Picker</p>
        <Button>Choose</Button>
      </Dialog>
      <Dialog open={confirmOpen} onOpenChange={(open) => setConfirmOpen(open)}>
        <p>Confirm</p>
        <Button>Merge</Button>
      </Dialog>
    </>
  );
};

describe('stacked dialogs', () => {
  it('Escape closes only the topmost dialog; the one under it stays until the next Escape', () => {
    const onPickerClose = vi.fn();
    render(<Stack onPickerClose={onPickerClose} />);
    expect(openModalLayersForTests()).toBe(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
    expect(screen.getByText('Picker')).toBeInTheDocument();
    expect(onPickerClose).not.toHaveBeenCalled();
    expect(openModalLayersForTests()).toBe(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onPickerClose).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a lone dialog still closes on Escape', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <p>Alone</p>
      </Dialog>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a parent re-rendering with a fresh onOpenChange does not move its dialog back on top', () => {
    const Rerendering = () => {
      const [count, setCount] = useState(0);
      const [confirmOpen, setConfirmOpen] = useState(true);
      return (
        <>
          <Dialog open onOpenChange={() => setCount((value) => value + 1)}>
            <p>Picker {count}</p>
            <Button onClick={() => setCount((value) => value + 1)}>Rerender</Button>
          </Dialog>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <p>Confirm</p>
          </Dialog>
        </>
      );
    };
    render(<Rerendering />);
    fireEvent.click(screen.getByRole('button', { name: 'Rerender' }));
    expect(screen.getByText('Picker 1')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    // The confirm (opened last) answered, not the re-rendered picker.
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
    expect(screen.getByText('Picker 1')).toBeInTheDocument();
  });
});

describe('a dialog is modal to the keyboard', () => {
  it('takes focus when it opens with focus outside, and Tab wraps inside it', () => {
    render(
      <>
        <Button>Outside</Button>
        <Dialog open onOpenChange={() => undefined} dismissOnOverlayClick={false}>
          <Button>First</Button>
          <Button>Last</Button>
        </Dialog>
      </>
    );
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);

    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Focus that got outside (a script, a click on the page) is brought back on the next Tab.
    screen.getByRole('button', { name: 'Outside' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('does not steal focus a dialog placed itself (an autofocused field)', () => {
    render(
      <Dialog open onOpenChange={() => undefined}>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the case under test */}
        <input aria-label="Name" autoFocus />
      </Dialog>
    );
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
  });

  it('a phone sheet of its own (useModalLayer) holds Tab and lets a layer under it alone', () => {
    const Sheet = () => {
      const ref = useRef<HTMLDivElement>(null);
      useModalLayer(ref, true, { initialFocus: 'first' });
      return (
        <div ref={ref} role="menu">
          <Button role="menuitem">One</Button>
          <Button role="menuitem">Two</Button>
        </div>
      );
    };
    render(
      <>
        <Button>Page</Button>
        <Sheet />
      </>
    );
    const one = screen.getByRole('menuitem', { name: 'One' });
    const two = screen.getByRole('menuitem', { name: 'Two' });
    expect(document.activeElement).toBe(one);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(two);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(one);
  });
});
