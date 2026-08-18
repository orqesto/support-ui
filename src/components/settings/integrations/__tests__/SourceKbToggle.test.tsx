import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SourceKbToggle } from '@/components/settings/integrations/SourceKbToggle';
import { GmailForm } from '@/components/settings/integrations/GmailForm';

// Toggle reads theme, so every render needs the provider.
const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const gmailProps = {
  config: { searchQuery: '', maxResults: 50, pollingMaxPages: 1, bulkImportDays: 30 },
  saving: false,
  pollingPagesInput: '1',
  maxResultsInput: '50',
  departments: [],
  selectedDepartmentIds: [],
  defaultDepartmentId: undefined,
  onConfigChange: vi.fn(),
  onPollingPagesChange: vi.fn(),
  onPollingPagesBlur: vi.fn(),
  onMaxResultsChange: vi.fn(),
  onMaxResultsBlur: vi.fn(),
  onSelectedDepartmentsChange: vi.fn(),
  onDefaultDepartmentChange: vi.fn(),
  onConnect: vi.fn(),
  onCancel: vi.fn(),
};

describe('SourceKbToggle', () => {
  it('renders an accessible switch reflecting the current state', () => {
    render(<SourceKbToggle checked={false} onChange={vi.fn()} />);
    const sw = screen.getByRole('switch', { name: /mine past conversations/i });
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('reports the NEW value when switched on', () => {
    const onChange = vi.fn();
    render(<SourceKbToggle checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: /mine past conversations/i }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('GmailForm — KB source can actually be enabled (regression)', () => {
  it('exposes the KB toggle', () => {
    // The bug: Gmail had NO control at all. It rendered prose telling the user to go to a
    // "Knowledge Base Sources" section that the C-lite IA had already deleted, so a Gmail
    // source could not be made a KB source through the UI at all.
    render(<GmailForm {...gmailProps} />);
    expect(screen.getByRole('switch', { name: /mine past conversations/i })).toBeInTheDocument();
  });

  it('no longer points at the deleted "Knowledge Base Sources" section', () => {
    render(<GmailForm {...gmailProps} />);
    expect(screen.queryByText(/Knowledge Base Sources/i)).not.toBeInTheDocument();
  });

  it('promotes the source to KB via onConfigChange', () => {
    const onConfigChange = vi.fn();
    render(<GmailForm {...gmailProps} onConfigChange={onConfigChange} />);
    fireEvent.click(screen.getByRole('switch', { name: /mine past conversations/i }));
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ isKnowledgeBase: true }));
  });
});
