/**
 * A Cases report in the shape the backend sends (BE feat/kb-consolidation @ b9773d47:
 * casesReport.ts `buildCasesReport` + consolidationController `getCasesReportRoute`).
 */
import type { KbCaseRow, KbCasesReport } from '@/services/kbConsolidation.service';

export const row = (over: Partial<KbCaseRow>): KbCaseRow => ({
  kind: 'single',
  title: null,
  label: 'refund',
  language: 'en',
  scopeKey: 's:1',
  caseId: null,
  casePublicId: null,
  suggestionId: null,
  question: null,
  questions: ['Member question?'],
  standardAnswer: null,
  entryIds: [1],
  conversations: 2,
  customers: 2,
  firstSeen: '2026-09-01T00:00:00.000Z',
  lastSeen: '2026-09-20T00:00:00.000Z',
  source: 'support@acme.test',
  ...over,
});

export const report = (over: Partial<KbCasesReport> = {}): KbCasesReport => ({
  headers: [
    {
      label: 'refund',
      language: 'en',
      conversations: 7,
      rows: [
        row({
          kind: 'case',
          title: null,
          caseId: 900,
          casePublicId: 'KB-900',
          question: 'How do refunds work?',
          // casesReport.ts makeRow: a case row's `questions` is [], never null.
          questions: [],
          standardAnswer: 'Refunds take 5 days.',
          conversations: 5,
        }),
        row({ kind: 'proposed', title: 'proposed case — awaiting review', suggestionId: 70 }),
        // A non-case row that (wrongly) carries answer text must still not show it.
        row({ kind: 'group', title: 'unreviewed group', standardAnswer: 'AI DRAFT TEXT' }),
        // A "declined for case" group carries the case's id AND public id (casesReport.ts).
        row({
          kind: 'group',
          title: 'declined for case #KB-900',
          caseId: 900,
          casePublicId: 'KB-900',
        }),
        row({ kind: 'single' }),
      ],
    },
  ],
  pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
  footer: { belowQualityBar: 12 },
  findings: {
    rawEmails: 4,
    judgedCustomerSpecific: 2,
    couldNotClassify: 1,
    awaitingKbReview: 3,
    noClearLanguage: 1,
    detached: 1,
    possibleDuplicates: [{ caseIds: [900, 905], casePublicIds: ['KB-900', null] }],
  },
  // BE b9773d47: `total`/`settled` = what the job can reach; `outOfReach` = every input past the
  // bound (shown if labelled earlier, never proposed); `beyondBound` = those never classified.
  classifying: { settled: 40, total: 50, beyondBound: 0, outOfReach: 0 },
  bounded: false,
  miningOff: false,
  labellingActive: true,
  labellingMode: 'production',
  ...over,
});

export const zeroFindings = {
  rawEmails: 0,
  judgedCustomerSpecific: 0,
  couldNotClassify: 0,
  awaitingKbReview: 0,
  noClearLanguage: 0,
  detached: 0,
  possibleDuplicates: [],
};
