/**
 * F6a: the "Decide in Knowledge Base" address (`?question=` / `?entry=`) and the old
 * `?status=needs_decision&departmentId=` address.
 */
import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import {
  kbPageViewFromSearch,
  kbPageViewIsExplicit,
  kbQuestionFromSearch,
  kbQuestionsTeamFromSearch,
  kbSearchForView,
} from '../kbPageView';
import { ENTRY_DECIDED_TEXT, useKbDecideLink } from '../useKbDecideLink';

const params = (query: string) => new URLSearchParams(query);

describe('the view a decide link opens', () => {
  it('?question= opens Questions, ?entry= opens Live answers, both without waiting for the count', () => {
    expect(kbPageViewFromSearch(params('question=41'), 0)).toBe('questions');
    expect(kbPageViewFromSearch(params('entry=700'), 5)).toBe('live');
    expect(kbPageViewIsExplicit(params('question=41'))).toBe(true);
    expect(kbPageViewIsExplicit(params('entry=700'))).toBe(true);
    expect(kbQuestionFromSearch(params('question=41'))).toBe(41);
    expect(kbQuestionFromSearch(params('question=abc'))).toBeUndefined();
  });

  it('a legacy ?status=needs_decision&departmentId=3 keeps its team on the Questions view', () => {
    const legacy = params('status=needs_decision&departmentId=3');
    expect(kbPageViewFromSearch(legacy, 0)).toBe('questions');
    expect(kbQuestionsTeamFromSearch(legacy)).toBe(3);
    // CONTROL: no team, bad team.
    expect(kbQuestionsTeamFromSearch(params('status=needs_decision'))).toBeUndefined();
    expect(kbQuestionsTeamFromSearch(params('departmentId=0'))).toBeUndefined();
  });

  it("switching view drops the other view's item", () => {
    expect(kbSearchForView(params('view=questions&question=41'), 'live')).not.toContain('question');
    expect(kbSearchForView(params('view=live&entry=7'), 'questions')).not.toContain('entry');
  });
});

const Probe = ({ onAlert }: { onAlert: () => void }) => {
  const location = useLocation();
  const link = useKbDecideLink(onAlert);
  return (
    <div>
      <output data-testid="where">{location.search}</output>
      {link.notice && <p>{link.notice}</p>}
      <button
        type="button"
        onClick={() =>
          link.onNotFound({ open: true, title: 't', description: 'd', variant: 'error' })
        }
      >
        not found
      </button>
    </div>
  );
};

describe('?entry= hands the entry to the drawer deep link', () => {
  it('rewrites ?entry=700 to ?id=700, and an unreadable entry says "Already decided", not an error', async () => {
    let alerts = 0;
    render(
      <MemoryRouter initialEntries={['/knowledge-base?view=live&entry=700']}>
        <Probe onAlert={() => (alerts += 1)} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('id=700'));
    expect(screen.getByTestId('where').textContent).not.toContain('entry=');
    act(() => screen.getByText('not found').click());
    expect(await screen.findByText(ENTRY_DECIDED_TEXT)).toBeInTheDocument();
    expect(alerts).toBe(0);
    // CONTROL: a later unreadable ?id= (not from a link) keeps the error dialog.
    act(() => screen.getByText('not found').click());
    expect(alerts).toBe(1);
  });
});
