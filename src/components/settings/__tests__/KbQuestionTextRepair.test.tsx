/**
 * Settings → System → Knowledge base repair → Clean captured questions (2026-10-07).
 * Pinned: Check writes nothing and opens the entries Apply would reject first; filter and paging
 * ask the backend for that slice; Apply exists only for the scope just checked and names its
 * counts before it writes; an older backend reads as "next release", not a broken button.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import type { KbQuestionTextRequest } from '@/services/system.service';

// Plain functions swapped per test (vitest 4: a rejection from a module-level vi.fn fails the run).
let repair: (body: KbQuestionTextRequest) => Promise<unknown>;
let listWorkspaces: () => Promise<unknown>;
const bodies: KbQuestionTextRequest[] = [];

vi.mock('@/services/system.service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    default: {
      repairKbQuestionText: (body: KbQuestionTextRequest) => {
        bodies.push(body);
        return repair(body);
      },
    },
  };
});
vi.mock('@/services/organization.service', () => ({
  organizationService: { getAllPages: () => listWorkspaces() },
}));

const { KbQuestionTextRepair, QUESTION_TEXT_NOT_DEPLOYED } = await import(
  '../KbQuestionTextRepair'
);
const { normalizeKbQuestionText } = await import('@/services/system.service');

const totals = (over: Record<string, unknown> = {}) => ({
  organizationId: 67,
  organizationName: 'DeusPower',
  checked: 120,
  cleaned: 80,
  unchanged: 25,
  uncertain: 10,
  rejected: 5,
  aiRewritten: 7,
  rawEmailBefore: 90,
  rawEmailAfter: 4,
  ...over,
});

const row = (id: number, action: string, over: Record<string, unknown> = {}) => ({
  id,
  organizationId: 67,
  kind: 'captured',
  approved: false,
  action,
  reasons: ['thanks_only'],
  before: { question: `before ${id} <b>raw</b>`, answer: 'a' },
  after: { question: `after ${id}`, answer: 'a' },
  aiQuestion: null,
  aiFallbackReason: null,
  ...over,
});

/** A dry-run answer: rows of the requested action (as a backend that filters would send). */
const answer = (body: KbQuestionTextRequest, tot = [totals()], total = 5) => ({
  success: true,
  data: normalizeKbQuestionText({
    dryRun: body.dryRun,
    organizationId: body.organizationId,
    totals: tot,
    rows: [row((body.offset ?? 0) + 1, body.action ?? 'clean')],
    pagination: { offset: body.offset ?? 0, limit: body.limit ?? 100, total },
    aiAvailable: true,
  }),
});

const routeAbsent = () =>
  Object.assign(new Error('Not found'), { status: 404, data: '<pre>Cannot POST</pre>' });

beforeEach(() => {
  bodies.length = 0;
  listWorkspaces = () =>
    Promise.resolve({
      data: [
        { id: 67, name: 'DeusPower' },
        { id: 3, name: 'Orbelli' },
      ],
    });
  repair = (body) => Promise.resolve(answer(body));
});
afterEach(cleanup);

const checkButton = () => screen.getByRole('button', { name: 'Check captured questions' });
const applyButton = () => screen.getByRole('button', { name: 'Apply question cleaning' });
const scopeSelect = () => screen.getByLabelText('Workspace');

