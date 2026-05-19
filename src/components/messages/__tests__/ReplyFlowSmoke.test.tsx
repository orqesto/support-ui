import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Mock RichTextEditor (uses tiptap which needs complex DOM setup)
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: ({
    onChange,
    placeholder,
  }: {
    content?: string;
    onChange?: (val: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      placeholder={placeholder}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: string;
    isLoading?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled} type={(type as 'button' | 'submit') ?? 'button'}>
      {children}
    </button>
  ),
}));

import { MessageReplyForm } from '@/components/messages/MessageReplyForm';

describe('ReplyFlowSmoke', () => {
  const onSend = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the reply form without crashing', () => {
    render(<MessageReplyForm onSend={onSend} onCancel={onCancel} submitting={false} />);
    expect(screen.getByTestId('rich-text-editor')).toBeTruthy();
  });

  it('shows Send Reply button', () => {
    render(<MessageReplyForm onSend={onSend} onCancel={onCancel} submitting={false} />);
    expect(screen.getByText('Send Reply')).toBeTruthy();
  });

  it('shows Cancel button', () => {
    render(<MessageReplyForm onSend={onSend} onCancel={onCancel} submitting={false} />);
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('calls onCancel when Cancel is clicked', () => {
    render(<MessageReplyForm onSend={onSend} onCancel={onCancel} submitting={false} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onSend when reply content is empty', () => {
    render(<MessageReplyForm onSend={onSend} onCancel={onCancel} submitting={false} />);
    fireEvent.click(screen.getByText('Send Reply'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('calls onSend with content when form is submitted with text', () => {
    render(<MessageReplyForm onSend={onSend} onCancel={onCancel} submitting={false} />);

    // Type into the mocked rich text editor
    const editor = screen.getByTestId('rich-text-editor');
    fireEvent.change(editor, { target: { value: 'Hello, how can I help?' } });

    // Click Send Reply
    fireEvent.click(screen.getByText('Send Reply'));

    // onSend should be called with the entered content
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Hello, how can I help?', []);
  });

  it('disables send button while submitting', () => {
    render(<MessageReplyForm onSend={onSend} onCancel={onCancel} submitting={true} />);
    const sendButton = screen.getByText('Send Reply').closest('button');
    expect(sendButton?.disabled).toBe(true);
  });
});
