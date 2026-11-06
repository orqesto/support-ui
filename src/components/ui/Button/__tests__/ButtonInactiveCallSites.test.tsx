import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Button } from '../Button';
import { Menu, MenuItem } from '@/components/ui/Menu/Menu';
import { Popover } from '@/components/ui/Popover/Popover';
import { ContactProfileActivity } from '@/features/contacts';
import { useModalLayer } from '@/hooks/useModalLayer';

/**
 * A Button out of use is aria-disabled and focusable, never natively disabled (2026-11-03). Code
 * that picked "enabled" controls with `:not([disabled])` must skip it explicitly.
 */
describe('call sites of a Button out of use', () => {
  it('🔴 a menu opens on its first item IN USE, and the arrow keys skip a disabled item', async () => {
    render(
      <Menu ariaLabel="Actions" trigger={({ toggle }) => <Button onClick={toggle}>Open</Button>}>
        <MenuItem disabled onSelect={() => undefined}>
          Off
        </MenuItem>
        <MenuItem onSelect={() => undefined}>On</MenuItem>
        <MenuItem onSelect={() => undefined}>Also on</MenuItem>
      </Menu>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const focused = () => (document.activeElement?.textContent ?? '').trim();
    // The menu focuses its first item on a timer.
    await waitFor(() => expect(focused()).toBe('On'));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(focused()).toBe('Also on');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(focused()).toBe('On'); // wrapped past the disabled "Off"
  });

  it('🔴 a modal layer opening on its first control skips a disabled Button', () => {
    const Sheet = () => {
      const ref = useRef<HTMLDivElement>(null);
      useModalLayer(ref, true, { initialFocus: 'first' });
      return (
        <div ref={ref}>
          <Button disabled>Unavailable</Button>
          <Button>Available</Button>
        </div>
      );
    };
    render(<Sheet />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Available' }));
  });

  it('🔴 a popover opens on its first Button IN USE', () => {
    render(
      <Popover
        open
        onOpenChange={() => undefined}
        ariaLabel="Options"
        width={240}
        trigger={() => <Button>Options</Button>}
      >
        <Button disabled>Unavailable</Button>
        <Button>Available</Button>
      </Popover>
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Available' }));
  });

  it('🔴 an activity item with nothing to open is plain text, not a dimmed Tab stop', () => {
    render(
      <ContactProfileActivity
        activity={[
          { key: 'a', kind: 'note', at: '2026-11-03T10:00:00Z', title: 'Just a note', meta: '' },
          {
            key: 'b',
            kind: 'ticket',
            at: '2026-11-03T09:00:00Z',
            title: 'Open me',
            meta: '',
            onClick: () => undefined,
          },
        ]}
      />
    );
    expect(screen.queryByRole('button', { name: 'Just a note' })).toBeNull();
    expect(screen.getByText('Just a note')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open me' })).not.toBeInactive();
  });
});
