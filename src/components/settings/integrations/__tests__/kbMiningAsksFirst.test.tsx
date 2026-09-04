/**
 * KB mining and re-mining start paid AI work over a whole mailbox. Neither may begin on a
 * single click: both ask first, and say what will be mined. Audit u41 P0-1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const reprocessSource = vi.fn();
vi.mock('@/services/kb.service', () => ({
  kbService: { reprocessSource: (id: number) => reprocessSource(id) as unknown },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { SourceKbToggle, KB_MINING_CONFIRM_DESCRIPTION } = await import(
  '@/components/settings/integrations/SourceKbToggle'
);
const { SourceKbStrip } = await import('@/components/settings/integrations/SourceKbStrip');

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);
const theSwitch = () => screen.getByRole('switch', { name: /mine past conversations/i });

beforeEach(() => {
  reprocessSource.mockReset();
  reprocessSource.mockResolvedValue({ success: true });
});

describe('SourceKbToggle — switching ON asks first', () => {
  it('THE FIX: one click opens a confirmation instead of enabling', () => {
    const onChange = vi.fn();
    render(<SourceKbToggle checked={false} onChange={onChange} />);
    fireEvent.click(theSwitch());
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(KB_MINING_CONFIRM_DESCRIPTION)).toBeInTheDocument();
    // Says what will be mined and that it is billed.
    expect(KB_MINING_CONFIRM_DESCRIPTION).toMatch(/every past conversation in this mailbox/i);
    expect(KB_MINING_CONFIRM_DESCRIPTION).toMatch(/billed/i);
  });

  it('enables only on confirm', () => {
    const onChange = vi.fn();
    render(<SourceKbToggle checked={false} onChange={onChange} />);
    fireEvent.click(theSwitch());
    fireEvent.click(screen.getByRole('button', { name: 'Mine past conversations' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does nothing on cancel', () => {
    const onChange = vi.fn();
    render(<SourceKbToggle checked={false} onChange={onChange} />);
    fireEvent.click(theSwitch());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('CONTROL: switching OFF costs nothing and passes straight through', () => {
    const onChange = vi.fn();
    render(<SourceKbToggle checked onChange={onChange} />);
    fireEvent.click(theSwitch());
    expect(onChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText(KB_MINING_CONFIRM_DESCRIPTION)).not.toBeInTheDocument();
  });
});

describe('SourceKbStrip — Re-mine asks first', () => {
  const source = { id: 12, isKnowledgeBase: true, kbMarkedAt: '2026-06-01T00:00:00Z' };

  it('THE FIX: the button opens a confirmation and starts nothing', () => {
    render(<SourceKbStrip source={source} onShowAlert={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /re-mine/i }));
    expect(reprocessSource).not.toHaveBeenCalled();
    expect(screen.getByText(/will be sent to your AI provider again/i)).toBeInTheDocument();
    expect(screen.getByText(/billed AI usage/i)).toBeInTheDocument();
  });

  it('starts re-mining only on confirm, for this source', async () => {
    const onShowAlert = vi.fn();
    render(<SourceKbStrip source={source} onShowAlert={onShowAlert} />);
    fireEvent.click(screen.getByRole('button', { name: /re-mine/i }));
    // The dialog's own confirm button carries the same label as the strip's button; the
    // dialog one is the last rendered.
    const buttons = screen.getAllByRole('button', { name: /^re-mine$/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(reprocessSource).toHaveBeenCalledWith(12));
    await waitFor(() =>
      expect(onShowAlert).toHaveBeenCalledWith(expect.objectContaining({ variant: 'info' }))
    );
  });

  it('does nothing on cancel', () => {
    render(<SourceKbStrip source={source} onShowAlert={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /re-mine/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reprocessSource).not.toHaveBeenCalled();
  });
});
