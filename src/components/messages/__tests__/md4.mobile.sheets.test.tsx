/**
 * Message detail v4 — the phone layout: popovers and dialogs as bottom sheets (M8). Shared mocks
 * and render helpers: md4.mobile.utils.tsx. Every phone test has a desktop CONTROL.
 */
import { describe, it, expect, vi, onTestFinished, type Mock } from 'vitest';
import { setViewport, renderDetail, classOf, noop, wrap, baseMessage } from './md4.mobile.utils';
import { render, screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react';
import { apiClient } from '@/lib/api-client';
import { RelatedPopover } from '../RelatedPopover';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { MergePickerDialog } from '../MergeThreads';
import { MergeConfirmDialog } from '../MergeConfirmDialog';
import { AddToTicketDialog } from '../AddToTicketDialog';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { categoryService } from '@/services/category.service';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => {
  // The services' auto-stub (md4.mobile.utils.tsx): each method a vi.fn resolving [].
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    apiClient: new Proxy(fns, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
        return target[key];
      },
    }),
  };
});

/** The sheet rule that keeps a phone's inputs at 16px, so iOS does not zoom into a search. */
const SHEET_INPUT_RULE = 'max-sm:[&_input]:text-base';
const underSheetInputRule = (el: Element) => {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (classOf(node).split(/\s+/).includes(SHEET_INPUT_RULE)) return true;
  }
  return false;
};

