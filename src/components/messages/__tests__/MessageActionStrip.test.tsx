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

const renderStrip = (message: Message, extra: Record<string, unknown> = {}) =>
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
      {...extra}
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

/**
 * The "not customer work" disposition (support-service #804, support-ui #450).
 *
 * ⛔ The two things an agent must be able to SEE: that the action exists on a live thread, and
 * that a binned thread does not look like a resolved one. The second is the harder half — a
 * binned row is `closed` like any other, so without the badge an agent cannot tell what a
 * colleague decided, and the missing resolved-count entry has no explanation anywhere.
 */
describe('MessageActionStrip — not customer work', () => {
  const binned = (reason: string | null = 'newsletter') =>
    makeMessage({
      status: 'closed' as ThreadStatus,
      metadata: { notCustomerWork: { by: 3, at: '2026-09-22T10:00:00Z', reason } },
    });

  it('offers the action on an active thread', () => {
    renderStrip(makeMessage({ status: 'pending' as ThreadStatus, lastReplyFromClient: true }), {
      onNotCustomerWork: vi.fn(),
    });

    expect(screen.getByText('Not customer work')).toBeTruthy();
  });

  it('🔴 offers it on an UNREVIEWED thread — where a newsletter actually sits', () => {
    // status 'open' with no customer reply is the shape junk arrives in. The action was missing
    // from this branch in the first version of this change: present everywhere except the one
    // place an agent needs it.
    renderStrip(makeMessage({ status: 'open' as ThreadStatus }), { onNotCustomerWork: vi.fn() });

    expect(screen.getByText('Not customer work')).toBeTruthy();
    // CONTROL: the ordinary resolve is still there — this adds an action, it does not replace one.
    expect(screen.getByText('Resolve (no KB)')).toBeTruthy();
  });

  it('does not offer it when the caller wires no handler', () => {
    // CONTROL: proves the assertion above is about the prop, not about a button that always
    // renders — an action that 400s is worse than an absent one.
    renderStrip(makeMessage({ status: 'pending' as ThreadStatus, lastReplyFromClient: true }));

    expect(screen.queryByText('Not customer work')).toBeNull();
  });

  it('🔴 labels a binned thread as binned, not as Closed', () => {
    renderStrip(binned());

    expect(screen.getByText(/Not customer work/)).toBeTruthy();
    expect(screen.queryByText('Closed')).toBeNull();
    expect(screen.getByText(/newsletter/)).toBeTruthy();
  });

  it('CONTROL: an ordinary closed thread still reads Closed and still offers Save to KB', () => {
    renderStrip(makeMessage({ status: 'closed' as ThreadStatus }), { onPromoteToKb: vi.fn() });

    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.getByText('Save to KB')).toBeTruthy();
  });

  it('withholds Save to KB on a binned thread — the backend refuses it', () => {
    renderStrip(binned(), { onPromoteToKb: vi.fn() });

    expect(screen.queryByText('Save to KB')).toBeNull();
    // Reopen stays: it is the undo, and the backend strips the mark on unresolve.
    expect(screen.getByText('Reopen')).toBeTruthy();
  });

  it('renders no empty quotation marks when no reason was given', () => {
    renderStrip(binned(null));

    expect(screen.getByText(/Not customer work/)).toBeTruthy();
    expect(screen.queryByText('“”')).toBeNull();
  });
});
