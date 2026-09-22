/**
 * Reading the "not customer work" mark off a thread.
 *
 * ⛔ A binned thread and a resolved one are the same row apart from this mark, so a reader that
 * quietly returns null renders every binned thread as an ordinary resolution — which is exactly
 * the confusion the disposition was built to end.
 */
import { describe, it, expect } from 'vitest';
import { notCustomerWorkMark } from '../notCustomerWork';

const withMetadata = (metadata: unknown) =>
  ({ metadata }) as Parameters<typeof notCustomerWorkMark>[0];

describe('notCustomerWorkMark', () => {
  it('reads who decided, when and why', () => {
    const mark = notCustomerWorkMark(
      withMetadata({ notCustomerWork: { by: 3, at: '2026-09-22T10:00:00Z', reason: 'newsletter' } })
    );

    expect(mark).toEqual({ by: 3, at: '2026-09-22T10:00:00Z', reason: 'newsletter' });
  });

  it('returns null for an ordinary thread — and for one with no metadata at all', () => {
    expect(notCustomerWorkMark(withMetadata({}))).toBeNull();
    expect(notCustomerWorkMark(withMetadata(null))).toBeNull();
    expect(notCustomerWorkMark(withMetadata(undefined))).toBeNull();
  });

  it('🔴 refuses an unparseable date rather than letting the UI print "Invalid Date"', () => {
    const mark = notCustomerWorkMark(
      withMetadata({ notCustomerWork: { by: 3, at: 'whenever', reason: null } })
    );

    expect(mark?.at).toBeNull();
    // CONTROL: the mark itself still resolves, so the badge appears without a date rather than
    // disappearing — the thread IS binned, which is the more important fact.
    expect(mark).not.toBeNull();
  });

  it('treats an empty or blank reason as absent, so the UI renders no empty quotation marks', () => {
    expect(
      notCustomerWorkMark(withMetadata({ notCustomerWork: { by: 1, at: null, reason: '   ' } }))
        ?.reason
    ).toBeNull();
  });

  it('survives a stamp whose fields are the wrong types', () => {
    const mark = notCustomerWorkMark(
      withMetadata({ notCustomerWork: { by: 'someone', at: 42, reason: [] } })
    );

    expect(mark).toEqual({ by: null, at: null, reason: null });
  });
});
