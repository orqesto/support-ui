/** A design-system file picker: a Button that opens the browser's file chooser (review 8b, F9). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilePicker } from '@/components/ui/FilePicker';

afterEach(cleanup);

describe('FilePicker', () => {
  it('a button opens the chooser; the chosen file is handed over; the input is reset', () => {
    const onPick = vi.fn();
    render(
      <FilePicker accept="image/png" label="Choose a profile photo" onPick={onPick}>
        Upload photo
      </FilePicker>
    );
    const input = screen.getByLabelText<HTMLInputElement>('Choose a profile photo');
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
    expect(click).toHaveBeenCalled();
    expect(input.accept).toBe('image/png');
    const chosen = new File(['x'], 'me.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [chosen] } });
    expect(onPick).toHaveBeenCalledWith(chosen);
    expect(input.value).toBe('');
  });

  it('disabled: the button does nothing', () => {
    const onPick = vi.fn();
    render(
      <FilePicker accept="image/png" label="Pick" onPick={onPick} disabled>
        Upload
      </FilePicker>
    );
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInactive();
  });
});
