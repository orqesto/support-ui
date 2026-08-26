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
