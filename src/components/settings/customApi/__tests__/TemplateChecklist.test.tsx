import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TemplateChecklist } from '../TemplateChecklist';
import type { FieldPick } from '@/services/customApi.service';

const checklist = [
  { role: 'identifier', label: 'Order number', required: true },
  { role: 'status', label: 'Status', required: true },
  { role: 'date', label: 'Order date', required: false },
] as const;
const pick = (path: string, role: FieldPick['role']): FieldPick => ({
  path,
  label: path,
  kind: 'plain',
  role,
});

describe('TemplateChecklist', () => {
  it('ticks each role a picked field carries, and marks the rest missing', () => {
    render(
      <TemplateChecklist
        checklist={[...checklist]}
        picked={[pick('id', 'identifier')]}
        feedsOwnership={false}
      />
    );
    expect(within(screen.getByTestId('check-identifier')).getByText('✓')).toBeInTheDocument();
    expect(within(screen.getByTestId('check-status')).getByText('✗')).toBeInTheDocument();
    expect(within(screen.getByTestId('check-date')).getByText('optional')).toBeInTheDocument();
  });

  it('⛔ the strongest warning only when this lookup feeds the ownership check and has no identifier', () => {
    const { rerender } = render(
      <TemplateChecklist checklist={[...checklist]} picked={[]} feedsOwnership />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No field is tagged as the order number, so the ownership check cannot work — every order number lookup will read unverified.'
    );
    rerender(
      <TemplateChecklist
        checklist={[...checklist]}
        picked={[pick('id', 'identifier')]}
        feedsOwnership
      />
    );
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<TemplateChecklist checklist={[...checklist]} picked={[]} feedsOwnership={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('F3: names the identifier from THIS template’s checklist, not a hard-coded order number', () => {
    render(
      <TemplateChecklist
        checklist={[{ role: 'identifier', label: 'Booking reference', required: true }]}
        picked={[]}
        feedsOwnership
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No field is tagged as the booking reference, so the ownership check cannot work — every booking reference lookup will read unverified.'
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(/order/);
  });

  it('F3: falls back to "record number" when the checklist has no identifier label', () => {
    render(
      <TemplateChecklist
        checklist={[{ role: 'status', label: 'Status', required: true }]}
        picked={[]}
        feedsOwnership
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No field is tagged as the record number, so the ownership check cannot work — every record number lookup will read unverified.'
    );
  });
});
