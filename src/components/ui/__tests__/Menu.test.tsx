import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';

const renderMenu = (onPick = vi.fn()) => {
  render(
    <div>
      <span>outside</span>
      <Menu
        ariaLabel="Row actions"
        trigger={({ open, toggle }) => (
          <Button aria-expanded={open} onClick={toggle}>
            More
          </Button>
        )}
      >
        <MenuLabel>Actions</MenuLabel>
        <MenuItem onSelect={onPick}>Open</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={vi.fn()} checked>
          Pinned
        </MenuItem>
      </Menu>
    </div>
  );
  return onPick;
};

describe('Menu', () => {
  it('is closed until its trigger is clicked', () => {
    renderMenu();
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu', { name: 'Row actions' })).toBeInTheDocument();
  });

  it('runs an item and closes', () => {
    const onPick = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape and on a click outside', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('can be used from the keyboard: focus moves in, arrows move, Escape returns to the trigger', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'More' });
    fireEvent.click(trigger);
    await vi.waitFor(() => expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Open' }), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitemcheckbox', { name: 'Pinned' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menuitemcheckbox', { name: 'Pinned' }), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  it('marks a checked item for assistive tech', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Pinned' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });
});
