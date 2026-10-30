/**
 * KB engine Stage 1, task F4: the Questions queue (one card at a time, keys, skip, errors, paging).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { KbQuestion, KbQuestionsPage, KbQuestionsParams } from '@/services/kbEngine.types';
import { KbQuestionQueue, ALREADY_DECIDED_TEXT, NOT_YOUR_TEAM_TEXT } from '../KbQuestionQueue';
import { captureQuestion, mergeQuestion } from './kbQuestionFixtures';

const state = vi.hoisted(() => ({
  pages: [] as KbQuestionsPage[],
  calls: [] as KbQuestionsParams[],
  answers: [] as Array<{ id: number; choice: string; text?: string }>,
  answerError: null as Error | null,
}));

vi.mock('@/services/kbEngine.service', () => ({
  getKbQuestions: (params: KbQuestionsParams) => {
    state.calls.push(params);
    const page = params.cursor
      ? state.pages.find((candidate) => candidate.items[0]?.suggestionId === Number(params.cursor))
      : state.pages[0];
    return Promise.resolve(page ?? { items: [], total: 0, nextCursor: null, olderThan7d: 0 });
  },
  answerKbQuestion: (id: number, choice: string, text?: string) => {
    state.answers.push({ id, choice, text });
    return state.answerError
      ? Promise.reject(state.answerError)
      : Promise.resolve({ suggestionId: id, kind: 'merge', choice, result: {} });
  },
}));

/** The interceptor's error shape: an Error carrying the status and the envelope. */
const apiError = (status: number, message: string): Error =>
  Object.assign(new Error(message), { status, data: { error: message } });

const pageOf = (
  items: KbQuestion[],
  total = items.length,
  nextCursor: string | null = null,
  olderThan7d = 0
): KbQuestionsPage => ({ items, total, nextCursor, olderThan7d });

const renderQueue = (search = '', departmentId?: number) =>
  render(
    <KbQuestionQueue search={search} departmentId={departmentId} empty={<p>Nothing needs you</p>} />
  );

const heading = () => screen.getByRole('heading', { level: 2 }).textContent ?? '';
const choiceButtons = () =>
  within(screen.getByRole('group', { name: 'Your answer' })).getAllByRole('button');

beforeEach(() => {
  state.pages = [pageOf([mergeQuestion(1), mergeQuestion(2), captureQuestion(3)], 3, null, 2)];
  state.calls = [];
  state.answers = [];
  state.answerError = null;
});
afterEach(cleanup);

describe('KbQuestionQueue', () => {
  it('first card and count visible: older line, then the card with "1 of 3"', async () => {
    renderQueue('', 3);
    expect(await screen.findByText('Question 1 of 3')).toBeInTheDocument();
    expect(state.calls[0]).toMatchObject({ departmentId: 3 });
    const root = screen.getByTestId('kb-questions-slot');
    const older = screen.getByTestId('kb-questions-older');
    const card = screen.getByTestId('kb-question-card');
    expect(older).toHaveTextContent('2 questions open over 7 days');
    // DOM order: the count line before the card, both inside the slot (no collapsed wrapper).
    expect(root.contains(older) && root.contains(card)).toBe(true);
    expect(older.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId('kb-question-card')).toHaveLength(1);
  });

  it('j/k move between cards', async () => {
    renderQueue();
    await screen.findByText('Question 1 of 3');
    expect(heading()).toContain('fee 1');
    fireEvent.keyDown(window, { key: 'j' });
    expect(heading()).toContain('fee 2');
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'j' });
    expect(heading()).toContain('Opening hours');
    fireEvent.keyDown(window, { key: 'j' });
    expect(heading()).toContain('Opening hours');
    fireEvent.keyDown(window, { key: 'k' });
    expect(heading()).toContain('fee 2');
  });

  it('key 1 then Save answers with the first choice and shows the next card', async () => {
    renderQueue();
    await screen.findByText('Question 1 of 3');
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    await waitFor(() => expect(heading()).toContain('fee 2'));
    expect(state.answers).toEqual([{ id: 1, choice: 'accept', text: undefined }]);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('answering a decided question (409) shows "Already decided" and moves on', async () => {
    state.answerError = apiError(409, 'not pending');
    renderQueue();
    await screen.findByText('Question 1 of 3');
    fireEvent.click(choiceButtons()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    expect(await screen.findByText(ALREADY_DECIDED_TEXT)).toBeInTheDocument();
    expect(heading()).toContain('fee 2');
  });

  it('403 keeps the card and says the team is not yours', async () => {
    state.answerError = apiError(403, 'Only a moderator');
    renderQueue();
    await screen.findByText('Question 1 of 3');
    fireEvent.click(choiceButtons()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    expect(await screen.findByTestId('kb-question-error')).toHaveTextContent(NOT_YOUR_TEAM_TEXT);
    expect(heading()).toContain('fee 1');
  });

  it('another error keeps the card, shows it, and keeps the typed text', async () => {
    state.answerError = apiError(400, 'This merge has no question to keep');
    renderQueue();
    await screen.findByText('Question 1 of 3');
    fireEvent.click(choiceButtons()[2]);
    fireEvent.change(screen.getByRole('textbox', { name: 'The right answer' }), {
      target: { value: 'My own answer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    expect(await screen.findByTestId('kb-question-error')).toHaveTextContent(
      'This merge has no question to keep'
    );
    expect(heading()).toContain('fee 1');
    expect(screen.getByRole('textbox', { name: 'The right answer' })).toHaveValue('My own answer');
    expect(state.answers[0]).toEqual({ id: 1, choice: 'both_wrong', text: 'My own answer' });
  });

  it('Skip writes nothing and sends the card to the end', async () => {
    renderQueue();
    await screen.findByText('Question 1 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Skip / not sure' }));
    expect(heading()).toContain('fee 2');
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(heading()).toContain('fee 1');
    expect(screen.getByText('Question 3 of 3')).toBeInTheDocument();
    expect(state.answers).toHaveLength(0);
  });

  it('search is sent, and the next page loads when the queue runs low', async () => {
    state.pages = [
      pageOf([mergeQuestion(1), mergeQuestion(2)], 4, '3'),
      pageOf([mergeQuestion(3), mergeQuestion(4)], 4, null),
    ];
    renderQueue('fee');
    await screen.findByText('Question 1 of 4');
    expect(state.calls[0]).toMatchObject({ search: 'fee' });
    await waitFor(() => expect(state.calls).toHaveLength(2));
    expect(state.calls[1]).toMatchObject({ search: 'fee', cursor: '3' });
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(heading()).toContain('fee 4');
  });

  it('an empty queue shows the empty state; an empty search says so', async () => {
    state.pages = [pageOf([])];
    renderQueue();
    expect(await screen.findByText('Nothing needs you')).toBeInTheDocument();
    cleanup();
    renderQueue('nothing like this');
    expect(
      await screen.findByText('No open question matches “nothing like this”.')
    ).toBeInTheDocument();
  });
});