describe('M8 — popovers and dialogs as bottom sheets', () => {
  it('Dialog sheetOnPhone: full width, 18px top radius, 88% tall, stretched 44px footer', () => {
    render(
      <Dialog open onOpenChange={noop} sheetOnPhone>
        <p>Body</p>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-sheet-on-phone')).toBe('true');
    const cls = classOf(dialog);
    expect(cls).toContain('max-sm:max-w-none');
    expect(cls).toContain('max-sm:rounded-t-[18px]');
    expect(cls).toContain('max-sm:max-h-[88%]');
    expect(cls).toContain('max-sm:[&_[data-dialog-footer]>*]:h-11');
    // 16px inputs: iOS zooms the page into any field under 16px when it is focused.
    expect(cls.split(/\s+/)).toContain(SHEET_INPUT_RULE);
    expect(classOf(dialog.parentElement)).toContain('max-sm:items-end');
  });

  it('CONTROL: a Dialog without it is unchanged', () => {
    render(
      <Dialog open onOpenChange={noop}>
        <p>Body</p>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-sheet-on-phone')).toBeNull();
    expect(classOf(dialog)).not.toContain('max-sm:');
    expect(classOf(dialog.parentElement)).not.toContain('max-sm:');
  });

  it('the Add-to-ticket picker opens as a sheet', async () => {
    setViewport(true);
    // A backend with ticket links: Add is offered only once that is known.
    const api = apiClient as unknown as { get: Mock<(url: string) => Promise<unknown>> };
    api.get.mockImplementation((url) =>
      Promise.resolve(
        url.endsWith('/tickets') ? { data: { success: true, data: { tickets: [] } } } : []
      )
    );
    onTestFinished(() => {
      api.get.mockReset();
      api.get.mockResolvedValue([]);
    });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    // Offered once the backend is known to have ticket links (the first read has answered).
    fireEvent.click(
      await within(screen.getByRole('menu')).findByRole('button', { name: 'Add to ticket…' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('data-sheet-on-phone')).toBe('true');
  });

  it('the Related popover is a sheet over a scrim on a phone', () => {
    render(
      <RelatedPopover label="Tickets" onClose={noop}>
        <p>card</p>
      </RelatedPopover>
    );
    const pop = screen.getByRole('dialog', { name: 'Tickets' });
    expect(classOf(pop)).toContain('max-sm:fixed');
    expect(classOf(pop)).toContain('max-sm:left-2');
    expect(classOf(pop)).toContain('max-sm:max-h-[72vh]');
    // CONTROL: the desktop popover geometry is still there.
    expect(classOf(pop)).toContain('w-[380px]');
    const scrim = screen.getByTestId('related-scrim');
    expect(classOf(scrim)).toContain('hidden');
    expect(classOf(scrim)).toContain('max-sm:block');
  });

  it('a chip menu with mobileSheet opens as a sheet; one without does not', async () => {
    const options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Bravo' },
    ];
    render(
      <>
        <ReactSelect id="sheet" variant="chip" value="a" options={options} mobileSheet />
        <ReactSelect id="plain" variant="chip" value="b" options={options} />
      </>
    );
    fireEvent.keyDown(document.getElementById('sheet')!, { key: 'ArrowDown' });
    const optionEl = (await screen.findByRole('option', { name: 'Bravo' })).closest(
      '[class*="max-sm:min-h-[46px]"]'
    );
    expect(optionEl).not.toBeNull();
    expect(optionEl!.closest('[class*="max-sm:!static"]')).not.toBeNull();
    expect(optionEl!.closest('[class*="max-sm:!bottom-2"]')).not.toBeNull();
    fireEvent.keyDown(document.getElementById('sheet')!, { key: 'Escape' });
    await act(async () => {});
    fireEvent.keyDown(document.getElementById('plain')!, { key: 'ArrowDown' });
    const plainOption = await screen.findByRole('option', { name: 'Alpha' });
    expect(classOf(plainOption)).not.toContain('max-sm:');
    expect(document.querySelector('[class*="max-sm:min-h-[46px]"]')).toBeNull();
  });
});

describe('M8 — a select sheet takes the tap on its scrim', () => {
  it('the tap closes the menu and never reaches the control underneath', async () => {
    const underneath = vi.fn();
    const options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Bravo' },
    ];
    render(
      <>
        <button type="button" onClick={underneath}>
          Under the scrim
        </button>
        <ReactSelect id="sheet" variant="chip" value="a" options={options} mobileSheet />
      </>
    );
    const documentClicks = vi.fn();
    document.addEventListener('click', documentClicks);
    try {
      fireEvent.keyDown(document.getElementById('sheet')!, { key: 'ArrowDown' });
      await screen.findByRole('option', { name: 'Bravo' });
      const scrim = screen.getByTestId('select-sheet-scrim');
      // A real layer over the page (phones only), under the menu's portal.
      expect(classOf(scrim)).toContain('fixed inset-0');
      expect(classOf(scrim)).toContain('max-sm:block');
      expect(scrim.parentElement).toBe(document.body);
      // A press keeps the focus (so the close is the scrim's), a touch makes no click.
      expect(fireEvent.mouseDown(scrim)).toBe(false);
      expect(fireEvent.touchEnd(scrim)).toBe(false);
      fireEvent.keyDown(document.getElementById('sheet')!, { key: 'ArrowDown' });
      fireEvent.click(await screen.findByTestId('select-sheet-scrim'));
      await act(async () => {});
      expect(screen.queryByRole('option', { name: 'Bravo' })).toBeNull();
      expect(screen.queryByTestId('select-sheet-scrim')).toBeNull();
      expect(underneath).not.toHaveBeenCalled();
      // Swallowed: nothing on the document reads it as a press on the page.
      expect(documentClicks).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', documentClicks);
    }
  });

  it('a touch alone on the scrim closes the sheet (a phone sends no click after it)', async () => {
    const options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Bravo' },
    ];
    render(<ReactSelect id="sheet" variant="chip" value="a" options={options} mobileSheet />);
    fireEvent.keyDown(document.getElementById('sheet')!, { key: 'ArrowDown' });
    await screen.findByRole('option', { name: 'Bravo' });
    // ONLY the touch: its preventDefault means the browser never synthesises the click.
    fireEvent.touchEnd(screen.getByTestId('select-sheet-scrim'));
    await act(async () => {});
    expect(screen.queryByRole('option', { name: 'Bravo' })).toBeNull();
    expect(screen.queryByTestId('select-sheet-scrim')).toBeNull();
  });

  it('CONTROL: a menu without mobileSheet draws no scrim; the sheet menu no longer fakes one', async () => {
    const options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Bravo' },
    ];
    render(<ReactSelect id="plain" variant="chip" value="a" options={options} />);
    fireEvent.keyDown(document.getElementById('plain')!, { key: 'ArrowDown' });
    await screen.findByRole('option', { name: 'Bravo' });
    expect(screen.queryByTestId('select-sheet-scrim')).toBeNull();
    cleanup();
    render(<ReactSelect id="sheet2" variant="chip" value="a" options={options} mobileSheet />);
    fireEvent.keyDown(document.getElementById('sheet2')!, { key: 'ArrowDown' });
    const option = await screen.findByRole('option', { name: 'Bravo' });
    expect(document.querySelector('[class*="100vmax"]')).toBeNull();
    expect(option).toBeTruthy();
  });
});

describe('M8 — the search inputs of the sheet pickers are 16px on a phone', () => {
  it('the merge picker’s search sits under the sheet’s 16px input rule', () => {
    wrap(<MergePickerDialog open onOpenChange={noop} message={baseMessage} />);
    const search = within(screen.getByRole('dialog')).getByPlaceholderText(
      'Thread number, address or subject'
    );
    expect(underSheetInputRule(search)).toBe(true);
  });

  it('the Add-to-ticket picker’s search sits under it too', () => {
    wrap(
      <AddToTicketDialog
        open
        onOpenChange={noop}
        message={baseMessage}
        excludeTicketIds={[]}
        onAdded={noop}
      />
    );
    const search = within(screen.getByRole('dialog')).getByPlaceholderText(
      'Search tickets by title or number'
    );
    expect(underSheetInputRule(search)).toBe(true);
  });

  it('CONTROL: an input in a Dialog that is not a sheet is not under it', () => {
    render(
      <Dialog open onOpenChange={noop}>
        <label>
          Name
          <input />
        </label>
      </Dialog>
    );
    expect(underSheetInputRule(screen.getByLabelText('Name'))).toBe(false);
  });
});

