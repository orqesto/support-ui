/**
 * "Detached" (hidden) has two causes since manual Remove from case (BE round 2): its title must be
 * true for both — taken out by a moderator and then hidden, or its thread moved mailbox.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KBStatusBadge } from '../KBStatusBadge';
import type { KBEntry } from '@/services/kb.service';

describe('KBStatusBadge detached', () => {
  it('names both causes, never only the mailbox move', () => {
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
      'It left its case — taken out by a moderator, or its thread moved to another mailbox. It stays hidden.'
    );
  });
});
