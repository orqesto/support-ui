import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TemplateChecklist, IDENTIFIER_WARNING } from '../TemplateChecklist';
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
    expect(screen.getByRole('alert')).toHaveTextContent(IDENTIFIER_WARNING);
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
});
