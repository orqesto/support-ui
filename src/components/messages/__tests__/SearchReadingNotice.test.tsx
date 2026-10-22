/** The list SAYS when a search bound bit — never a partial or rephrased answer passed off as whole. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchReadingNotice } from '../SearchReadingNotice';

afterEach(cleanup);

describe('SearchReadingNotice', () => {
  it('warns that results may be incomplete when search inside words was cut short', () => {
    render(
      <SearchReadingNotice reading={{ terms: ['nvoic'], asPhrase: false, cutShort: ['nvoic'] }} />
    );
    expect(screen.getByText(/Results may be incomplete/)).toBeTruthy();
    expect(screen.getByText(/“nvoic”/)).toBeTruthy();
  });

  it('says a long search was matched as one phrase', () => {
    render(<SearchReadingNotice reading={{ terms: ['a b c'], asPhrase: true, cutShort: [] }} />);
    expect(screen.getByText(/Searched as one exact phrase/)).toBeTruthy();
    expect(screen.queryByText(/Results may be incomplete/)).toBeNull();
  });

  it('CONTROL: says nothing for an ordinary search, or no reading', () => {
    const { container } = render(
      <SearchReadingNotice reading={{ terms: ['invoice'], asPhrase: false, cutShort: [] }} />
    );
    expect(container.textContent).toBe('');
    cleanup();
    expect(render(<SearchReadingNotice reading={null} />).container.textContent).toBe('');
  });
});
