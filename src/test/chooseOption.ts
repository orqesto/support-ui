import { fireEvent, screen } from '@testing-library/react';

/**
 * Pick an option in a `Select` (`@/components/ui/Select`) by its visible text.
 *
 * `control` is the Select's combobox — `screen.getByRole('combobox', { name: 'Department' })` or
 * `screen.getByLabelText('Department')`. The menu renders in a portal on `document.body`, so the
 * option is looked up on the whole screen. Works for single and `multi` selects (a multi menu stays
 * open; call it once per option).
 *
 * Use this instead of `userEvent.selectOptions`, which only drives a native `<select>`.
 */
export const chooseOption = async (control: HTMLElement, optionText: string | RegExp) => {
  control.focus();
  fireEvent.keyDown(control, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
  const option = await screen.findByRole('option', { name: optionText });
  fireEvent.click(option);
};

/** The visible option texts of an open or openable `Select` (opens it first). */
export const listOptions = async (control: HTMLElement): Promise<string[]> => {
  control.focus();
  fireEvent.keyDown(control, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
  await screen.findAllByRole('option');
  return screen.getAllByRole('option').map((option) => option.textContent ?? '');
};
