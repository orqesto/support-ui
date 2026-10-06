/**
 * "Detached" + hidden is only ever a thread that moved to another mailbox: hiding an entry a
 * moderator took out of its case ENDS its detached mark (BE hiddenFields), so the title names
 * that one cause.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KBStatusBadge } from '../KBStatusBadge';
import type { KBEntry } from '@/services/kb.service';

describe('KBStatusBadge detached', () => {
  it('names the one cause a hidden detached entry can have', () => {
    const entry = {
      id: 5,
      type: 'qa_pair',
      title: 'Q',
      content: '',
      category: '',
      departmentId: null,
      qualityScore: 0,
      usageCount: 0,
      createdAt: '',
      approved: false,
      hidden: true,
      rejectedAt: null,
      consolidation: { state: 'detached', caseId: 900, casePublicId: 'KB-900', caseExists: true },
    } as unknown as KBEntry;
    render(
      <MemoryRouter>
        <KBStatusBadge entry={entry} withProvenance={false} />
      </MemoryRouter>
    );
    expect(screen.getByText('detached from case #KB-900')).toHaveAttribute(
      'title',
      'Its thread moved to another mailbox, so it left the case. It stays hidden.'
    );
  });
});
