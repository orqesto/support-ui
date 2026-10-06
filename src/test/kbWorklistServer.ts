/**
 * A fake support-service for the KB cases worklist tests: it keeps state, so an action changes
 * what the next report and rows read say. Used under the REAL api-client (see apiTransport.ts).
 */
import { ok, routeAbsent, type WireRequest } from '@/test/apiTransport';
import { report as reportFixture, row } from '@/test/kbCasesReportFixture';
import type { KbWorkRow, KbSetAsideReason } from '@/services/kbConsolidation.service';

// ---- the fake server -------------------------------------------------------------------------

/** A case question longer than the server's 200-character search cap. */
export const LONG_QUESTION = `Can I ${'really '.repeat(40)}return a gift I bought on sale?`;

export const workRow = (over: Partial<KbWorkRow> & { id: number }): KbWorkRow => ({
  title: null,
  question: `Question ${over.id}?`,
  answer: `Answer ${over.id}.`,
  status: 'pending',
  caseId: null,
  casePublicId: null,
  conversationId: null,
  conversationPublicId: null,
  canDecide: true,
  // BE sends both on every row (consolidationController KbWorkRow).
  publicId: null,
  isCase: false,
  canModerate: true,
  scopeKey: 'source:1',
  ...over,
});

export type Server = {
  entries: Map<number, KbWorkRow>;
  reasons: Map<number, KbSetAsideReason>;
  /** What each hide recorded (BE `typeData.hiddenWasApproved`). */
  hiddenWasApproved?: Map<number, boolean>;
  /** A backend before the worklist: one department required, no setAside, no new routes. */
  legacy: boolean;
  rowsAbsent: boolean;
  unhideAbsent: boolean;
  attach: 'ok' | 'conflict' | 'absent';
  /** 'unsaid': 200 without the list; 'noop': that, and nothing changed. */
  detach?: 'ok' | 'conflict' | 'absent' | 'unsaid' | 'noop';
  /** The 409's `reason` when `detach` is 'conflict'. */
  detachReason?: string;
  /** The viewer is NOT org-level: "all" never takes in unlinked mailboxes (default: org-level). */
  departmentViewer?: boolean;
  /** A backend before case-row member counts and case-number search. */
  olderCaseRows?: boolean;
  /**
   * Add cases whose id is NOT their public number (same scope, same topic as KB-900): id 77 =
   * KB-1200; id 1200 = KB-5 (its internal id looks like KB-1200's number); id 88 has no number;
   * id 99 = KB-11200 (its number CONTAINS 1200).
   */
  numberCases?: boolean;
  /** Put another topic first (a re-sort between reads). */
  prependTopic?: boolean;
  /** Re-sort the "refund" topic's cases: its first case moves last (a different case leads). */
  reverseRows?: boolean;
  /** Case 950's scope in the report (default 'source:2'). */
  case950Scope?: string;
  /** The workspace's short code (`/organizations/current`); none = not answered. */
  orgCode?: string;
  /** The 409's `reason` when `attach` is 'conflict' (default already_in_case). */
  attachReason?: string;
  /** Entries someone else merged meanwhile: approving them answers 409. */
  mergedMeanwhile?: Set<number>;
  /** Reasons sent as-is in setAside (a newer backend's unknown reason). */
  rawReasons?: Map<number, string>;
  /** How many pages of cases the report says it has. */
  casesPages?: number;
  /** Entries a pending suggestion proposes for case 900 → that suggestion's id (BE pendingAttach). */
  pendingAttach?: Map<number, number>;
  /** Ids the viewer may not see: the rows route drops them silently. */
  invisible?: Set<number>;
  /** A backend before `classifying`: an edited entry leaves the set-aside list until grouped. */
  noClassifying?: boolean;
  /** Add case KB-4000 whose question is LONG_QUESTION (past the 200-character search cap). */
  longQuestion?: boolean;
  /** Hold the answer of a request until released (in-flight tests). */
  hold?: (request: WireRequest) => Promise<void> | null;
};
// Reset per test by resetServer(); importers read the live binding.
export let server: Server;

