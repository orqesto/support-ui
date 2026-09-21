/**
 * A spam verdict a person cannot argue with.
 *
 * `isSpam: true` with `status: 'open'` is a reachable state, and it was the worst of both: the
 * verdict hides the conversation from the work queue, the header renders a red SPAM badge, and
 * neither the action strip nor the ACTIONS menu offered any way to say "this is not spam". The
 * strip only rendered its approve button for `filtered` and `suspicious`.
 *
 * On a client deployment that state held real customer enquiries for a month. Worse, the missing
 * button is also the missing FEEDBACK: approving is what contradicts the rules that produced the
 * verdict, so an unreachable correction means the rule that got it wrong never learns it was
 * wrong. The bad rule in that incident would have retired itself if anyone could have pressed it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MessageActionStrip } from '@/components/messages/MessageActionStrip';

afterEach(cleanup);

const message = (over: Record<string, unknown> = {}) =>
  ({
    id: 8434,
    status: 'open',
    subject: 'Teachtaireacht ó chustaiméir nua',
    requesterEmail: 'mailer@shopify.com',
    channel: 'email',
    metadata: { spamCheck: { isSpam: true, category: 'spam' } },
    ...over,
  }) as never;

const strip = (over: Record<string, unknown> = {}) => (
  <MessageActionStrip
    message={message()}
    isFiltered={false}
    isSuspicious={false}
    isActive={false}
    resolving={false}
    hasLinkedTicket={false}
    onResolveWithoutReply={() => {}}
    setRejectDialogOpen={() => {}}
    setReopenDialogOpen={() => {}}
    {...(over as object)}
  />
);

describe('a spam verdict outside triage', () => {
  it('offers a way to say it is not spam', async () => {
    const onClassify = vi.fn().mockResolvedValue(undefined);
    render(strip({ isSpamFlaggedOutsideTriage: true, onClassify }));

    const button = await screen.findByRole('button', { name: /Not Spam — Approve/ });
    fireEvent.click(button);

    await waitFor(() => expect(onClassify).toHaveBeenCalledWith('approve', undefined, undefined));
  });

  it('says WHY the conversation is missing from the inbox', async () => {
    // "Flagged as spam" alone explains the badge but not the disappearance, and the disappearance
    // is what sends someone to check whether the product is broken.
    render(strip({ isSpamFlaggedOutsideTriage: true, onClassify: vi.fn() }));
    expect(await screen.findByText(/hidden from the inbox until approved/)).toBeInTheDocument();
  });

  it('renders nothing new when the conversation carries no spam verdict', () => {
    // The control. Without it, a branch that rendered unconditionally would pass every assertion
    // above while putting a "Not Spam" button on every conversation in the app.
    render(
      strip({
        message: message({ metadata: { spamCheck: { isSpam: false } } }),
        isSpamFlaggedOutsideTriage: false,
        isActive: true,
        onClassify: vi.fn(),
      })
    );
    expect(screen.queryByRole('button', { name: /Not Spam/ })).toBeNull();
  });

  it('does not take over the triage states, which have their own richer controls', () => {
    // `filtered` and `suspicious` offer category-aware labels and the "teach the filter" toggles.
    // This branch must sit after them, not in front.
    render(strip({ isFiltered: true, isSpamFlaggedOutsideTriage: true, onClassify: vi.fn() }));
    expect(screen.queryByText(/hidden from the inbox until approved/)).toBeNull();
  });
});

/**
 * Confirming spam (SP-D1) — the action the backend has offered since #757 and no UI could reach.
 *
 * The system putting a thread in spam and a PERSON agreeing are different facts. The second one
 * is what the `spam_unconfirmed` / `spam_confirmed` halves partition on, so a queue an agent
 * works is only possible once this button exists.
 */
describe('confirming a spam thread', () => {
  const spamThread = (over: Record<string, unknown> = {}) =>
    message({ status: 'filtered', metadata: { spamCheck: { isSpam: true, category: 'spam' } }, ...over });

  it('offers the confirmation on a filtered spam thread nobody has confirmed', async () => {
    const onClassify = vi.fn().mockResolvedValue(undefined);
    render(strip({ message: spamThread({ spamConfirmedAt: null }), isFiltered: true, onClassify }));

    const button = await screen.findByRole('button', { name: /Confirm — it is spam/ });
    fireEvent.click(button);

    // RED before this change: no such button exists, and the whole feature is unreachable.
    await waitFor(() =>
      expect(onClassify).toHaveBeenCalledWith('confirm_spam', undefined, undefined)
    );
  });

  it('⛔ never calls it a resolve (SP-D5)', async () => {
    /**
     * 🔴 A COPY CONSTRAINT FROM THE BACKEND, not a preference. A confirmed spam thread keeps
     * `status='filtered'`, so it never appears in the Resolved column — an agent told they
     * "resolved" it would go looking where it can never be. The backend comment says the action
     * must not be labelled "Resolve and move to spam" in any UI.
     */
    render(strip({ message: spamThread({ spamConfirmedAt: null }), isFiltered: true, onClassify: vi.fn() }));

    await screen.findByRole('button', { name: /Confirm — it is spam/ });
    expect(screen.queryByText(/resolve/i)).toBeNull();
  });

  it('shows WHEN it was confirmed, and stops offering the button', async () => {
    render(
      strip({
        message: spamThread({ spamConfirmedAt: '2026-09-20T09:30:00.000Z' }),
        isFiltered: true,
        onClassify: vi.fn(),
      })
    );

    expect(await screen.findByText(/Confirmed as spam on/)).toBeInTheDocument();
    // The confirmation has to be VISIBLE or every agent repeats it — the defect that made the
    // backend field necessary in the first place.
    expect(screen.queryByRole('button', { name: /Confirm — it is spam/ })).toBeNull();
  });

  it('⚠️ still offers it when the deployment does not send the field at all', async () => {
    /**
     * ⛔ THE SKEW CONTROL. This frontend deploys on a merge and the backend on a tag, so a bundle
     * meets responses with no `spamConfirmedAt`. Undefined means "cannot tell me", not "not
     * confirmed": pressing the button then still works, so offering it is honest — whereas
     * rendering "not yet confirmed" would assert an agent's work state we were never told.
     * RED: treat undefined as confirmed and the button disappears on every older backend.
     */
    const noField = spamThread();
    render(strip({ message: noField, isFiltered: true, onClassify: vi.fn() }));

    expect(await screen.findByRole('button', { name: /Confirm — it is spam/ })).toBeInTheDocument();
    expect(screen.queryByText(/Confirmed as spam on/)).toBeNull();
  });

  it('⛔ offers nothing to confirm on a filtered thread that is NOT spam', () => {
    // The control. `filtered` also covers not-analysed and archived rows, and a confirm button
    // on those would confirm a verdict the system never made.
    render(
      strip({
        message: message({ status: 'filtered', metadata: { spamCheck: { isSpam: false, category: 'legitimate' } } }),
        isFiltered: true,
        onClassify: vi.fn(),
      })
    );

    expect(screen.queryByRole('button', { name: /Confirm — it is spam/ })).toBeNull();
  });
});
