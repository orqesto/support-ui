/** The one "Delete message" confirm the slide-over and the full page both open. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DeleteMessageDialog } from '../DeleteMessageDialog';

afterEach(cleanup);

const renderDialog = (over: Partial<Parameters<typeof DeleteMessageDialog>[0]> = {}) => {
  const props = {
    open: true,
    message: { sender: 'Ada <ada@example.com>', subject: 'Order 5' },
    deleting: false,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...over,
  };
  render(<DeleteMessageDialog {...props} />);
  return props;
};

describe('DeleteMessageDialog', () => {
  it('asks the question, names the message, and confirms on Delete', () => {
    const props = renderDialog();
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete message');
    expect(screen.getByText('From: Ada <ada@example.com>')).toBeInTheDocument();
    expect(screen.getByText('Subject: Order 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('Cancel, the X and Esc all cancel — never confirm', () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalledTimes(3);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('while deleting, Cancel is disabled', () => {
    renderDialog({ deleting: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('⛔ while deleting, the X, Esc and the backdrop cannot close it either', () => {
    const props = renderDialog({ deleting: true });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('CONTROL: closed renders nothing', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