const freshServer = (): Server => ({
  entries: new Map(
    [
      workRow({
        id: 900,
        publicId: 'KB-900',
        question: 'How do refunds work?',
        status: 'approved',
        isCase: true,
      }),
      // A live case of ANOTHER scope: never offered as a place to move a source:1 entry.
      workRow({
        id: 950,
        publicId: 'KB-950',
        question: 'How long does shipping take?',
        status: 'approved',
        isCase: true,
        scopeKey: 'source:2',
      }),
      workRow({
        id: 11,
        status: 'hidden',
        caseId: 900,
        casePublicId: 'KB-900',
        conversationId: 5001,
        conversationPublicId: 'C-77',
      }),
      workRow({
        id: 12,
        status: 'hidden',
        caseId: 900,
        casePublicId: 'KB-900',
        conversationId: 5002,
        conversationPublicId: null,
      }),
      workRow({ id: 31, status: 'pending' }),
      workRow({
        id: 21,
        question: 'Hi, my order 5531 never came. Regards, Ann',
        status: 'pending',
        conversationId: 7001,
        conversationPublicId: 'C-1',
      }),
      workRow({ id: 22, status: 'pending' }),
      workRow({ id: 23, status: 'approved' }),
      workRow({ id: 24, status: 'hidden' }),
    ].map((entry) => [entry.id, entry])
  ),
  reasons: new Map<number, KbSetAsideReason>([
    [21, 'raw_email'],
    [22, 'awaiting_review'],
    [23, 'customer_specific'],
    [24, 'detached'],
  ]),
  legacy: false,
  rowsAbsent: false,
  unhideAbsent: false,
  attach: 'ok',
});

/** What a set-aside finding still counts: an entry not in a case, and not hidden by hand. */
export const setAsideNow = () =>
  [...server.reasons.entries()]
    .filter(([id, reason]) => {
      const entry = server.entries.get(id);
      if (!entry) return false;
      // BE: an entry proposed for a case sits in that case's row, not set aside.
      if (server.pendingAttach?.has(id)) return false;
      // BE: left a case — hidden (thread moved) or pending (taken out by hand) until decided.
      // (A stale case id on it is the skew test's; a merge clears the mark — see attach.)
      if (reason === 'detached') return entry.status === 'hidden' || entry.status === 'pending';
      if (entry.caseId !== null) return false;
      return entry.status !== 'hidden' && entry.status !== 'rejected';
    })
    .map(([entryId, reason]) => ({ entryId, reason }));