describe('Clean captured questions', () => {
  it('Check is a dry run of the chosen workspace and opens the rejects first, with totals', async () => {
    render(<KbQuestionTextRepair workspace={67} />);
    await screen.findByRole('option', { name: 'Orbelli' });
    fireEvent.click(checkButton());

    await screen.findByText('before 1 <b>raw</b>'); // customer text rendered as text, not HTML
    expect(bodies).toEqual([
      { organizationId: 67, dryRun: true, offset: 0, limit: 50, action: 'reject' },
    ]);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Will reject')).toBeInTheDocument();
    expect(within(table).getByText('AI rewrites (sample)')).toBeInTheDocument();
    expect(within(table).getByText('90 → 4')).toBeInTheDocument();
    expect(within(table).getByText('80')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Entries before and after' });
    expect(within(list).getByText('Will reject')).toBeInTheDocument();
    expect(within(list).getByText('only a thank-you')).toBeInTheDocument();
    expect(screen.getByLabelText('Show')).toHaveValue('reject');
    expect(screen.getByText(/restorable for 90 days/)).toBeInTheDocument();
  });

  it('opens the uncertain entries when nothing would be rejected', async () => {
    repair = (body) => Promise.resolve(answer(body, [totals({ rejected: 0 })]));
    render(<KbQuestionTextRepair workspace={67} />);
    fireEvent.click(checkButton());
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toMatchObject({ action: 'uncertain', offset: 0 });
    expect(await screen.findByText('Uncertain — kept as is')).toBeInTheDocument();
  });

  it('the filter asks the backend for that action from the first page', async () => {
    render(<KbQuestionTextRepair workspace={67} />);
    fireEvent.click(checkButton());
    await screen.findByText('before 1 <b>raw</b>');
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'clean' } });
    await screen.findByText('after 1');
    // A page or a filter never asks for the AI sample again (it costs model calls).
    expect(bodies[1]).toEqual({
      organizationId: 67,
      dryRun: true,
      offset: 0,
      limit: 50,
      aiSample: 0,
      action: 'clean',
    });
    expect(screen.getByText('Question after')).toBeInTheDocument();
  });

  it('says so when the backend ignores the filter, and shows only the matching entries', async () => {
    repair = () =>
      Promise.resolve({
        success: true,
        data: normalizeKbQuestionText({
          dryRun: true,
          totals: [totals()],
          rows: [row(1, 'clean'), row(2, 'reject')],
          pagination: { offset: 0, limit: 50, total: 120 },
          aiAvailable: false,
        }),
      });
    render(<KbQuestionTextRepair workspace={67} />);
    fireEvent.click(checkButton());
    await screen.findByText('before 2 <b>raw</b>');
    expect(screen.queryByText('before 1 <b>raw</b>')).not.toBeInTheDocument();
    expect(screen.getByText(/does not filter the list yet/)).toBeInTheDocument();
    expect(screen.getByText(/cleaned by rules only/)).toBeInTheDocument();
  });

  it('pages through the list by offset', async () => {
    repair = (body) => Promise.resolve(answer(body, [totals()], 120));
    render(<KbQuestionTextRepair workspace={67} />);
    fireEvent.click(checkButton());
    await screen.findByText('before 1 <b>raw</b>');
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await screen.findByText('before 51 <b>raw</b>');
    expect(bodies[1]).toMatchObject({ offset: 50, limit: 50, action: 'reject', dryRun: true });
  });

  it('Apply is off before a Check and again after the scope changes', async () => {
    render(<KbQuestionTextRepair workspace={67} />);
    await screen.findByRole('option', { name: 'Orbelli' });
    expect(applyButton()).toBeDisabled();
    fireEvent.click(checkButton());
    await screen.findByText('before 1 <b>raw</b>');
    expect(applyButton()).not.toBeDisabled();

    fireEvent.change(scopeSelect(), { target: { value: '3' } });
    expect(applyButton()).toBeDisabled();
    expect(screen.queryByText('before 1 <b>raw</b>')).not.toBeInTheDocument();
    expect(bodies.every((body) => body.dryRun)).toBe(true);
  });

  it('drops a Check answer that arrives after the scope changed', async () => {
    let finish: (value: unknown) => void = () => undefined;
    repair = () => new Promise((resolve) => (finish = resolve));
    render(<KbQuestionTextRepair workspace={67} />);
    await screen.findByRole('option', { name: 'Orbelli' });
    fireEvent.click(checkButton());
    fireEvent.change(scopeSelect(), { target: { value: 'all' } });
    finish(answer({ organizationId: 67, dryRun: true, action: 'reject' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('before 1 <b>raw</b>')).not.toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
  });

  it('confirm names the counts; only the confirm sends the write, for the checked scope', async () => {
    render(<KbQuestionTextRepair workspace={67} />);
    await screen.findByRole('option', { name: 'Orbelli' });
    fireEvent.change(scopeSelect(), { target: { value: 'all' } });
    fireEvent.click(checkButton());
    await screen.findByText('before 1 <b>raw</b>');
    // Every workspace checked: each entry says whose it is.
    expect(
      within(screen.getByRole('list', { name: 'Entries before and after' })).getByText('DeusPower')
    ).toBeInTheDocument();
    fireEvent.click(applyButton());

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        /80 cleaned, 5 rejected \(restorable for 90 days\), 10 left for review\. Unapproved entries get an AI-written question — not only the sampled ones; .*Approved entries are cleaned without AI and are never approved or unapproved/
      )
    ).toBeInTheDocument();
    expect(bodies.every((body) => body.dryRun)).toBe(true);

    repair = (body) =>
      Promise.resolve(answer(body, [totals({ cleaned: 79, rejected: 5, aiRewritten: 30 })]));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply$/ }));
    await screen.findByText(/Applied — 79 entries cleaned, 5 rejected/);
    expect(bodies.at(-1)).toEqual({ organizationId: null, dryRun: false });
    expect(screen.getByText('AI rewritten')).toBeInTheDocument();
    expect(applyButton()).toBeDisabled(); // the check described the entries BEFORE the write
  });

  it('an older backend (no route) says the repair arrives with the next release', async () => {
    repair = () => Promise.reject(routeAbsent());
    render(<KbQuestionTextRepair workspace={67} />);
    fireEvent.click(checkButton());
    expect(await screen.findByText(QUESTION_TEXT_NOT_DEPLOYED)).toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
  });

  it('a 404 from the route itself is shown as its own message, not as "next release"', async () => {
    repair = () =>
      Promise.reject(
        Object.assign(new Error('Workspace not found'), {
          status: 404,
          data: { success: false, error: 'Workspace not found' },
        })
      );
    render(<KbQuestionTextRepair workspace={67} />);
    fireEvent.click(checkButton());
    expect(await screen.findByText('Workspace not found')).toBeInTheDocument();
    expect(screen.queryByText(QUESTION_TEXT_NOT_DEPLOYED)).not.toBeInTheDocument();
  });
});

