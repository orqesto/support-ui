import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

let flags: Record<string, boolean> = {};
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    flags,
    loading: false,
    canPreviewUnfinished: true,
    isSurfaceEnabled: (key: string) => flags[key] === true,
    isSurfaceVisibleToMe: () => true,
    isPreviewing: () => false,
  }),
}));
vi.mock('@/features/settings', () => ({ NewTeamBuilder: () => <p>builder</p> }));

const { NewTeamPage } = await import('../NewTeamPage');

describe('NewTeamPage', () => {
  it('with ui.team_builder off, a global admin sees the unavailable state', () => {
    flags = {};
    render(
      <MemoryRouter>
        <NewTeamPage />
      </MemoryRouter>
    );
    expect(screen.queryByText('builder')).toBeNull();
    expect(screen.getByText(/New team/)).toBeTruthy();
  });

  it('with the flag on it shows the builder', () => {
    flags = { 'ui.team_builder': true };
    render(
      <MemoryRouter>
        <NewTeamPage />
      </MemoryRouter>
    );
    expect(screen.getByText('builder')).toBeTruthy();
  });
});
