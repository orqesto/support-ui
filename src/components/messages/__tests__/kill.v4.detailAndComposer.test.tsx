/**
 * Mutation batch (message detail v4), chunk 3: the survivors in MessageDetail and MessageComposer
 * that are behaviour — a button whose click had no coverage, a mode whose UI difference was
 * unpinned, a focus rule that only one of its branches had been through.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { setViewport, renderDetail, composer, classOf } from './md4.mobile.utils';
import { screen, fireEvent, within, cleanup } from '@testing-library/react';

vi.mock('@/lib/api-client', () => {
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

afterEach(cleanup);

describe('MessageDetail — Resolve & save to KB', () => {
  it('opens its confirm dialog (the click had no coverage)', () => {
    setViewport(false);
    renderDetail({ status: 'in_progress' });
    expect(screen.queryByText('Resolve & Save to KB?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Resolve & save to KB/ }));
    expect(screen.getByText('Resolve & Save to KB?')).toBeInTheDocument();
  });
});

describe('MessageComposer — reply mode vs note mode', () => {
  it('a note has no recipients and posts; a reply addresses and sends', () => {
    setViewport(false);
    renderDetail();
    const box = composer();
    expect(within(box).getByRole('button', { name: 'Edit recipients' })).toBeInTheDocument();
    expect(within(box).getByRole('button', { name: 'SEND' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'open Notes tab' }));
    expect(within(box).queryByRole('button', { name: 'Edit recipients' })).toBeNull();
    expect(within(box).getByRole('button', { name: 'POST NOTE' })).toBeInTheDocument();
    expect(within(box).queryByRole('button', { name: 'SEND' })).toBeNull();
  });
});

describe('MessageComposer — a phone opens on a focus only where text is typed', () => {
  it('the editor opens it; a button and the file input do not', () => {
    setViewport(true);
    renderDetail();
    const box = composer();
    expect(box.getAttribute('data-phone-state')).toBe('rest');
    // A button inside the composer takes focus (Chrome Android focuses on the press): no open.
    fireEvent.focus(within(box).getByRole('button', { name: 'SEND' }));
    expect(box.getAttribute('data-phone-state')).toBe('rest');
    // An <input> that takes no typed text: no open either (NON_TEXT_INPUTS).
    const fileInput = box.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.focus(fileInput);
    expect(box.getAttribute('data-phone-state')).toBe('rest');
    // CONTROL: the editor is where text is typed.
    fireEvent.focus(screen.getByTestId('rich-text-editor'));
    expect(box.getAttribute('data-phone-state')).not.toBe('rest');
  });

  it('a text <input> inside the composer opens it (the branch no test had been through)', () => {
    setViewport(true);
    renderDetail();
    const box = composer();
    const probe = document.createElement('input');
    probe.type = 'text';
    box.appendChild(probe);
    fireEvent.focus(probe);
    expect(box.getAttribute('data-phone-state')).not.toBe('rest');
  });
});

describe('MessageComposer — selected files', () => {
  it('a chosen file shows as a chip that can be removed', () => {
    setViewport(false);
    renderDetail();
    const box = composer();
    const fileInput = box.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF'], 'spec.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(within(box).getByText('spec.pdf')).toBeInTheDocument();
    fireEvent.click(within(box).getByRole('button', { name: 'Remove file' }));
    expect(within(box).queryByText('spec.pdf')).toBeNull();
    expect(classOf(box)).not.toContain('hidden');
  });
});
