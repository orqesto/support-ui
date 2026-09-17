import { describe, expect, it } from 'vitest';
import { replyToLabel } from '../RecipientFields';

describe('replyToLabel', () => {
  it("shows the customer's Reply-To, which is where the backend sends (SUP-19)", () => {
    expect(
      replyToLabel({ sender: 'mp@deals.badideas.fund', defaultReplyTo: ['deals@badideas.fund'] })
    ).toBe('deals@badideas.fund');
  });

  it('lists every Reply-To address', () => {
    expect(
      replyToLabel({ sender: 'a@x.example', defaultReplyTo: ['b@x.example', 'c@x.example'] })
    ).toBe('b@x.example, c@x.example');
  });

  it('falls back to the requester when the field is absent or empty', () => {
    expect(replyToLabel({ sender: 'a@x.example' })).toBe('a@x.example');
    expect(replyToLabel({ sender: 'a@x.example', defaultReplyTo: [] })).toBe('a@x.example');
  });
});