describe('M8 — the merge dialogs, the Assigned picker and the sheet footer', () => {
  it('the merge picker and its confirm both open as sheets', () => {
    wrap(<MergePickerDialog open onOpenChange={noop} message={baseMessage} />);
    const picker = screen.getByRole('dialog');
    expect(within(picker).getByText('Merge with another thread')).toBeTruthy();
    expect(picker.getAttribute('data-sheet-on-phone')).toBe('true');
    cleanup();
    wrap(
      <MergeConfirmDialog
        open
        rows={[{ id: 101 }, { id: 70 }]}
        onOpenChange={noop}
        onMerged={noop}
      />
    );
    const confirm = screen.getByRole('dialog');
    expect(within(confirm).getByText('Merge into one thread')).toBeTruthy();
    expect(confirm.getAttribute('data-sheet-on-phone')).toBe('true');
  });

  const openAssigned = async (scope: HTMLElement) => {
    const row = within(scope).getByText('Assigned').parentElement!;
    // Disabled while the assignable users load.
    await waitFor(() => expect(row.querySelector('input:not([disabled])')).not.toBeNull());
    fireEvent.keyDown(row.querySelector('input')!, { key: 'ArrowDown' });
    await screen.findByRole('option', { name: 'Unassigned' });
  };

  it('phone: the Assigned picker in the Details card opens as a sheet', async () => {
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    await openAssigned(screen.getByTestId('meta-card-rows'));
    expect(screen.getByTestId('select-sheet-scrim')).toBeTruthy();
    const option = screen.getByRole('option', { name: 'Unassigned' });
    expect(option.closest('[class*="max-sm:!bottom-2"]')).not.toBeNull();
  });

  it('phone: the Category picker in the Details card opens as a sheet', async () => {
    const getAll = categoryService.getAll as unknown as Mock;
    getAll.mockResolvedValue({ success: true, data: [{ id: 4, name: 'Billing' }] });
    onTestFinished(() => {
      getAll.mockReset();
      getAll.mockResolvedValue([]);
    });
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    const card = screen.getByTestId('meta-card-rows');
    const row = (await within(card).findByText('Category')).parentElement!;
    fireEvent.keyDown(row.querySelector('input')!, { key: 'ArrowDown' });
    const option = await screen.findByRole('option', { name: 'Billing' });
    expect(screen.getByTestId('select-sheet-scrim')).toBeTruthy();
    expect(option.closest('[class*="max-sm:!bottom-2"]')).not.toBeNull();
  });

  /** The value picker's control box in a meta row: the element carrying the given class token. */
  const controlWith = (row: Element, token: string) =>
    Array.from(row.querySelectorAll('*')).find((el) => classOf(el).split(/\s+/).includes(token));

  it('phone: the Details card value pickers (Assigned, Category) are 36px tall, 13.5px', async () => {
    // The Category row shows once the workspace has a category.
    const getAll = categoryService.getAll as unknown as Mock;
    getAll.mockResolvedValue({ success: true, data: [{ id: 4, name: 'Billing' }] });
    onTestFinished(() => {
      getAll.mockReset();
      getAll.mockResolvedValue([]);
    });
    setViewport(true);
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    const card = screen.getByTestId('meta-card-rows');
    for (const name of ['Assigned', 'Category']) {
      const row = (await within(card).findByText(name)).parentElement!;
      const control = controlWith(row, 'max-sm:h-9');
      expect(control, name).toBeDefined();
      expect(classOf(control!).split(/\s+/), name).toContain('max-sm:text-[13.5px]');
      // The control box itself: it holds the picker's input.
      expect(control!.querySelector('input'), name).not.toBeNull();
    }
  });

  it('CONTROL desktop: the inline strip value pickers carry no phone sizing', () => {
    setViewport(false);
    renderDetail();
    const row = screen.getByText('Assigned').parentElement!;
    expect(row.querySelector('input')).not.toBeNull();
    expect(controlWith(row, 'max-sm:h-9')).toBeUndefined();
  });

  it("CONTROL desktop: the inline strip's Assigned picker is a plain menu", async () => {
    setViewport(false);
    renderDetail();
    await openAssigned(document.body);
    expect(screen.queryByTestId('select-sheet-scrim')).toBeNull();
  });

  it("DialogFooter is marked, so a sheet's stretch rule reaches its buttons", () => {
    render(
      <Dialog open onOpenChange={noop} sheetOnPhone>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Save</Button>
        </DialogFooter>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog');
    const buttons = [
      screen.getByRole('button', { name: 'Cancel' }),
      screen.getByRole('button', { name: 'Save' }),
    ];
    expect(buttons[0].parentElement!.hasAttribute('data-dialog-footer')).toBe(true);
    // The sheet's own `max-sm:[&_<selector>>*]:…` rules, applied as the browser would.
    const rules = classOf(dialog)
      .split(/\s+/)
      .map((token) => /^max-sm:\[&_(.+)>\*\]:/.exec(token)?.[1])
      .filter((selector): selector is string => selector !== undefined);
    expect(rules.length).toBeGreaterThan(0);
    for (const selector of rules)
      expect([...dialog.querySelectorAll(`${selector.replace(/_/g, ' ')} > *`)]).toEqual(buttons);
  });
});
