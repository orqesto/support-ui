import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { LearningEvidence } from '@/services/learning.service';

/**
 * The card's job is to make a zero legible. Three learning domains have each looked
 * healthy while producing nothing, so the failure this pins is the one where the
 * panel itself becomes another thing that looks fine and says nothing.
 */

const getEvidence = vi.fn<() => Promise<LearningEvidence | null>>();

vi.mock('@/services/learning.service', () => ({
  learningService: { getEvidence: () => getEvidence() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { LearningEvidenceCard } = await import('../LearningEvidenceCard');

const evidence = (over: Partial<LearningEvidence> = {}): LearningEvidence => ({
  organizationId: 4,
  windowDays: 90,
  domains: [
    {
      domain: 'reply_style',
      unit: 'edited AI drafts',
      count: 0,
      lastAt: null,
      threshold: { met: false, describe: '0/10 edits · 0/5 conversations · 0/1 agents' },
      note: 'Nothing captured yet. Only replies sent from the app, starting from an AI draft, produce evidence here.',
    },
    {
      domain: 'kb_quality',
      unit: 'documents with a quality signal',
      count: 2,
      lastAt: '2026-09-01T10:00:00Z',
      note: '5 accepts, 1 rejects',
    },
    {
      domain: 'routing',
      unit: 'learned routing rules',
      count: 13,
      lastAt: '2026-07-01T00:00:00Z',
      note: '0 routing corrections in the last 90 days',
    },
    {
      domain: 'spam',
      unit: 'learned spam rules',
      count: 0,
      lastAt: null,
      note: '0 spam corrections in the last 90 days (seeded rules are not counted above)',
    },
  ],
  ...over,
});

beforeEach(() => {
  getEvidence.mockReset();
  getEvidence.mockResolvedValue(evidence());
});
afterEach(cleanup);

describe('LearningEvidenceCard', () => {
  it('shows each domain with its unit, so a number cannot be read as the wrong thing', async () => {
    render(<LearningEvidenceCard />);
    expect(await screen.findByText('Reply Style')).toBeInTheDocument();
    expect(screen.getByText('edited AI drafts')).toBeInTheDocument();
    expect(screen.getByText('documents with a quality signal')).toBeInTheDocument();
    expect(screen.getByText('learned routing rules')).toBeInTheDocument();
    expect(screen.getByText('learned spam rules')).toBeInTheDocument();
  });

  it('titles every domain the endpoint returns, never a raw key', async () => {
    // A domain added on the backend after this file was written renders as `spam`
    // rather than "Spam" unless the map keeps up — which is what happened.
    render(<LearningEvidenceCard />);
    expect(await screen.findByText('Spam')).toBeInTheDocument();
    expect(screen.queryByText('spam')).not.toBeInTheDocument();
  });

  it('explains a zero instead of leaving it to be diagnosed', async () => {
    // A bare 0 sends someone hunting for a bug; the usual cause is a team replying
    // from its own mail client, which cannot carry the draft it started from.
    render(<LearningEvidenceCard />);
    expect(await screen.findByText(/only replies sent from the app/i)).toBeInTheDocument();
  });

  it('keeps the last-signal date, which is half the diagnosis for routing', async () => {
    // 13 rules and 0 recent corrections is "the input dried up"; 0 rules with
    // corrections arriving is "something is refusing to mint". The count alone
    // cannot separate them.
    render(<LearningEvidenceCard />);
    expect(await screen.findByText('13')).toBeInTheDocument();
    expect(screen.getByText(/0 routing corrections/)).toBeInTheDocument();
  });

  it('says it measures input, not health', async () => {
    render(<LearningEvidenceCard />);
    expect(await screen.findByText(/not a health check/i)).toBeInTheDocument();
  });

  it('renders NOTHING when the backend has no such route yet', async () => {
    // The service turns a 404 into null. A frontend ahead of its backend is a
    // deploy-order fact; an error box would report it as a fault in the workspace.
    getEvidence.mockResolvedValue(null);
    const { container } = render(<LearningEvidenceCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows a real failure rather than hiding it', async () => {
    getEvidence.mockRejectedValue(new Error('boom'));
    render(<LearningEvidenceCard />);
    expect(await screen.findByText(/could not load learning activity/i)).toBeInTheDocument();
  });
});
