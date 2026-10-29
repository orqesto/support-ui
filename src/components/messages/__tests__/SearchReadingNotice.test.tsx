/** The list SAYS when a search bound bit — never a partial or rephrased answer passed off as whole. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchReadingNotice } from '../SearchReadingNotice';

afterEach(cleanup);

describe('SearchReadingNotice', () => {
  it('warns that results may be incomplete when search inside words was cut short', () => {
    render(
      <SearchReadingNotice
        reading={{
          terms: ['nvoic'],
          asPhrase: false,
          cutShort: ['nvoic'],
          timedOut: false,
          rankedWithin: null,
        }}
      />
    );
    expect(screen.getByText(/Results may be incomplete/)).toBeTruthy();
    expect(screen.getByText(/“nvoic”/)).toBeTruthy();
  });

  it('says a long search was matched as one phrase', () => {
    render(
      <SearchReadingNotice
        reading={{
          terms: ['a b c'],
          asPhrase: true,
          cutShort: [],
          timedOut: false,
          rankedWithin: null,
        }}
      />
    );
    expect(screen.getByText(/Searched as one exact phrase/)).toBeTruthy();
    expect(screen.queryByText(/Results may be incomplete/)).toBeNull();
  });

  it('a search that ran out of time says so — never reads as "no match"', () => {
    render(
      <SearchReadingNotice
        reading={{
          terms: ['the'],
          asPhrase: false,
          cutShort: [],
          timedOut: true,
          rankedWithin: null,
        }}
      />
    );
    expect(screen.getByText(/This search took too long/)).toBeTruthy();
    expect(screen.getByText(/does not mean nothing matches/)).toBeTruthy();
  });

  it('a plain list that ran out of time says so', () => {
    render(<SearchReadingNotice reading={null} listTimedOut />);
    expect(screen.getByText(/This list took too long to load/)).toBeTruthy();
  });

  it('says the best matches were ranked among the newest N only', () => {
    render(
      <SearchReadingNotice
        reading={{
          terms: ['you'],
          asPhrase: false,
          cutShort: [],
          timedOut: false,
          rankedWithin: 500,
        }}
      />
    );
    expect(screen.getByText(/best matches are shown first among the newest 500/)).toBeTruthy();
  });

  it('CONTROL: says nothing for an ordinary search, or no reading', () => {
    const { container } = render(
      <SearchReadingNotice
        reading={{
          terms: ['invoice'],
          asPhrase: false,
          cutShort: [],
          timedOut: false,
          rankedWithin: null,
        }}
      />
    );
    expect(container.textContent).toBe('');
    cleanup();
    expect(render(<SearchReadingNotice reading={null} />).container.textContent).toBe('');
  });
});
