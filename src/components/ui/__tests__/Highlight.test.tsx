import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Highlight } from '../Highlight';

afterEach(cleanup);

describe('Highlight', () => {
  it('wraps each hit in a mark', () => {
    const { container } = render(
      <Highlight text="Refund for the parcel" terms={['parcel', 'refund']} />
    );
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      'Refund',
      'parcel',
    ]);
    expect(container.textContent).toBe('Refund for the parcel');
  });

  it('shows markup in the text as characters — never as elements', () => {
    const text = '<script>alert(1)</script> <img src=x onerror=alert(2)> invoice';
    const { container } = render(<Highlight text={text} terms={['invoice', 'script']} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe(text);
    expect(container.querySelectorAll('mark').length).toBe(3);
  });

  it('renders plain text when nothing matches (control)', () => {
    const { container } = render(<Highlight text="nothing here" terms={['parcel']} />);
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('nothing here');
  });
});
