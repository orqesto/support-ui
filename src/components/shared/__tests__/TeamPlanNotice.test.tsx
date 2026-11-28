import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TeamPlanNotice } from '../TeamPlanNotice';
import type { TeamPlan } from '@/services/department.service';

afterEach(cleanup);
const renderNotice = (teamPlan?: TeamPlan | null, showTeamsLink = false) =>
  render(
    <MemoryRouter>
      <TeamPlanNotice teamPlan={teamPlan ?? undefined} showTeamsLink={showTeamsLink} />
    </MemoryRouter>
  );

describe('TeamPlanNotice', () => {
  it('singular limit', () => {
    renderNotice({ activeTeams: 2, teamLimit: 1, overLimit: true });
    expect(screen.getByTestId('team-plan-notice')).toHaveTextContent(
      'Your plan allows 1 team; 2 are on. Upgrade or switch some off.'
    );
    expect(screen.getByRole('link', { name: 'Upgrade plan' })).toHaveAttribute('href', '/pricing');
    expect(screen.queryByRole('link', { name: 'Manage teams' })).toBeNull();
  });
  it('plural limit, with the Teams link on the dashboard', () => {
    renderNotice({ activeTeams: 4, teamLimit: 3, overLimit: true }, true);
    expect(screen.getByTestId('team-plan-notice')).toHaveTextContent(
      'Your plan allows 3 teams; 4 are on. Upgrade or switch some off.'
    );
    expect(screen.getByRole('link', { name: 'Manage teams' })).toHaveAttribute(
      'href',
      '/settings?tab=teams'
    );
  });
  it.each([
    ['within limit', { activeTeams: 1, teamLimit: 1, overLimit: false }],
    ['missing', undefined],
    ['null', null],
  ])('shows nothing when %s', (_name, plan) => {
    const { container } = renderNotice(plan as TeamPlan | null | undefined);
    expect(container).toBeEmptyDOMElement();
  });
});
