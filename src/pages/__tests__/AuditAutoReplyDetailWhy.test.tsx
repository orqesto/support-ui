/**
 * The Audit Logs row of a held automatic reply shows the backend's own sentence (`detail`) and the
 * check's own line (`why`) — the latter alone when there is no sentence, and never twice.
 * Invented data.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AUTO_REPLY_WITHHELD, AuditAutoReplyDetail } from '../AuditAutoReplyDetail';

afterEach(cleanup);

const WHY = 'the customer asks about delivery times, not returns';
const show = (details: Record<string, unknown>, action = AUTO_REPLY_WITHHELD) =>
  render(
    <MemoryRouter>
      <AuditAutoReplyDetail action={action} entityId={12} details={details} />
    </MemoryRouter>
  );

describe('Audit row of a held reply — why', () => {
  it('a keyword-rule hold with no sentence: the check’s line is shown', () => {
    show({ reason: 'rule_not_asked', ruleNames: ['Returns'], conversationId: 12, why: WHY });
    expect(screen.getByText(`Why: ${WHY}`)).toBeInTheDocument();
    // Once: not also in the line above it.
    expect(screen.getAllByText(new RegExp(WHY))).toHaveLength(1);
  });

  it('a sentence and a line: both, the line after it', () => {
    const detail =
      'The check every automatic reply passes held this reply: it was kept as a draft for a person.';
    show({
      reason: 'restricted_topic',
      source: 'ai_reply',
      conversationId: 12,
      detail,
      why: 'the reply states an amount in a dose unit (fixed dose rule)',
    });
    expect(screen.getByText(detail)).toBeInTheDocument();
    expect(
      screen.getByText('Why: the reply states an amount in a dose unit (fixed dose rule)')
    ).toBeInTheDocument();
  });

  it('CONTROL: no `why`, no "Why:" line', () => {
    show({ reason: 'rule_not_asked', ruleNames: ['Returns'], conversationId: 12 });
    expect(screen.queryByText(/^Why:/)).toBeNull();
  });
});
