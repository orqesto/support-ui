import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Message, ThreadStatus } from '@/types';
import { MessageActionStrip } from '../MessageActionStrip';

afterEach(cleanup);

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 1,
  channel: 'email',
  sender: 'customer@example.com',
  subject: 'Test',
  status: 'open',
  needsHumanReview: false,
  createdAt: '2026-01-01T10:00:00Z',
  metadata: {},
  ...overrides,
});

const renderStrip = (message: Message) =>
  render(
    <MessageActionStrip
      message={message}
      isFiltered={false}
      isSuspicious={false}
      isActive
      resolving={false}
      hasLinkedTicket={false}
      onReopen={vi.fn()}
      onDelete={vi.fn()}
      onClassify={vi.fn()}
      onResolveWithoutReply={vi.fn()}
      onClose={vi.fn()}
      setRejectDialogOpen={vi.fn()}
      setReopenDialogOpen={vi.fn()}
      onRefresh={vi.fn()}
    />
  );

// The action set an agent sees is gated by status + lastReplyFromClient. The key
// case: a customer-replied conversation whose status is still 'open'/'new' (the
// status→client_replied transition doesn't fire on every ingest path) must get the
// full active action set, not the unreviewed "resolve only" branch. Note "Create
// Ticket" now lives in the header ACTIONS dropdown, not this strip.
describe('MessageActionStrip — action set per status', () => {
  it('truly-new open (no client reply yet) offers only Resolve (no KB)', () => {
    renderStrip(makeMessage({ status: 'open', lastReplyFromClient: null }));
    expect(screen.getByText('Resolve (no KB)')).toBeInTheDocument();
    expect(screen.queryByText('Resolve & Save to KB')).toBeNull();
  });

  it('open + client replied gets the full active action set (regression for the CLIENT REPLIED badge case)', () => {
    renderStrip(makeMessage({ status: 'open', lastReplyFromClient: true }));
    expect(screen.getByText('Resolve & Save to KB')).toBeInTheDocument();
    expect(screen.getByText('Resolve (no KB)')).toBeInTheDocument();
  });

  it('client_replied status (BE value not in the FE union) gets the full active action set', () => {
    renderStrip(
      makeMessage({ status: 'client_replied' as ThreadStatus, lastReplyFromClient: true })
    );
    expect(screen.getByText('Resolve & Save to KB')).toBeInTheDocument();
    expect(screen.getByText('Resolve (no KB)')).toBeInTheDocument();
  });

  it('in_progress (active) gets the full active action set', () => {
    renderStrip(makeMessage({ status: 'in_progress' }));
    expect(screen.getByText('Resolve & Save to KB')).toBeInTheDocument();
    expect(screen.getByText('Resolve (no KB)')).toBeInTheDocument();
  });

  it('resolved shows Unresolve, not the active actions', () => {
    renderStrip(makeMessage({ status: 'resolved' }));
    expect(screen.getByText('Unresolve')).toBeInTheDocument();
    expect(screen.queryByText('Resolve & Save to KB')).toBeNull();
  });

  it('closed shows Reopen', () => {
    renderStrip(makeMessage({ status: 'closed' }));
    expect(screen.getByText('Reopen')).toBeInTheDocument();
    expect(screen.queryByText('Resolve & Save to KB')).toBeNull();
  });
});

/**
 * Orphaned outbound: our own sent mail with no inbound parent, saved as
 * `status='filtered'` + `metadata.orphanOutgoing`. It is never spam-classified,
 * so it carries no `spamCheck.category` and falls to the default filtered
 * metadata — whose button is literally "Approve — Move to Open", the only way
 * out of the orphan lens.
 */
describe('MessageActionStrip — orphaned outbound', () => {
  const orphan = makeMessage({
    status: 'filtered',
    metadata: { orphanOutgoing: true, orphanReason: 'no_parent_match' },
  });

  it('offers "Approve — Move to Open" for an orphan', () => {
    render(
      <MessageActionStrip
        message={orphan}
        isFiltered
        isSuspicious={false}
        isActive={false}
        resolving={false}
        onClassify={vi.fn()}
        onResolveWithoutReply={vi.fn()}
        setRejectDialogOpen={vi.fn()}
        setReopenDialogOpen={vi.fn()}
      />
    );
    expect(screen.getByText('Approve — Move to Open')).toBeTruthy();
  });

  it('renders NOTHING actionable when onClassify is missing', () => {
    // The regression: the whole block is gated on `isFiltered && onClassify`, so a
    // caller that omits the handler does not grey the button out — it removes the
    // only exit from the orphan lens, silently.
    render(
      <MessageActionStrip
        message={orphan}
        isFiltered
        isSuspicious={false}
        isActive={false}
        resolving={false}
        onResolveWithoutReply={vi.fn()}
        setRejectDialogOpen={vi.fn()}
        setReopenDialogOpen={vi.fn()}
      />
    );
    expect(screen.queryByText('Approve — Move to Open')).toBeNull();
  });

  it('calls classify with approve when clicked', () => {
    const onClassify = vi.fn<(action: string) => Promise<void>>();
    onClassify.mockResolvedValue(undefined);
    render(
      <MessageActionStrip
        message={orphan}
        isFiltered
        isSuspicious={false}
        isActive={false}
        resolving={false}
        onClassify={onClassify}
        onResolveWithoutReply={vi.fn()}
        setRejectDialogOpen={vi.fn()}
        setReopenDialogOpen={vi.fn()}
      />
    );
    screen.getByText('Approve — Move to Open').click();
    expect(onClassify).toHaveBeenCalledWith('approve', undefined, undefined);
  });
});
