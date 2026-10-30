/**
 * KB engine Stage 1, task F4: the question card (owner-approved F0 layout, Stage 1 rulings).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { KbQuestionCard } from '../KbQuestionCard';
import { captureQuestion, mergeQuestion } from './kbQuestionFixtures';

afterEach(cleanup);

const renderCard = (question = mergeQuestion(), busy = false) => {
  const onAnswer = vi.fn(() => Promise.resolve());
  const onSkip = vi.fn();
  render(
    <KbQuestionCard
      question={question}
      onAnswer={onAnswer}
      onSkip={onSkip}
      busy={busy}
      position={1}
      total={5}
    />
  );
  return { onAnswer, onSkip };
};

const save = () => screen.getByRole('button', { name: 'Save answer' });

describe('KbQuestionCard', () => {
  it('renders both answers with evidence', () => {
    renderCard();
    const answers = screen.getAllByTestId('kb-question-answer');
    expect(answers).toHaveLength(2);
    expect(within(answers[0]).getByText('Sending again costs 22 EUR.')).toBeInTheDocument();
    expect(within(answers[0]).getByText('14 threads, 11 customers')).toBeInTheDocument();
    expect(within(answers[0]).getByText('2 Jul to 21 Oct')).toBeInTheDocument();
    expect(within(answers[1]).getByText('9 threads, 8 customers')).toBeInTheDocument();
    expect(within(answers[0]).getByText('A')).toBeInTheDocument();
    expect(within(answers[1]).getByText('B')).toBeInTheDocument();
    // The prompt carries "+N more" from the backend.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '1 more answer is in this group'
    );
    expect(screen.getByText('Question 1 of 5')).toBeInTheDocument();
  });

  it('hides empty lines: countries, ruled out, the impact line, Depends on', () => {
    renderCard();
    expect(screen.queryByText('Countries')).toBeNull();
    expect(screen.queryByText(/Engine already ruled out/)).toBeNull();
    expect(screen.queryByText(/drafts/i)).toBeNull();
    expect(screen.queryByText(/Depends on/)).toBeNull();
    cleanup();
    renderCard(
      mergeQuestion(1, {
        ruledOut: ['A figure seen in 2 threads'],
        answers: mergeQuestion().answers.map((answer) => ({
          ...answer,
          evidence: { ...answer.evidence, countries: ['Germany'] },
        })),
      })
    );
    expect(screen.getByText(/Engine already ruled out/)).toBeInTheDocument();
    expect(screen.getAllByText('Countries')).toHaveLength(2);
  });

  it("shows the engine's draft under the question, not in the heading", () => {
    renderCard(
      mergeQuestion(1, {
        prompt: "Merge them into one?\n\nEngine's draft:\nQ: A question\nA: An answer",
      })
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Merge them into one\?$/);
    expect(screen.getByTestId('kb-question-draft')).toHaveTextContent("Engine's draft:");
  });

  it('a capture shows one answer, no A/B letter, no empty evidence', () => {
    renderCard(captureQuestion());
    const answers = screen.getAllByTestId('kb-question-answer');
    expect(answers).toHaveLength(1);
    expect(within(answers[0]).queryByText('A')).toBeNull();
    expect(screen.queryByTestId('kb-question-evidence')).toBeNull();
    expect(screen.getByTestId('kb-question-answers').className).not.toMatch(/md:grid-cols-2/);
  });

  it('renders the backend choices numbered, and Save stays disabled until one is chosen', () => {
    const { onAnswer } = renderCard();
    const group = screen.getByRole('group', { name: 'Your answer' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      '1Merge into one answer',
      '2Keep separate',
      '3Both wrong — write the answer',
    ]);
    expect(screen.queryByText(/Pick A/)).toBeNull();
    expect(save()).toBeDisabled();
    fireEvent.click(buttons[1]);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    expect(onAnswer).toHaveBeenCalledWith('keep_separate', undefined);
  });

  it('key 1 answers with the first choice', () => {
    const { onAnswer } = renderCard();
    fireEvent.keyDown(window, { key: '1' });
    expect(
      within(screen.getByRole('group', { name: 'Your answer' })).getAllByRole('button')[0]
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(save());
    expect(onAnswer).toHaveBeenCalledWith('accept', undefined);
  });

  it('both wrong without text cannot submit; with text it sends the text and says it goes live', () => {
    const { onAnswer } = renderCard();
    fireEvent.keyDown(window, { key: '3' });
    const box = screen.getByRole('textbox', { name: 'The right answer' });
    // The cursor is in the box at once, and the key did not type into it.
    expect(box).toHaveFocus();
    expect(box).toHaveValue('');
    expect(screen.getByText('Your answer goes live at once when you save it.')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    fireEvent.change(box, { target: { value: '   ' } });
    expect(save()).toBeDisabled();
    fireEvent.change(box, { target: { value: 'Sending again costs 25 EUR.' } });
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    expect(onAnswer).toHaveBeenCalledWith('both_wrong', 'Sending again costs 25 EUR.');
  });

  it('keys are ignored while typing in both-wrong text', () => {
    renderCard();
    fireEvent.keyDown(window, { key: '3' });
    const box = screen.getByRole('textbox', { name: 'The right answer' });
    fireEvent.keyDown(box, { key: '1' });
    // Still on Both wrong: the box is there and choice 3 is pressed.
    expect(screen.getByRole('textbox', { name: 'The right answer' })).toBeInTheDocument();
    const buttons = within(screen.getByRole('group', { name: 'Your answer' })).getAllByRole(
      'button'
    );
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('a lapsed capture shows "Waiting since", no alarm', () => {
    renderCard(captureQuestion(2, { expired: true, openedAt: '2026-10-01T10:00:00Z' }));
    expect(screen.getByText('Waiting since 1 Oct')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Skip calls onSkip', () => {
    const { onSkip } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Skip / not sure' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('card is usable at 375px: choices stack and buttons are full width', () => {
    renderCard();
    const group = screen.getByTestId('kb-question-choices');
    expect(group.className).toMatch(/(^| )flex-col( |$)/);
    within(group)
      .getAllByRole('button')
      .forEach((button) => expect(button.className).toMatch(/(^| )w-full( |$)/));
    expect(save().className).toMatch(/(^| )w-full( |$)/);
    expect(screen.getByTestId('kb-question-answers').className).toMatch(/grid-cols-1/);
  });
});