describe('Clean captured questions — apply answers', () => {
  it('an apply answered as a dry run is an error, never "Applied"', async () => {
    render(<KbQuestionTextRepair workspace={67} />);
    fireEvent.click(checkButton());
    await screen.findByText('before 1 <b>raw</b>');
    fireEvent.click(applyButton());
    const dialog = await screen.findByRole('dialog');
    repair = (body) => Promise.resolve(answer({ ...body, dryRun: true }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply$/ }));
    expect(await screen.findByText(/nothing was written/)).toBeInTheDocument();
    expect(screen.queryByText(/^Applied/)).not.toBeInTheDocument();
  });

  it('an apply without totals does not claim zero changes', async () => {
    render(<KbQuestionTextRepair workspace={67} />);
    fireEvent.click(checkButton());
    await screen.findByText('before 1 <b>raw</b>');
    fireEvent.click(applyButton());
    const dialog = await screen.findByRole('dialog');
    repair = () =>
      Promise.resolve({ success: true, data: normalizeKbQuestionText({ dryRun: false }) });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply$/ }));
    expect(await screen.findByText(/did not report what it changed/)).toBeInTheDocument();
    expect(screen.queryByText(/0 entries cleaned/)).not.toBeInTheDocument();
  });
});

describe('normalizeKbQuestionText', () => {
  it('reads a partial answer without crashing and drops rows it cannot label', () => {
    const data = normalizeKbQuestionText({
      totals: [{ organizationId: 3 }],
      rows: [{ id: 1, action: 'explode' }, { id: 2, action: 'clean' }, 'junk'],
    });
    expect(data?.totals[0]).toMatchObject({ organizationId: 3, checked: 0, rawEmailAfter: 0 });
    expect(data?.rows.map((entry) => entry.id)).toEqual([2]);
    expect(data?.rows[0].before).toEqual({ question: '', answer: '' });
    expect(data?.pagination).toBeNull();
    expect(normalizeKbQuestionText(undefined)).toBeNull();
  });
});