/** BE round 4, written here on its own (not the app's matcher): numbers match EXACTLY. */
// Copied from the BE (consolidationController.ts `isCaseNumber`, be-kbwork-wt 41ee978b), not from
// the app: '#' dropped, leading zeros ignored on both sides, the public number with or without its
// prefix, the internal id only for a case with NO public number.
const numberIs = (needle: string, id: number, publicId: string | null): boolean => {
  const term = needle.replace(/^#/, '');
  const withoutLeadingZeros = (text: string): string =>
    text.replace(/^((?:[a-z]+-)?)0+(?=\d)/, '$1');
  const number = withoutLeadingZeros(term);
  if (!number) return false;
  const pub = withoutLeadingZeros((publicId ?? '').toLowerCase());
  return (
    (pub !== '' && (pub === number || pub.replace(/^[a-z]+-/, '') === number)) ||
    (publicId === null && /^\d+$/.test(number) && id === Number(number))
  );
};

const liveMembers = (caseId: number) => {
  const memberIds = [...server.entries.values()]
    .filter((entry) => entry.caseId === caseId)
    .map((entry) => entry.id)
    .sort((left, right) => left - right);
  return { memberCount: memberIds.length, memberIds };
};

export const reportNow = (departmentIds: number[]) => {
  const setAside = setAsideNow();
  const count = (reason: KbSetAsideReason) =>
    setAside.filter((item) => item.reason === reason).length;
  return reportFixture({
    headers: [
      // A topic sorted FIRST on some reads (a re-sort): identity keys keep the others mounted.
      ...(server.prependTopic
        ? [
            {
              label: 'billing questions',
              language: 'en',
              conversations: 1,
              rows: [row({ kind: 'single', scopeKey: 'source:1', entryIds: [] })],
            },
          ]
        : []),
      {
        // Names the departments it was built for, so a stale report is visible as such.
        label: `refund for ${departmentIds.join('+')}`,
        language: 'en',
        conversations: 7,
        rows: ((rows) => (server.reverseRows ? [...rows.slice(1), ...rows.slice(0, 1)] : rows))([
          // Gone once unmerged.
          ...(server.entries.has(900)
            ? [
                row({
                  kind: 'case',
                  caseId: 900,
                  scopeKey: 'source:1',
                  casePublicId: 'KB-900',
                  question: 'How do refunds work?',
                  questions: [],
                  standardAnswer: 'Refunds take 5 days.',
                  // Its members as they are NOW (a removal or a move shows on the next read),
                  // then the entries a pending suggestion proposes for it (BE order).
                  entryIds: [
                    ...[...server.entries.values()]
                      .filter((entry) => entry.caseId === 900)
                      .map((entry) => entry.id)
                      .sort((left, right) => left - right),
                    ...(server.pendingAttach ? [...server.pendingAttach.keys()] : []),
                  ],
                  ...(server.olderCaseRows || !server.pendingAttach
                    ? {}
                    : {
                        pendingAttach: [...server.pendingAttach].map(([entryId, suggestionId]) => ({
                          entryId,
                          suggestionId,
                        })),
                        pendingAttachIds: [...server.pendingAttach.keys()],
                      }),
                  // The newer backend counts its LIVE members (the `last_member` rule).
                  ...(server.olderCaseRows ? {} : liveMembers(900)),
                }),
              ]
            : []),
          row({
            kind: 'case',
            caseId: 950,
            scopeKey: server.case950Scope ?? 'source:2',
            casePublicId: 'KB-950',
            question: 'How long does shipping take?',
            questions: [],
            standardAnswer: 'Shipping takes 3 days.',
            entryIds: [],
            ...(server.olderCaseRows ? {} : { memberCount: 0, memberIds: [] }),
          }),
          ...(server.numberCases
            ? (
                [
                  [77, 'KB-1200', 'Do you ship abroad?'],
                  [1200, 'KB-5', 'Do you sell gift cards?'],
                  [88, null, 'How do loyalty points work?'],
                  [99, 'KB-11200', 'Can I return a gift?'],
                ] as const
              ).map(([caseId, casePublicId, question]) =>
                row({
                  kind: 'case',
                  caseId,
                  scopeKey: 'source:1',
                  casePublicId,
                  question,
                  questions: [],
                  standardAnswer: 'An answer.',
                  entryIds: [],
                  ...(server.olderCaseRows ? {} : { memberCount: 0, memberIds: [] }),
                })
              )
            : []),
          ...(server.longQuestion
            ? [
                row({
                  kind: 'case',
                  caseId: 4000,
                  scopeKey: 'source:1',
                  casePublicId: 'KB-4000',
                  question: LONG_QUESTION,
                  questions: [],
                  standardAnswer: 'Within 30 days.',
                  entryIds: [],
                  memberCount: 0,
                  memberIds: [],
                }),
              ]
            : []),
          row({ kind: 'single', scopeKey: 'source:1', entryIds: [31] }),
        ]),
      },
    ],
    findings: {
      rawEmails: count('raw_email'),
      awaitingKbReview: count('awaiting_review'),
      judgedCustomerSpecific: count('customer_specific'),
      couldNotClassify: count('unclassified'),
      noClearLanguage: count('no_clear_language'),
      detached: count('detached'),
      possibleDuplicates: [],
    },
    classifying: { settled: 50, total: 50, beyondBound: 0, outOfReach: 0 },
    pagination: {
      page: 1,
      pageSize: 25,
      total: 25 * (server.casesPages ?? 1),
      totalPages: server.casesPages ?? 1,
    },
    ...(server.legacy
      ? {}
      : {
          setAside: [
            ...setAside,
            ...[...(server.rawReasons ?? new Map<number, string>())].map(([entryId, reason]) => ({
              entryId,
              reason,
            })),
          ] as typeof setAside,
          departmentIds,
        }),
  });
};

const entryAction = /^\/api\/knowledge-base\/entries\/(\d+)\/(approve|hide|reject|unhide)$/;

export const handle = async (request: WireRequest) => {
  const held = server.hold?.(request);
  if (held) await held;
  const { method, path } = request;
  if (path === '/api/knowledge-base/consolidation/run')
    return { status: 404, data: { success: false, error: 'Not found' } };
  if (method === 'GET' && path === '/api/knowledge-base/consolidation/cases') {
    if (server.legacy) {
      if (!request.params.departmentId)
        return { status: 400, data: { success: false, error: "'departmentId' is required" } };
      return ok(reportNow([Number(request.params.departmentId)]));
    }
    const ids = request.params.departmentIds
      ? request.params.departmentIds.split(',').map(Number)
      : [4, 7];
    const built = {
      ...reportNow(ids),
      // BE: only with NO department asked for, and only for an org-level viewer.
      unassignedScopes: !request.params.departmentIds && !server.departmentViewer,
    };
    // As the BE searches: whole TOPICS (headers) across every page — by the topic label, any of
    // its cases' questions, and (the newer backend) a case number — and a matched topic keeps
    // ALL its cases.
    // BE parseCasesQuery: trimmed, cut at 200 characters, lower-cased.
    const needle = (request.params.search ?? '').trim().slice(0, 200).toLowerCase();
    if (!needle) return ok(built);
    const hit = (text: string | null | undefined) => (text ?? '').toLowerCase().includes(needle);
    return ok({
      ...built,
      headers: built.headers.filter(
        (header) =>
          hit(header.label) ||
          header.rows.some(
            (caseRow) =>
              [caseRow.question, ...(caseRow.questions ?? [])].some(hit) ||
              (!server.olderCaseRows &&
                caseRow.caseId !== null &&
                numberIs(needle, caseRow.caseId, caseRow.casePublicId))
          )
      ),
    });
  }
  if (method === 'POST' && path === '/api/knowledge-base/consolidation/entries/rows') {
    if (server.legacy || server.rowsAbsent) return routeAbsent(request);
    const { ids } = request.body as { ids: number[] };
    // BE: in the order asked, each once; ids the viewer may not see dropped without a word;
    // every row carries rejectedAt / sourceDeleted / answerTruncated.
    return ok({
      rows: [...new Set(ids)].flatMap((id) => {
        const entry = server.entries.get(id);
        if (!entry || server.invisible?.has(id)) return [];
        return [
          {
            rejectedAt: null,
            sourceDeleted: false,
            answerTruncated: false,
            ...entry,
          },
        ];
      }),
    });
  }
  const attach = /^\/api\/knowledge-base\/consolidation\/cases\/(\d+)\/attach$/.exec(path);
  if (method === 'POST' && attach) {
    if (server.attach === 'absent') return routeAbsent(request);
    if (server.attach === 'conflict')
      return {
        status: 409,
        // The contract's 409 carries a `reason`; a message is optional.
        // BE consolidationController attachToCaseRoute: the reason rides in `data`.
        data: {
          success: false,
          message: 'The entries were not attached',
          data: { reason: server.attachReason ?? 'already_in_case', entryIds: [21] },
        },
      };
    const caseId = Number(attach[1]);
    const { entryIds } = request.body as { entryIds: number[] };
    // BE manual attach: the first refusal, in its order, refuses ALL (nothing is written).
    const caseRow = server.entries.get(caseId);
    // BE attachToCaseRoute: no such case (or not a case) ⇒ 404 before any per-entry check.
    if (!caseRow?.isCase) return { status: 404, data: { success: false, error: 'Case not found' } };
    const refusalOf = (id: number): string | null => {
      const entry = server.entries.get(id);
      if (caseRow.status !== 'approved') return 'case_not_live';
      if (!entry) return 'entry_gone';
      if (entry.isCase) return 'is_case';
      if (entry.caseId !== null) return 'already_in_case';
      if (entry.status === 'rejected') return 'rejected';
      if (entry.status === 'hidden') return 'hidden';
      if (entry.sourceDeleted) return 'source_deleted';
      if (!caseRow.scopeKey || entry.scopeKey !== caseRow.scopeKey) return 'other_scope';
      if (server.reasons.get(id) === 'awaiting_review') return 'under_review';
      return null;
    };
    const refused = entryIds.map(refusalOf).find((reason) => reason !== null);
    if (refused)
      return {
        status: 409,
        data: {
          success: false,
          message: 'The entries were not attached',
          data: { reason: refused, entryIds },
        },
      };
    for (const id of entryIds) {
      const entry = server.entries.get(id) as KbWorkRow;
      server.entries.set(id, { ...entry, status: 'hidden', caseId, casePublicId: `KB-${caseId}` });
      // BE: a merge ends "detached".
      if (server.reasons.get(id) === 'detached') server.reasons.delete(id);
    }
    return ok({ attached: entryIds });
  }
  const unmerge = /^\/api\/knowledge-base\/consolidation\/cases\/(\d+)\/unmerge$/.exec(path);
  if (method === 'POST' && unmerge) {
    const caseId = Number(unmerge[1]);
    if (!server.entries.has(caseId))
      return { status: 404, data: { success: false, error: 'Case not found' } };
    let restored = 0;
    for (const [id, entry] of server.entries)
      if (entry.caseId === caseId) {
        server.entries.set(id, { ...entry, status: 'approved', caseId: null, casePublicId: null });
        restored += 1;
      }
    server.entries.delete(caseId);
    return ok({ caseId, restored });
  }
  const detach = /^\/api\/knowledge-base\/consolidation\/cases\/(\d+)\/detach$/.exec(path);
  if (method === 'POST' && detach) {
    if ((server.detach ?? 'ok') === 'absent') return routeAbsent(request);
    if (server.detach === 'conflict')
      return {
        status: 409,
        data: {
          success: false,
          message: 'The entries were not detached',
          data: { reason: server.detachReason ?? 'not_member', entryIds: [] },
        },
      };
    if (server.detach === 'noop') return ok({});
    const { entryIds } = request.body as { entryIds: number[] };
    const caseId = Number(detach[1]);
    const members = [...server.entries.values()].filter((entry) => entry.caseId === caseId);
    // BE: `rejected` is checked before `last_member`.
    if (entryIds.some((id) => server.entries.get(id)?.status === 'rejected'))
      return {
        status: 409,
        data: {
          success: false,
          message: 'The entries were not detached',
          data: { reason: 'rejected', entryIds },
        },
      };
    if (members.every((entry) => entryIds.includes(entry.id)))
      return {
        status: 409,
        data: {
          success: false,
          message: 'The entries were not detached',
          data: { reason: 'last_member', entryIds },
        },
      };
    for (const id of entryIds) {
      const entry = server.entries.get(id) as KbWorkRow;
      server.entries.set(id, { ...entry, status: 'pending', caseId: null, casePublicId: null });
      // BE: a hand-detached entry stays set aside as `detached` until it is decided.
      server.reasons.set(id, 'detached');
    }
    return ok(server.detach === 'unsaid' ? {} : { detached: entryIds });
  }
  if (method === 'GET' && path === '/api/organizations/current') {
    return server.orgCode
      ? ok({ id: 42, name: 'Acme', code: server.orgCode })
      : routeAbsent(request);
  }
  const action = entryAction.exec(path);
  if (method === 'PATCH' && action) {
    const id = Number(action[1]);
    if (server.mergedMeanwhile?.has(id)) {
      const entry = server.entries.get(id) as KbWorkRow;
      server.entries.set(id, { ...entry, status: 'hidden', caseId: 900, casePublicId: 'KB-900' });
      return {
        status: 409,
        data: { success: false, error: 'This entry is part of a merged case' },
      };
    }
    const entry = server.entries.get(id) as KbWorkRow;
    const verb = action[2];
    server.hiddenWasApproved ??= new Map();
    const recorded = server.hiddenWasApproved;
    const reason = server.reasons.get(id);
    if (verb === 'unhide') {
      if (server.unhideAbsent) return routeAbsent(request);
      // BE kbEntryState unhideKBEntry: rejected / merged original ⇒ 409; else the recorded
      // approval comes back (none ⇒ pending); "detached" ends.
      if (entry.status === 'rejected')
        return {
          status: 409,
          data: { success: false, error: 'This entry was rejected. Approve it to bring it back.' },
        };
      if (entry.caseId !== null && reason !== 'detached')
        return {
          status: 409,
          data: { success: false, error: 'This entry is part of a merged case.' },
        };
      if (entry.status !== 'hidden')
        return ok({ id, approved: entry.status === 'approved', hidden: false });
      const approved: boolean = recorded.get(id) ?? false;
      recorded.delete(id);
      if (reason === 'detached') server.reasons.delete(id);
      server.entries.set(id, { ...entry, status: approved ? 'approved' : 'pending' });
      return ok({ id, approved, hidden: false });
    }
    if (verb === 'hide') {
      // BE hiddenFields: a hide records the approval (a second hide keeps the first record) and
      // ends a hand-detach ("detached" then means only a thread that moved mailbox).
      if (entry.status !== 'hidden') {
        recorded.set(id, entry.status === 'approved');
        if (reason === 'detached') server.reasons.delete(id);
      }
    } else {
      // Approve / reject: the record goes; a decided entry is no longer detached or under review.
      recorded.delete(id);
      if (reason === 'detached' || reason === 'awaiting_review') server.reasons.delete(id);
    }
    const status = verb === 'approve' ? 'approved' : verb === 'hide' ? 'hidden' : 'rejected';
    server.entries.set(id, {
      ...entry,
      status,
      ...(verb === 'reject' ? { rejectedAt: '2026-01-10T12:00:00.000Z' } : { rejectedAt: null }),
    });
    return ok(verb === 'reject' ? { id, rejectedAt: '2026-01-10T12:00:00.000Z' } : null);
  }
  const single = /^\/api\/knowledge-base\/entries\/(\d+)$/.exec(path);
  if (single) {
    const id = Number(single[1]);
    const entry = server.entries.get(id) as KbWorkRow;
    const full = (question: string, answer: string) => ({
      id,
      type: 'qa_pair',
      title: question,
      content: `Question: ${question}\n\nAnswer: ${answer}`,
      category: 'general',
      departmentId: 4,
      qualityScore: 0.9,
      approved: entry.status === 'approved',
      hidden: entry.status === 'hidden',
      usageCount: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      sourceDeleted: false,
      typeData: { question, answer },
    });
    if (method === 'GET') return ok(full(entry.question ?? '', entry.answer ?? ''));
    const body = request.body as { question: string; answer: string };
    server.entries.set(id, { ...entry, question: body.question, answer: body.answer });
    // BE: an edit is re-classified — kept on the list as `classifying` until the next run; an
    // older backend drops it from the list until then.
    if (!entry.isCase && entry.caseId === null) {
      if (server.noClassifying) server.reasons.delete(id);
      else server.reasons.set(id, 'classifying');
    }
    return ok(full(body.question, body.answer));
  }
  return routeAbsent(request);
};

export const resetServer = () => {
  server = freshServer();
};
