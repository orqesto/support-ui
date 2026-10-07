import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Select, SELECT_SIZES, SEARCHABLE_FROM } from '@/components/ui/Select';
import { inputVariants } from '@/components/ui/Input/input.styles';
import { chooseOption, listOptions } from '@/test/chooseOption';
import { Dialog, DialogContent } from '@/components/ui/Dialog';

afterEach(cleanup);

const opts = (count: number) =>
  Array.from({ length: count }, (_unused, index) => ({ value: `v${index}`, label: `Option ${index}` }));

const renderIn = (ui: React.ReactElement) => render(ui);

describe('Select — one component for every dropdown', () => {
  it('sizes match Input exactly (sm 32 / md 40 / lg 48px, same padding and text)', () => {
    // Input's classes are the reference; a drift on either side fails here.
    const rem = { 'h-8': '2rem', 'h-10': '2.5rem', 'h-12': '3rem', 'px-2': '0.5rem', 'px-3': '0.75rem', 'px-4': '1rem', 'text-xs': '0.75rem', 'text-sm': '0.875rem', 'text-base': '1rem' } as const;
    for (const size of ['sm', 'md', 'lg'] as const) {
      const classes = inputVariants({ size }).split(' ');
      const pick = (prefix: string) => rem[classes.find((cls) => cls.startsWith(prefix) && cls in rem) as keyof typeof rem];
      expect(SELECT_SIZES[size]).toEqual({ height: pick('h-'), paddingX: pick('px-'), fontSize: pick('text-') });
    }
  });

  it('defaults to md: the control is 40px tall', () => {
    renderIn(<Select aria-label="Pick" options={opts(2)} value="v0" onChange={() => {}} />);
    const control = screen.getByRole('combobox', { name: 'Pick' }).closest('[class*="control"]') as HTMLElement;
    expect(control.style.height || getComputedStyle(control).height).toBe('2.5rem');
  });

  it('single: picking an option reports its value', async () => {
    const onChange = vi.fn();
    renderIn(<Select label="Department" options={opts(3)} value="v0" onChange={onChange} />);
    await chooseOption(screen.getByLabelText('Department'), 'Option 2');
    expect(onChange).toHaveBeenCalledWith('v2');
  });

  it('multi: ticks accumulate, the menu stays open, and the value is a string[]', async () => {
    const Harness = () => {
      const [value, setValue] = useState<string[]>([]);
      return (
        <>
          <Select multi label="Labels" options={opts(3)} value={value} onChange={setValue} />
          <output data-testid="value">{value.join(',')}</output>
        </>
      );
    };
    renderIn(<Harness />);
    const control = screen.getByLabelText('Labels');
    await chooseOption(control, 'Option 0');
    // Still open: the next option is clickable without reopening.
    fireEvent.click(await screen.findByRole('option', { name: 'Option 2' }));
    expect(screen.getByTestId('value').textContent).toBe('v0,v2');
  });

  it(`search turns on by itself at ${SEARCHABLE_FROM} options, and the caller can override`, () => {
    const { rerender } = renderIn(<Select aria-label="Short" options={opts(SEARCHABLE_FROM - 1)} />);
    // react-select renders a dummy input (aria-readonly, inputMode none) when not searchable.
    const searchable = () => screen.getByRole('combobox', { name: 'Short' }).getAttribute('aria-readonly') !== 'true';
    expect(searchable()).toBe(false);
    rerender(<Select aria-label="Short" options={opts(SEARCHABLE_FROM)} />);
    expect(searchable()).toBe(true);
    rerender(<Select aria-label="Short" searchable={false} options={opts(SEARCHABLE_FROM)} />);
    expect(searchable()).toBe(false);
  });

  it('keyboard: ArrowDown opens, Enter picks the focused option, Escape closes', async () => {
    const onChange = vi.fn();
    renderIn(<Select aria-label="Kb" options={opts(3)} value="v0" onChange={onChange} />);
    const control = screen.getByRole('combobox', { name: 'Kb' });
    control.focus();
    fireEvent.keyDown(control, { key: 'ArrowDown', keyCode: 40 });
    expect(await screen.findAllByRole('option')).toHaveLength(3);
    fireEvent.keyDown(control, { key: 'ArrowDown', keyCode: 40 });
    fireEvent.keyDown(control, { key: 'Enter', keyCode: 13 });
    expect(onChange).toHaveBeenCalledWith('v1');
    fireEvent.keyDown(control, { key: 'ArrowDown', keyCode: 40 });
    fireEvent.keyDown(control, { key: 'Escape', keyCode: 27 });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('disabled: the combobox is disabled', () => {
    renderIn(<Select aria-label="Off" disabled options={opts(3)} />);
    expect(screen.getByRole('combobox', { name: 'Off' })).toBeDisabled();
  });

  it('error replaces hint and is announced; hint shows otherwise', () => {
    const { rerender } = renderIn(<Select label="Plan" hint="Pick one" options={opts(2)} />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    rerender(<Select label="Plan" hint="Pick one" error="Required" options={opts(2)} />);
    expect(screen.getByRole('alert').textContent).toBe('Required');
    expect(screen.queryByText('Pick one')).toBeNull();
  });

  it('default variant: the menu shows menuLabel, the control shows label', async () => {
    render(<Select aria-label="Ml" value="a" options={[{ value: 'a', label: 'Acme', menuLabel: 'Acme — 3 workspaces' }]} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(await listOptions(screen.getByRole('combobox', { name: 'Ml' }))).toEqual(['Acme — 3 workspaces']);
  });

  it('clearable: the × empties a single select to \'\'; without it there is no ×', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<Select aria-label="Cl" clearable options={opts(2)} value="v1" onChange={onChange} />);
    fireEvent.mouseDown(container.querySelector('.select__clear-indicator') as HTMLElement, { button: 0 });
    expect(onChange).toHaveBeenCalledWith('');
    rerender(<Select aria-label="Cl" options={opts(2)} value="v1" onChange={onChange} />);
    expect(container.querySelector('.select__clear-indicator')).toBeNull();
  });

  it('a server-searched picker stays typeable when its options shrink below the threshold', () => {
    const Server = () => {
      const [query, setQuery] = useState('');
      const all = opts(10);
      const shown = query ? all.filter((opt) => opt.label.includes(query)) : all;
      return <Select aria-label="Users" options={shown} filterOption={null} onInputChange={(text) => setQuery(text)} />;
    };
    render(<Server />);
    const box = screen.getByRole('combobox', { name: 'Users' });
    fireEvent.change(box, { target: { value: 'Option 1' } });
    expect(screen.getByRole('combobox', { name: 'Users' }).getAttribute('aria-readonly')).not.toBe('true');
    expect(screen.getByRole<HTMLInputElement>('combobox', { name: 'Users' }).value).toBe('Option 1');
  });

  it('inside a Dialog: Escape closes the open menu only; a second Escape closes the dialog', async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <Select aria-label="InDialog" options={opts(3)} />
        </DialogContent>
      </Dialog>
    );
    const control = screen.getByRole('combobox', { name: 'InDialog' });
    control.focus();
    fireEvent.keyDown(control, { key: 'ArrowDown', keyCode: 40 });
    expect(await screen.findAllByRole('option')).toHaveLength(3);
    fireEvent.keyDown(control, { key: 'Escape', keyCode: 27 });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(control, { key: 'Escape', keyCode: 27 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('multi keeps values the list does not offer when another is ticked', async () => {
    const onChange = vi.fn();
    render(<Select multi aria-label="Keep" options={opts(2)} value={['ghost', 'v0']} onChange={onChange} />);
    await chooseOption(screen.getByRole('combobox', { name: 'Keep' }), 'Option 1');
    expect(onChange).toHaveBeenCalledWith(['ghost', 'v0', 'v1']);
  });

  it('chip + multi does not crash and behaves as single; chip label becomes the accessible name', async () => {
    const onChange = vi.fn();
    render(<Select variant="chip" multi label="Status" options={opts(2)} value={[]} onChange={onChange as (value: string[]) => void} />);
    await chooseOption(screen.getByRole('combobox', { name: 'Status' }), 'Option 1');
    expect(onChange).toHaveBeenCalledWith('v1');
  });

  it('no × when the empty option ("All") is the one selected', () => {
    const { container } = render(<Select aria-label="All" clearable options={[{ value: '', label: 'All' }, ...opts(2)]} value="" />);
    expect(container.querySelector('.select__clear-indicator')).toBeNull();
  });

  it('listOptions returns the menu texts', async () => {
    renderIn(<Select aria-label="List" options={opts(2)} />);
    expect(await listOptions(screen.getByRole('combobox', { name: 'List' }))).toEqual(['Option 0', 'Option 1']);
  });

  describe('variant="popover"', () => {
    const labels = [
      { value: '1', label: 'Bug', color: '#ff0000' },
      { value: '2', label: 'Billing', color: '#00ff00' },
    ];
    const trigger = ({ toggle }: { toggle: () => void }) => (
      <button type="button" onClick={toggle}>Add label</button>
    );

    it('opens from the trigger, filters by typing, multi ticks keep it open', () => {
      const onChange = vi.fn();
      render(<Select variant="popover" multi aria-label="Labels" trigger={trigger} options={labels} value={['1']} onChange={onChange} />);
      expect(screen.queryByRole('combobox')).toBeNull();
      fireEvent.click(screen.getByText('Add label'));
      const search = screen.getByRole('combobox', { name: 'Labels' });
      fireEvent.change(search, { target: { value: 'bil' } });
      expect(screen.getAllByRole('option').map((opt) => opt.textContent)).toEqual(['Billing']);
      fireEvent.click(screen.getByRole('option', { name: 'Billing' }));
      expect(onChange).toHaveBeenCalledWith(['1', '2']);
      expect(screen.getByRole('combobox', { name: 'Labels' })).toBeInTheDocument();
    });

    it('creatable: a create row for new text, none for an exact match; onCreate gets the trimmed text', () => {
      const onCreate = vi.fn();
      render(<Select variant="popover" multi creatable onCreate={onCreate} aria-label="Labels" trigger={trigger} options={labels} value={[]} />);
      fireEvent.click(screen.getByText('Add label'));
      const search = screen.getByRole('combobox', { name: 'Labels' });
      fireEvent.change(search, { target: { value: 'bug' } });
      expect(screen.queryByText(/^Create /)).toBeNull();
      fireEvent.change(search, { target: { value: '  Urgent ' } });
      fireEvent.click(screen.getByText('Create "Urgent"'));
      expect(onCreate).toHaveBeenCalledWith('Urgent');
    });

    it('single: picking closes it; Escape and an outside press close it', () => {
      const onChange = vi.fn();
      render(<><Select variant="popover" aria-label="Lang" trigger={trigger} options={labels} onChange={onChange} /><p>outside</p></>);
      fireEvent.click(screen.getByText('Add label'));
      fireEvent.click(screen.getByRole('option', { name: 'Bug' }));
      expect(onChange).toHaveBeenCalledWith('1');
      expect(screen.queryByRole('combobox')).toBeNull();
      fireEvent.click(screen.getByText('Add label'));
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
      expect(screen.queryByRole('combobox')).toBeNull();
      fireEvent.click(screen.getByText('Add label'));
      fireEvent.mouseDown(screen.getByText('outside'));
      expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('the panel is a named dialog in <body>, kept on screen at the right edge', () => {
      // A trigger 30px from the right edge of a 400px page: a 220px panel must be pulled back.
      const width = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(400);
      const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 370, right: 390, top: 10, bottom: 30, width: 20, height: 20, x: 370, y: 10, toJSON: () => ({}),
      } as DOMRect);
      const { container } = render(<Select variant="popover" aria-label="Labels" trigger={trigger} options={labels} />);
      fireEvent.click(screen.getByText('Add label'));
      const panel = screen.getByRole('dialog', { name: 'Labels' });
      expect(container.contains(panel)).toBe(false);
      expect(panel.style.left).toBe(`${400 - 220 - 8}px`);
      expect(panel.style.width).toBe('220px');
      width.mockRestore();
      rect.mockRestore();
    });

    it('the panel follows its trigger when a container scrolls', () => {
      const page = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
      let left = 100;
      const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
        () => ({ left, right: left + 20, top: 10, bottom: 30, width: 20, height: 20, x: left, y: 10, toJSON: () => ({}) }) as DOMRect
      );
      render(<Select variant="popover" aria-label="Follow" trigger={trigger} options={labels} />);
      fireEvent.click(screen.getByText('Add label'));
      expect(screen.getByRole('dialog', { name: 'Follow' }).style.left).toBe('100px');
      left = 140;
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });
      expect(screen.getByRole('dialog', { name: 'Follow' }).style.left).toBe('140px');
      rect.mockRestore();
      page.mockRestore();
    });

    it('open state can be held by the parent', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(<Select variant="popover" aria-label="P" open={false} onOpenChange={onOpenChange} trigger={trigger} options={labels} />);
      fireEvent.click(screen.getByText('Add label'));
      expect(onOpenChange).toHaveBeenCalledWith(true);
      expect(screen.queryByRole('dialog')).toBeNull();
      rerender(<Select variant="popover" aria-label="P" open onOpenChange={onOpenChange} trigger={trigger} options={labels} />);
      expect(screen.getByRole('dialog', { name: 'P' })).toBeInTheDocument();
    });

    it('typing matches the visible name, not the id; empty text is the caller\'s', () => {
      render(<Select variant="popover" aria-label="F" trigger={trigger} noOptionsMessage={() => 'No labels yet.'} options={[{ value: '12', label: 'Bug' }]} />);
      fireEvent.click(screen.getByText('Add label'));
      fireEvent.change(screen.getByRole('combobox', { name: 'F' }), { target: { value: '12' } });
      expect(screen.queryByRole('option')).toBeNull();
      expect(screen.getByText('No labels yet.')).toBeInTheDocument();
    });

    it('Escape and a pick give the focus back to the trigger', async () => {
      render(<Select variant="popover" aria-label="Back" trigger={trigger} options={labels} />);
      fireEvent.click(screen.getByText('Add label'));
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
      await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Add label')));
      fireEvent.click(screen.getByText('Add label'));
      fireEvent.click(screen.getByRole('option', { name: 'Bug' }));
      await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Add label')));
    });

    it('a stored colour is drawn as a dot (sanitised)', () => {
      render(<Select variant="popover" aria-label="C" trigger={trigger} options={[{ value: 'x', label: 'X', color: 'red;background:url(evil)' }, ...labels]} />);
      fireEvent.click(screen.getByText('Add label'));
      const dot = screen.getByRole('option', { name: 'Bug' }).querySelector('span[aria-hidden]') as HTMLElement;
      expect(dot.style.backgroundColor).toBe('rgb(255, 0, 0)');
      const evil = screen.getByRole('option', { name: 'X' }).querySelector('span[aria-hidden]') as HTMLElement;
      expect(evil.getAttribute('style') ?? '').not.toContain('url(');
    });
  });
});
