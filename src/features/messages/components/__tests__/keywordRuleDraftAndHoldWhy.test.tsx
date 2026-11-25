/**
 * A keyword rule's kept reply is the team's own text: it is labelled RULE and named by its rule,
 * never "AI", and it is offered with AI drafts off (only a model's draft is hidden then). And a
 * hold the check explained (`details.why`: the meaning check on a rule's reply, a hold rule)
 * carries that line in the Activity. Invented data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Message } from '@/types';

const aiDrafts = { off: true, resolved: true };
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: aiDrafts.resolved }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSimilarResolvedMessages: () => Promise.resolve({ success: true, data: [] }),
  },
}));

import { AiTabPanel } from '../AiTabPanel';
import { ghostCaption, toGhostOption } from '../messageDetailConstants';
import { useGhostOption } from '../messageDetail/useGhostOption';
import { auditEntryLabel, holdWhyOf } from '../messageActivityTimeline';
import { AUTO_REPLY_REASON_FILTERS } from '../autoReplyReasons';

const RULE_TEXT = 'Our returns window is 30 days. Start a return at returns.example.com.';
// As the backend stores it (keywordAutoReply storeWithheldDraft): no confidence.
const RULE_DRAFT = {
  answer: RULE_TEXT,
  source: 'keyword_rule',
  keywordRule: { id: 4, name: 'Returns' },
  wouldSend: true,
};
const AI_DRAFT = { answer: 'The AI wrote this.', source: 'documentation', confidence: 0.9 };

let nextId = 700;
const messageWith = (suggestedAnswer: Record<string, unknown>) =>
  ({
    id: nextId++,
    sender: 'a@b.example',
    channel: 'email',
    createdAt: '2026-11-23T10:00:00Z',
    metadata: { suggestedAnswer },
  }) as unknown as Message;

beforeEach(() => {
  aiDrafts.off = true;
  aiDrafts.resolved = true;
});

describe("a keyword rule's kept reply", () => {
  it('is labelled RULE and captioned with the rule, never "AI"', () => {
    const option = toGhostOption(RULE_DRAFT);
    expect(option?.label).toBe('RULE');
    expect(ghostCaption(option!)).toBe('Keyword rule "Returns"');
    expect(ghostCaption(option!)).not.toMatch(/AI/);
    // A rule with no stored name still says what wrote it.
    expect(ghostCaption(toGhostOption({ ...RULE_DRAFT, keywordRule: null })!)).toBe('Keyword rule');
  });

  it('CONTROL: a model-written draft keeps "AI suggestion"', () => {
    const option = toGhostOption(AI_DRAFT);
    expect(option?.label).toBe('DOCS');
    expect(ghostCaption(option!)).toBe('AI suggestion · 90%');
  });

  it('is offered in the AI tab with AI drafts off, as RULE with its rule named', async () => {
    const onOptionsLoaded = vi.fn();
    render(
      <MemoryRouter>
        <AiTabPanel
          message={messageWith(RULE_DRAFT)}
          onGhostClick={() => {}}
          onOptionsLoaded={onOptionsLoaded}
          section="suggested"
        />
      </MemoryRouter>
    );
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenLastCalledWith(1));
    expect(screen.getByText(RULE_TEXT)).toBeInTheDocument();
    expect(screen.getAllByText('RULE').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Keyword rule "Returns"/).length).toBeGreaterThan(0);
  });

  it('CONTROL: a model-written draft is not offered in the AI tab with AI drafts off', async () => {
    const onOptionsLoaded = vi.fn();
    render(
      <MemoryRouter>
        <AiTabPanel
          message={messageWith(AI_DRAFT)}
          onGhostClick={() => {}}
          onOptionsLoaded={onOptionsLoaded}
          section="suggested"
        />
      </MemoryRouter>
    );
    await waitFor(() => expect(onOptionsLoaded).toHaveBeenCalled());
    expect(onOptionsLoaded).toHaveBeenLastCalledWith(0);
    expect(screen.queryByText(AI_DRAFT.answer)).toBeNull();
  });

  it("is the thread's ghost with AI drafts off; a model's draft is not (control)", () => {
    // One message object per hook: a new id each render would reset the ghost every render.
    const ruleMessage = messageWith(RULE_DRAFT);
    const rule = renderHook(() => useGhostOption(ruleMessage, false));
    expect(rule.result.current.ghostOption?.answer).toBe(RULE_TEXT);
    const modelMessage = messageWith(AI_DRAFT);
    const model = renderHook(() => useGhostOption(modelMessage, false));
    expect(model.result.current.ghostOption).toBeNull();
  });
});

describe("a hold's own line (`details.why`) in the Activity", () => {
  const ruleHold = (why: unknown, reason = 'rule_not_asked') =>
    auditEntryLabel('message.auto_reply_withheld', {
      reason,
      ruleIds: [4],
      ruleNames: ['Returns'],
      why,
    });

  it('the meaning check says why after the reason', () => {
    expect(ruleHold('  the customer asks about delivery times,\n not returns ')).toBe(
      'Keyword rule "Returns" matched but its reply did not go out: the customer\'s message does not ask what this rule answers — the customer asks about delivery times, not returns'
    );
  });

  it('a dose-rule hold of the AI reply says it was the dose', () => {
    expect(
      auditEntryLabel('message.auto_reply_withheld', {
        reason: 'restricted_topic',
        source: 'ai_reply',
        detail:
          'The check every automatic reply passes held this reply: it was kept as a draft for a person.',
        why: 'the reply states an amount with a unit of measure (built-in hold rule)',
      })
    ).toBe(
      'The automatic reply was not sent: the customer asks about a restricted topic, or the reply states an amount with a unit of measure — the reply states an amount with a unit of measure (built-in hold rule)'
    );
  });

  it('a long line is capped at 200 characters', () => {
    const why = holdWhyOf({ why: `the reason ${'x'.repeat(400)}` });
    expect(why).toHaveLength(200);
    expect(why?.endsWith('…')).toBe(true);
  });

  it.each([[undefined], [''], ['   '], ['rule_not_asked'], [42]])(
    'CONTROL: no sentence (%s), nothing appended',
    (why) => {
      expect(ruleHold(why)).toBe(
        'Keyword rule "Returns" matched but its reply did not go out: the customer\'s message does not ask what this rule answers'
      );
    }
  );

  it('the Audit Logs filter names both cases of restricted_topic, under the same key', () => {
    expect(AUTO_REPLY_REASON_FILTERS.find((filter) => filter.value === 'restricted_topic')).toEqual(
      { value: 'restricted_topic', label: 'A restricted topic, or an amount with a unit' }
    );
  });
});
