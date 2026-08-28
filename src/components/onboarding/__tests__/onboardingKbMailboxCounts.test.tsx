/**
 * A mailbox the user just connected must count as a connected channel — including one
 * ticked as a Knowledge Base source, because the step's own tip tells them to tick it.
 *
 * The wizard gated "Finish setup" on `!item.isKnowledgeBase`, and the Channels step hid
 * KB-marked mailboxes from its list and its count. So the happy path was:
 *
 *   read the tip → tick "Use as Knowledge Base source" → add the mailbox
 *     → "No email accounts configured" · "Not connected"
 *     → step 6: "To start your trial, finish setup: connect a channel"
 *     → wizard never completes → the server-side flip to managed AI never runs
 *     → "Odly's AI" reads as not connected on the dashboard
 *
 * All of it from one flag. Confirmed on staging: the source (org 21, type `email`,
 * `is_knowledge_base = true`) existed the whole time.
 *
 * 🔑 A KB-marked mailbox IS a live channel: everything arriving after its cutoff is live
 * mail. The largest client deployment runs exactly one mailbox, badged both Support and
 * Knowledge Base — so treating "KB" as "not a channel" is wrong on real data, not just
 * inconvenient here.
 */
import { describe, expect, it } from 'vitest';
import {
  isConnectedChannel,
  type ConnectableIntegration as Integration,
} from '@/components/onboarding/connectedChannel';

// Imported, NOT reimplemented. The bug existed in two copies because the wizard and the
// Channels step each kept their own; a test with a third copy could pass while the app
// stayed broken.

/** What the gate did before — kept so these tests can be shown to discriminate. */
const legacyIsConnectedChannel = (item: Integration): boolean =>
  (item.type === 'gmail' ||
    item.type === 'email' ||
    item.type === 'telegram' ||
    item.type === 'slack') &&
  !item.isKnowledgeBase;

const KB_MAILBOX: Integration = { type: 'email', isKnowledgeBase: true };
const PLAIN_MAILBOX: Integration = { type: 'email', isKnowledgeBase: false };

describe('onboarding channel detection', () => {
  it('counts a KB-marked mailbox as a connected channel', () => {
    expect([KB_MAILBOX].some(isConnectedChannel)).toBe(true);
  });

  it('CONTROL: the old predicate did not — this is the reported bug', () => {
    // Without this the test above would pass on an implementation that changed nothing.
    expect([KB_MAILBOX].some(legacyIsConnectedChannel)).toBe(false);
  });

  it('still counts an ordinary mailbox', () => {
    expect([PLAIN_MAILBOX].some(isConnectedChannel)).toBe(true);
  });

  it('still reports nothing connected when there is genuinely nothing', () => {
    // The gate must keep working: finishing starts a 14-day trial, and an org with no
    // channel at all cannot receive mail.
    expect([].some(isConnectedChannel)).toBe(false);
  });

  it('does not count a non-channel integration type', () => {
    expect([{ type: 'openai' } as Integration].some(isConnectedChannel)).toBe(false);
  });

  it('CONTROL: old and new agree on everything EXCEPT the KB flag', () => {
    // Pins the blast radius to exactly one input class.
    for (const type of ['gmail', 'email', 'telegram', 'slack', 'openai', 'whatsapp']) {
      const plain = { type, isKnowledgeBase: false };
      expect(isConnectedChannel(plain)).toBe(legacyIsConnectedChannel(plain));
    }
  });
});
