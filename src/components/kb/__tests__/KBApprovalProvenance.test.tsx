import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { KBApprovalBadge, KBApprovalProvenance } from '@/components/kb/KBApprovalProvenance';
import type { KBEntry } from '@/services/kb.service';

const getAssignableUsers = vi.fn();
vi.mock('@/services/assignment.service', () => ({
  assignmentService: {
    getAssignableUsers: (...args: unknown[]) => getAssignableUsers(...args) as unknown,
  },
}));

const currentUser = { id: 99 };
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: number } }) => unknown) =>
    selector({ user: currentUser }),
}));

const entry = (overrides: Partial<KBEntry>): KBEntry =>
  ({
    id: 1,
    type: 'qa_pair',
    title: 'Q: do you deliver to Portugal?',
    content: 'Yes.',
    category: 'general',
    departmentId: null,
    qualityScore: 0.9,
    approved: true,
    hidden: false,
    usageCount: 0,
    createdAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  }) as KBEntry;

beforeEach(() => {
  getAssignableUsers.mockReset();
  getAssignableUsers.mockResolvedValue([
    { id: 7, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', role: 'agent' },
  ]);
});

describe('KBApprovalBadge', () => {
  it('marks a score-approved entry as automatic', () => {
    render(<KBApprovalBadge entry={entry({ approvedBy: null })} />);
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  it('marks a human-approved entry as reviewed', () => {
    render(<KBApprovalBadge entry={entry({ approvedBy: 7 })} />);
    expect(screen.getByText('Reviewed')).toBeInTheDocument();
  });

  // CONTROL: with the backend not yet deployed the field is absent, and the badge must say
  // nothing at all rather than claim the entry was auto-approved.
  it('renders nothing when the backend has not sent the field', () => {
    const { container } = render(<KBApprovalBadge entry={entry({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an entry awaiting review', () => {
    const { container } = render(<KBApprovalBadge entry={entry({ approved: false })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('KBApprovalProvenance', () => {
  it('says plainly that nobody reviewed a score-approved entry', () => {
    render(<KBApprovalProvenance entry={entry({ approvedBy: null })} />);
    expect(screen.getByText(/Auto-approved by quality score/)).toBeInTheDocument();
    expect(screen.getByText(/not reviewed by a person/)).toBeInTheDocument();
    expect(getAssignableUsers).not.toHaveBeenCalled();
  });

  it('names the approver and when they approved', async () => {
    render(
      <KBApprovalProvenance
        entry={entry({ approvedBy: 7, approvedAt: '2026-08-19T10:30:00.000Z' })}
      />
    );

    // Falls back to a neutral label first, then resolves — neither state may be blank.
    expect(screen.getByText(/Reviewed by/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Reviewed by Ada Lovelace')).toBeInTheDocument());
  });

  it('says "you" without a lookup when the approver is the current user', () => {
    render(<KBApprovalProvenance entry={entry({ approvedBy: currentUser.id })} />);
    expect(screen.getByText('Reviewed by you')).toBeInTheDocument();
    expect(getAssignableUsers).not.toHaveBeenCalled();
  });

  // A deactivated reviewer is filtered out of assignable users (BE #366), and a failed
  // lookup must not blank the line that says a human approved it.
  it('keeps the reviewed line when the approver cannot be resolved', async () => {
    getAssignableUsers.mockResolvedValue([]);
    render(<KBApprovalProvenance entry={entry({ approvedBy: 7 })} />);
    await waitFor(() => expect(getAssignableUsers).toHaveBeenCalled());
    expect(screen.getByText('Reviewed by a team member')).toBeInTheDocument();
  });

  it('survives a failing lookup', async () => {
    getAssignableUsers.mockRejectedValue(new Error('403'));
    render(<KBApprovalProvenance entry={entry({ approvedBy: 7 })} />);
    await waitFor(() => expect(getAssignableUsers).toHaveBeenCalled());
    expect(screen.getByText('Reviewed by a team member')).toBeInTheDocument();
  });

  it('renders nothing when the backend has not sent the field', () => {
    const { container } = render(<KBApprovalProvenance entry={entry({})} />);
    expect(container).toBeEmptyDOMElement();
  });
});
