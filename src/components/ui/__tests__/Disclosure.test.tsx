import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Disclosure } from '@/components/ui/Disclosure';

afterEach(cleanup);

const header = () => screen.getByRole('button', { name: /advanced/i });

describe('Disclosure', () => {
  it('starts closed: the summary shows, the content is mounted but not visible', () => {
    render(
      <Disclosure title="Advanced" summary="Billing: stricter than the workspace">
        <input aria-label="threshold" defaultValue="90" />
      </Disclosure>
    );
    expect(screen.getByText('Billing: stricter than the workspace')).toBeVisible();
    expect(screen.getByLabelText('threshold')).not.toBeVisible();
  });

  it('keeps an edited value across close and reopen (children stay mounted)', () => {
    render(
      <Disclosure title="Advanced" summary="s">
        <input aria-label="threshold" defaultValue="90" />
      </Disclosure>
    );
    fireEvent.click(header());
    fireEvent.change(screen.getByLabelText('threshold'), { target: { value: '95' } });
    fireEvent.click(header());
    expect(screen.getByLabelText('threshold')).not.toBeVisible();
    fireEvent.click(header());
    expect(screen.getByLabelText('threshold')).toBeVisible();
    expect(screen.getByLabelText('threshold')).toHaveValue('95');
  });

  it('controlled: open={true} shows the children, open={false} hides them', () => {
    const { rerender } = render(
      <Disclosure title="Advanced" summary="s" open onOpenChange={() => undefined}>
        <p>inside</p>
      </Disclosure>
    );
    expect(screen.getByText('inside')).toBeVisible();
    rerender(
      <Disclosure title="Advanced" summary="s" open={false} onOpenChange={() => undefined}>
        <p>inside</p>
      </Disclosure>
    );
    expect(screen.getByText('inside')).not.toBeVisible();
  });

  it('openOnce opens it, cannot be closed while set, and stays open after it clears', () => {
    const Host = () => {
      const [error, setError] = useState(false);
      return (
        <>
          <button onClick={() => setError((was) => !was)}>toggle error</button>
          <Disclosure title="Advanced" summary="s" openOnce={error}>
            <p>inside</p>
          </Disclosure>
        </>
      );
    };
    render(<Host />);
    expect(screen.getByText('inside')).not.toBeVisible();
    fireEvent.click(screen.getByText('toggle error')); // error set
    expect(screen.getByText('inside')).toBeVisible();
    fireEvent.click(header()); // try to close while the error is set
    expect(screen.getByText('inside')).toBeVisible();
    fireEvent.click(screen.getByText('toggle error')); // error cleared
    expect(screen.getByText('inside')).toBeVisible();
  });
});
