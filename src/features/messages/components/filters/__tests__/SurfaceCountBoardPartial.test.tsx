/** The board's header count while a column did not finish: "at least", never an exact number or "No threads". */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SurfaceCount } from '../SurfaceCount';

afterEach(cleanup);

describe('SurfaceCount — board total while a column did not finish', () => {
  it('reads "N+ on this board"', () => {
    const { container } = render(
      <SurfaceCount pagination={{ page: 1, limit: 3, total: 3, totalCapped: true }} isKanban />
    );
    expect(container.textContent).toContain('3+ on this board');
  });

  it('reads "Threads not counted", never "No threads"', () => {
    const { container } = render(
      <SurfaceCount
        pagination={{ page: 1, limit: 0, total: 0, totalCapped: true, countTimedOut: true }}
        isKanban
      />
    );
    expect(container.textContent).toBe('Threads not counted');
  });

  it('CONTROL: a finished board total reads as before', () => {
    const { container } = render(
      <SurfaceCount pagination={{ page: 1, limit: 3, total: 3 }} isKanban />
    );
    expect(container.textContent).toContain('3 on this board');
  });
});
