/**
 * `ui/Checkbox` — added for the D42 consent tick, and therefore worth its own suite: a shared
 * control with no direct tests is one whose behaviour is only ever asserted incidentally, by
 * whichever screen happened to use it first. Audit pass 3.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '../Checkbox';

describe('Checkbox', () => {
  it('associates its label, so clicking the words toggles the box', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="I understand what is sent" onChange={onChange} />);

    // ⛔ RED: render the label as a sibling <span> with no htmlFor and this click does nothing —
    // on a consent control, where the words are the part people actually click.
    await user.click(screen.getByText('I understand what is sent'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('generates a distinct id per instance, so two on one page do not toggle together', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <Checkbox label="First" onChange={first} />
        <Checkbox label="Second" onChange={second} />
      </>
    );
    // RED: hardcode the id and both labels point at the same input — clicking one ticks the other.
    await user.click(screen.getByText('Second'));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('marks itself invalid and describes the error when one is given', () => {
    render(<Checkbox label="Accept" error="You have to accept this to continue" />);
    const box = screen.getByRole('checkbox');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    const describedBy = box.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toContain(
      'You have to accept this to continue'
    );
  });

  it('is silent when there is no error — no empty node, no stray aria', () => {
    // POSITIVE CONTROL for the test above: without this, an implementation that always sets
    // aria-invalid would pass it.
    render(<Checkbox label="Accept" />);
    const box = screen.getByRole('checkbox');
    expect(box.getAttribute('aria-invalid')).toBeNull();
    expect(box.getAttribute('aria-describedby')).toBeNull();
  });

  it('does not fire while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Accept" disabled onChange={onChange} />);
    await user.click(screen.getByText('Accept'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
