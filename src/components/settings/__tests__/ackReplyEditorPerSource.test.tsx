/**
 * FE audit 2026-09-29, B-H5: one inline `<AckReplyEditor>` with no `key`. Its state seeds once
 * from `initial`, and the other rows' Configure buttons stay clickable, so Configure A, then
 * Configure B, then Save wrote A's template onto B. Keyed by source, the editor remounts.
 *
 * The editor is stubbed with the same seeding (`useState(initial.…)`), so this pins the
 * parent's key: without it the stub keeps A's subject exactly as the real editor did.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

const getAll = vi.fn();
vi.mock('@/services/integrations.service', () => ({ integrationsService: { getAll } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/settings/integrations/AckReplyEditor', () => ({
  AckReplyEditor: ({
    sourceId,
    initial,
  }: {
    sourceId: number;
    initial: { autoReplySubject: string | null };
  }) => {
    const [subject] = useState(initial.autoReplySubject ?? '');
    return (
      <div data-testid="ack-editor" data-source={sourceId}>
        {subject}
      </div>
    );
  },
}));

const { AckReplyPerSourceList } = await import('../AckReplyPerSourceList');

afterEach(cleanup);

describe('the acknowledgment editor belongs to the source it was opened for', () => {
  beforeEach(() => {
    getAll.mockResolvedValue({
      success: true,
      data: [
        {
          id: 1,
          name: 'Sales',
          type: 'gmail',
          autoReplyEnabled: true,
          autoReplySubject: 'Sales: thanks',
          autoReplyBody: '<p>a</p>',
        },
        {
          id: 2,
          name: 'Support',
          type: 'email',
          autoReplyEnabled: false,
          autoReplySubject: 'Support: got it',
          autoReplyBody: '<p>b</p>',
        },
      ],
    });
  });

  it("Configure A then Configure B shows B's template, not A's", async () => {
    render(<AckReplyPerSourceList onShowAlert={vi.fn()} />);
    const configure = await screen.findAllByRole('button', { name: /Configure/ });
    fireEvent.click(configure[0]);
    await waitFor(() =>
      expect(screen.getByTestId('ack-editor')).toHaveTextContent('Sales: thanks')
    );
    fireEvent.click(configure[1]);
    await waitFor(() =>
      expect(screen.getByTestId('ack-editor')).toHaveTextContent('Support: got it')
    );
    expect(screen.getByTestId('ack-editor').dataset.source).toBe('2');
  });
});
