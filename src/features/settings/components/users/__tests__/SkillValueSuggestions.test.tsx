import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillValueSuggestions } from '../SkillValueSuggestions';

describe('SkillValueSuggestions', () => {
  it('offers values already used in the workspace that this agent does not hold; a click adds it', () => {
    const onPick = vi.fn();
    render(<SkillValueSuggestions keyType="topic" existing={['usdc', 'usdt']} held={['usdt']} onPick={onPick} />);
    expect(screen.queryByRole('button', { name: 'Add usdt' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add usdc' }));
    expect(onPick).toHaveBeenCalledWith('usdc');
  });

  it('a language key also offers common languages by name', () => {
    render(<SkillValueSuggestions keyType="language" existing={[]} held={['english']} onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add spanish' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add english' })).toBeNull();
  });

  it('nothing to offer → renders nothing', () => {
    const { container } = render(<SkillValueSuggestions keyType="topic" existing={['usdt']} held={['usdt']} onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
