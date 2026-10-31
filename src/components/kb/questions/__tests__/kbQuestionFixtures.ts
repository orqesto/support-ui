import type { KbQuestion } from '@/services/kbEngine.types';

/** Invented questions for the F4 tests (no production text). */
export const mergeQuestion = (
  suggestionId = 1,
  overrides: Partial<KbQuestion> = {}
): KbQuestion => ({
  suggestionId,
  kind: 'merge',
  departmentId: 3,
  prompt: `Engine found 3 answers to the same question (fee ${suggestionId}). Merge them into one? 1 more answer is in this group.`,
  answers: [
    {
      entryId: 10 + suggestionId,
      label: 'A',
      question: 'What does sending an order again cost?',
      answer: 'Sending again costs 22 EUR.',
      evidence: {
        threads: 14,
        customers: 11,
        firstAt: '2026-07-02T10:00:00Z',
        lastAt: '2026-10-21T10:00:00Z',
        countries: [],
      },
    },
    {
      entryId: 20 + suggestionId,
      label: 'B',
      question: 'What does sending an order again cost?',
      answer: 'Sending again costs 28 EUR.',
      evidence: {
        threads: 9,
        customers: 8,
        firstAt: '2026-08-11T10:00:00Z',
        lastAt: '2026-10-27T10:00:00Z',
        countries: [],
      },
    },
  ],
  ruledOut: [],
  guess: null,
  usedInDraftsLast7d: null,
  choices: [
    { key: 'accept', label: 'Merge into one answer', needsText: false },
    { key: 'keep_separate', label: 'Keep separate', needsText: false },
    { key: 'both_wrong', label: 'Both wrong — write the answer', needsText: true },
  ],
  openedAt: '2026-10-27T10:00:00Z',
  ...overrides,
});

export const captureQuestion = (
  suggestionId = 2,
  overrides: Partial<KbQuestion> = {}
): KbQuestion => ({
  suggestionId,
  kind: 'capture_review',
  departmentId: 3,
  prompt: 'An agent saved this answer from a thread ("Opening hours"). Keep it?',
  answers: [
    {
      entryId: 30,
      label: 'A',
      question: 'When is the shop open?',
      answer: 'Monday to Friday, 9 to 17.',
      evidence: { threads: 0, customers: 0, firstAt: null, lastAt: null, countries: [] },
    },
  ],
  ruledOut: [],
  guess: null,
  usedInDraftsLast7d: null,
  choices: [
    { key: 'keep', label: 'Keep — make it live', needsText: false },
    { key: 'remove', label: 'Remove', needsText: false },
    { key: 'both_wrong', label: 'Wrong — write the answer', needsText: true },
  ],
  openedAt: '2026-10-29T10:00:00Z',
  ...overrides,
});
