/**
 * The thread's AI suggestion answers the customer's latest email. Once the last message is ours
 * (an agent's reply or the auto-reply), that email is answered: no suggestion is shown — neither
 * the stored draft nor "No suggestion found" — until the customer writes again.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageGhostBubble } from '../MessageGhostBubble';
import type { GhostOption } from '../messageDetailConstants';

const noop = () => undefined;
const option = {
  answer: 'Yes, we ship to every EU country; pick yours at checkout.',
  source: 'documentation',
  confidence: 0.9,
} as unknown as GhostOption;

const renderBubble = (props: { answered?: boolean; ghostOption?: GhostOption | null }) =>
  render(
    <MessageGhostBubble
      aiLoading={false}
      ghostVisible
      ghostOption={props.ghostOption === undefined ? option : props.ghostOption}
      autoReply={undefined}
      composer=""
      composerMode="reply"
      resolved={false}
      {...(props.answered !== undefined ? { answered: props.answered } : {})}
      alternativeCount={0}
      onGhostClick={noop}
      onShowAlternatives={noop}
    />
  );

describe('AI suggestion after our reply', () => {
  it('the last message is ours: the stored draft is not shown', () => {
    const { container } = renderBubble({ answered: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('the last message is ours and nothing is stored: no "No suggestion found" either', () => {
    const { container } = renderBubble({ answered: true, ghostOption: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('CONTROL: the customer wrote last: the stored draft is shown', () => {
    renderBubble({ answered: false });
    expect(screen.getByText(/we ship to every EU country/)).toBeInTheDocument();
  });

  it('CONTROL: not passed (older callers): shown as before', () => {
    renderBubble({});
    expect(screen.getByText(/we ship to every EU country/)).toBeInTheDocument();
  });
});