/** An apply answer for one round of the loop. */
const applyRound = (
  body: KbQuestionTextRequest,
  tot: Record<string, unknown>[],
  page: { truncated?: boolean; nextCursor?: string | null } = {},
  error: string | null = null
) => ({
  success: true,
  data: normalizeKbQuestionText({
    dryRun: false,
    organizationId: body.organizationId,
    totals: tot,
    rows: [],
    pagination: {
      offset: body.offset ?? 0,
      limit: 100,
      total: 0,
      truncated: page.truncated ?? false,
      nextOffset: null,
      nextCursor: page.nextCursor ?? null,
    },
    aiAvailable: true,
    aiSamples: [],
    error,
  }),
});

const checkThenConfirm = async () => {
  render(<KbQuestionTextRepair workspace={67} />);
  fireEvent.click(checkButton());
  await screen.findByText('before 1 <b>raw</b>');
  fireEvent.click(applyButton());
  const dialog = await screen.findByRole('dialog');
  return dialog;
};

describe('Clean captured questions — audit 2026-10-07 (H3, M5)', () => {
  it('apply goes on from nextCursor until the server reaches the end, and adds the rounds up', async () => {
    const dialog = await checkThenConfirm();
    repair = (body) =>
      Promise.resolve(
        body.cursor === undefined
          ? applyRound(
              body,
              [totals({ checked: 3, cleaned: 2, rejected: 1, unchanged: 0, uncertain: 0 })],
              { truncated: true, nextCursor: '67:41' }
            )
          : applyRound(body, [
              totals({ checked: 4, cleaned: 4, rejected: 0, unchanged: 0, uncertain: 0 }),
            ])
      );
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply$/ }));
    await screen.findByText(/Applied — 6 entries cleaned, 1 rejected/);
    const applies = bodies.filter((body) => !body.dryRun);
    expect(applies.map((body) => body.cursor)).toEqual([undefined, '67:41']);
  });

  it('control: a round that returns the same cursor again stops the loop and says it is partial', async () => {
    const dialog = await checkThenConfirm();
    repair = (body) =>
      Promise.resolve(
        applyRound(body, [totals({ checked: 1, cleaned: 1, rejected: 0 })], {
          truncated: true,
          nextCursor: '67:9',
        })
      );
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply$/ }));
    expect(
      await screen.findByText('The repair stopped making progress — what it did is counted below.')
    ).toBeInTheDocument();
    expect(screen.getByText(/Partly applied — 2 entries cleaned/)).toBeInTheDocument();
    expect(bodies.filter((body) => !body.dryRun)).toHaveLength(2);
  });

  it('Stop ends the loop after the round in flight and reports what was done', async () => {
    const dialog = await checkThenConfirm();
    const gate: { release?: () => void } = {};
    repair = (body) =>
      new Promise((resolve) => {
        gate.release = () =>
          resolve(
            applyRound(body, [totals({ checked: 2, cleaned: 2, rejected: 0 })], {
              truncated: true,
              nextCursor: '67:5',
            })
          );
      });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    gate.release?.();
    expect(
      await screen.findByText(/Stopped — what was done so far is counted below/)
    ).toBeInTheDocument();
    expect(bodies.filter((body) => !body.dryRun)).toHaveLength(1);
    // …and the section is usable again: no "Applying…", Check and the workspace enabled (pass 3).
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Applying…/)).not.toBeInTheDocument();
    expect(checkButton()).not.toBeDisabled();
    expect(scopeSelect()).not.toBeDisabled();
  });

  it('a round that FAILS after Stop still reports what earlier rounds did, and frees the section', async () => {
    const dialog = await checkThenConfirm();
    const gate: { fail?: () => void } = {};
    let round = 0;
    repair = (body) => {
      round += 1;
      if (round === 1) {
        return Promise.resolve(
          applyRound(body, [totals({ checked: 2, cleaned: 2, rejected: 0 })], {
            truncated: true,
            nextCursor: '67:5',
          })
        );
      }
      return new Promise((_, reject) => {
        gate.fail = () => reject(new Error('connection reset'));
      });
    };
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(gate.fail).toBeDefined());
    gate.fail?.();
    expect(await screen.findByText(/Partly applied — 2 entries cleaned/)).toBeInTheDocument();
    expect(checkButton()).not.toBeDisabled();
  });

  it('leaving the section ends the loop — no further calls nobody sees', async () => {
    const dialog = await checkThenConfirm();
    const gate: { release?: () => void } = {};
    repair = (body) =>
      new Promise((resolve) => {
        gate.release = () =>
          resolve(
            applyRound(body, [totals({ checked: 2 })], { truncated: true, nextCursor: '67:5' })
          );
      });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply$/ }));
    await waitFor(() => expect(bodies.filter((body) => !body.dryRun)).toHaveLength(1));
    cleanup();
    gate.release?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bodies.filter((body) => !body.dryRun)).toHaveLength(1);
  });

  it('a run that stops on an error keeps the totals it reported and says so', async () => {
    const dialog = await checkThenConfirm();
    repair = (body) =>
      Promise.resolve(
        applyRound(body, [totals({ checked: 2, cleaned: 2, rejected: 0 })], {}, 'connection reset')
      );
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply$/ }));
    expect(
      await screen.findByText(/The repair stopped on an error: connection reset/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Partly applied — 2 entries cleaned/)).toBeInTheDocument();
  });

  it('failed rows are shown, not folded into the other columns', async () => {
    const dialog = await checkThenConfirm();
    repair = (body) =>
      Promise.resolve(
        applyRound(body, [totals({ checked: 10, cleaned: 7, failed: 3, rejected: 0 })])
      );
    fireEvent.click(within(dialog).getByRole('button', { name: /^Apply$/ }));
    expect(await screen.findByText(/3 entries could not be written/)).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Failed')).toBeInTheDocument();
  });

  it('the AI sample from the first request is shown even when the reject filter opens first', async () => {
    repair = (body) =>
      Promise.resolve({
        success: true,
        data: normalizeKbQuestionText({
          dryRun: true,
          organizationId: body.organizationId,
          totals: [totals()],
          rows: [row(1, body.action ?? 'reject')],
          pagination: { offset: 0, limit: 50, total: 5 },
          aiAvailable: true,
          // Only the first request (the one that may sample) carries samples.
          aiSamples:
            body.aiSample === 0
              ? []
              : [row(9, 'clean', { aiQuestion: 'When will order #10234 ship?' })],
        }),
      });
    render(<KbQuestionTextRepair workspace={67} />);
    fireEvent.click(checkButton());
    expect(await screen.findByText('When will order #10234 ship?')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'AI question sample' })).toBeInTheDocument();
    // The first request may sample; nothing else does.
    expect(bodies[0]).not.toHaveProperty('aiSample');
    expect(bodies.slice(1).every((body) => body.aiSample === 0)).toBe(true);
  });

  it('a check that hit the time limit says its counts are partial', async () => {
    repair = (body) =>
      Promise.resolve({
        success: true,
        data: normalizeKbQuestionText({
          dryRun: true,
          organizationId: body.organizationId,
          totals: [totals()],
          rows: [row(1, body.action ?? 'reject')],
          pagination: { offset: 0, limit: 50, total: 5, truncated: true, nextOffset: null },
          aiAvailable: true,
        }),
      });
    render(<KbQuestionTextRepair workspace={67} />);
    fireEvent.click(checkButton());
    expect(
      await screen.findByText(/The check stopped at the server's time limit/)
    ).toBeInTheDocument();
  });

  it('control: without AI the confirm does not promise an AI question', async () => {
    const { applyConfirmText } = await import('../KbQuestionTextRepair');
    expect(applyConfirmText([totals() as never], false)).not.toMatch(/AI-written/);
    expect(applyConfirmText([totals() as never], true)).toMatch(/AI-written/);
  });
});
