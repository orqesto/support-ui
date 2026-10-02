/**
 * Design-system pieces the message detail v4 changed:
 *  - focusWithoutTooltip hands focus back WITHOUT scrolling the page;
 *  - the Tooltip right-edge clamp keeps the 4 px margin (a tip 2 px past it is shifted);
 *  - ReactSelect chips stay uppercase unless a caller opts into chipCase="sentence";
 *  - AssignmentSelect is a phone bottom sheet only when asked (mobileSheet defaults off).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: () => {} }),
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/services/assignment.service', () => ({
  assignmentService: {
    getAssignableUsers: () => Promise.resolve([]),
    assignMessage: () => Promise.resolve(),
    assignThread: () => Promise.resolve(),
    assignTicket: () => Promise.resolve(),
  },
}));

const { Tooltip, focusWithoutTooltip } = await import('@/components/ui/Tooltip/Tooltip');
const { ReactSelect } = await import('@/components/ui/ReactSelect/ReactSelect');
const { AssignmentSelect } = await import('@/components/admin/AssignmentSelect');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('focusWithoutTooltip', () => {
  it('focuses with preventScroll, so handing focus back never scrolls the page', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    const focus = vi.spyOn(el, 'focus');
    focusWithoutTooltip(el);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    el.remove();
  });
});

describe('Tooltip right-edge clamp', () => {
  const box = (left: number, width: number) =>
    ({
      left,
      right: left + width,
      top: 100,
      bottom: 120,
      width,
      height: 20,
      x: left,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;

  it('a tip just 2 px past the 4 px margin is shifted back to it', async () => {
    const inner = window.innerWidth;
    const tipWidth = 40;
    // Anchor (trigger centre) at inner - 22 → the tip spans inner - 42 … inner - 2.
    const triggerLeft = inner - 27;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.getAttribute('role') === 'tooltip') return box(0, tipWidth);
      if (this.getAttribute('role') === 'presentation') return box(triggerLeft, 10);
      return box(0, 0);
    });
    render(
      <Tooltip content="More actions" side="top" delayDuration={0}>
        <span>More</span>
      </Tooltip>
    );
    fireEvent.mouseEnter(screen.getByText('More').parentElement as HTMLElement);
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
    // Right edge moved from inner - 2 to inner - 4: the anchor shifts 2 px left.
    expect(screen.getByRole('tooltip').style.left).toBe(`${inner - 24}px`);
  });
});

describe('ReactSelect chip case', () => {
  const options = [{ value: 'open', label: 'Open' }];
  const control = (container: HTMLElement) =>
    container.querySelector('[class*="cursor-pointer"][class*="inline-flex"]') as HTMLElement;

  it('a chip is uppercase by default', () => {
    const { container } = render(
      <ReactSelect variant="chip" value="open" onChange={() => {}} options={options} />
    );
    expect(control(container)).toHaveClass('uppercase');
    expect(control(container)).not.toHaveClass('normal-case');
  });

  it('CONTROL: chipCase="sentence" opts out', () => {
    const { container } = render(
      <ReactSelect
        variant="chip"
        chipCase="sentence"
        value="open"
        onChange={() => {}}
        options={options}
      />
    );
    expect(control(container)).toHaveClass('normal-case');
    expect(control(container)).not.toHaveClass('uppercase');
  });
});

describe('AssignmentSelect mobileSheet', () => {
  const openMenu = (container: HTMLElement) => {
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown', keyCode: 40 });
  };

  it('off by default: opening the menu draws no phone sheet scrim', async () => {
    const { container } = render(<AssignmentSelect type="ticket" itemId={1} variant="value" />);
    await act(() => Promise.resolve());
    openMenu(container);
    // CONTROL for the absence below: the menu really is open.
    await waitFor(() => expect(document.querySelector('[id*="-option-"]')).not.toBeNull());
    expect(screen.queryByTestId('select-sheet-scrim')).toBeNull();
  });

  it('CONTROL: mobileSheet draws the scrim', async () => {
    const { container } = render(
      <AssignmentSelect type="ticket" itemId={1} variant="value" mobileSheet />
    );
    await act(() => Promise.resolve());
    openMenu(container);
    expect(await screen.findByTestId('select-sheet-scrim')).toBeInTheDocument();
  });
});
