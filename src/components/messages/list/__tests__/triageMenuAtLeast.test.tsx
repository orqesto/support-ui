/**
 * Capped searched scope: the backend omits a lane its sample held none of ("not counted"). The
 * Triage pill summed the lanes and went blank when any one was absent (release review, 2nd round).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriageMenu } from '../ThreadViews';

const pill = () => screen.getByRole('button', { name: /Triage/ });

describe('TriageMenu total', () => {
  it('🔴 counts "at least": an absent lane does not blank the total', () => {
    render(
      <TriageMenu
        active={null}
        counts={{ not_analysed: { atLeast: 40 }, spam: 3 }}
        countsAtLeast
        arrivals={{}}
        onSelect={vi.fn()}
      />
    );
    expect(pill().textContent).toContain('43+');
  });

  it('[control] exact counts with a lane unknown (older backend): no total, as before', () => {
    render(
      <TriageMenu
        active={null}
        counts={{ not_analysed: 40, spam: 3 }}
        arrivals={{}}
        onSelect={vi.fn()}
      />
    );
    expect(pill().textContent).not.toMatch(/43/);
  });
});
