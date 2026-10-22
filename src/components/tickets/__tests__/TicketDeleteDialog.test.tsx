import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TicketDeleteDialog } from '../TicketsJiraDialogs';

vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));

const renderDialog = (reference?: string) =>
  render(
    <TicketDeleteDialog
      open
      onOpenChange={vi.fn()}
      ticketToDelete={{
        id: 1182,
        reference,
        title: 'Checkout fails at the 3-D Secure step',
        status: 'open',
        priority: 'high',
      }}
      deleting={false}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
    />
  );

describe('TicketDeleteDialog', () => {
  it('names the ticket by its own ID', () => {
    renderDialog('SUP-T-42');
    expect(screen.getByText('TES-SUP-T-42')).toBeInTheDocument();
    expect(screen.queryByText('#1182')).toBeNull();
  });

  it('falls back to #id before the ticket has a number', () => {
    renderDialog();
    expect(screen.getByText('#1182')).toBeInTheDocument();
  });
});
