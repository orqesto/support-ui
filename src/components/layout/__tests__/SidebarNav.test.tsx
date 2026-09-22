import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, NavLink } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { useSidebarStore } from '@/stores/sidebarStore';
import { NavTip, SidebarCollapseToggle } from '../SidebarNav';

const renderNav = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <SidebarCollapseToggle />
      <NavTip label="Messages">
        <NavLink to="/messages" data-testid="link">
          icon
        </NavLink>
      </NavTip>
    </MemoryRouter>
  );

describe('collapsible sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
    useSidebarStore.setState({ collapsed: false });
  });
  afterEach(cleanup);

  it('toggle flips the shared state, persists it, and relabels itself', () => {
    renderNav();
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(useSidebarStore.getState().collapsed).toBe(true);
    expect(localStorage.getItem('sidebar-collapsed')).toContain('"collapsed":true');
    const expand = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(expand.getAttribute('aria-expanded')).toBe('false');
  });

  it('expanded: no tooltip wrapper around nav links', () => {
    renderNav();
    expect(screen.getByTestId('link').parentElement?.getAttribute('role')).not.toBe('presentation');
  });

  it('collapsed: hovering a nav link shows its label as a tooltip', async () => {
    useSidebarStore.setState({ collapsed: true });
    renderNav();
    const link = screen.getByTestId('link');
    expect(link.parentElement?.className).toContain('w-full');
    fireEvent.mouseEnter(link.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Messages');
  });
});
