/** The question split (per-question retrieval, 2026-11-16) is named in the console's reasoning card. */
import { describe, expect, it } from 'vitest';
import { featureLabel } from '../ReasoningCard';

describe('reasoning card labels', () => {
  it('question_split has a readable name', () => {
    expect(featureLabel('question_split')).toBe('Question split (per-question search)');
  });
  it('CONTROL: an unknown feature keeps its key', () => {
    expect(featureLabel('not_a_feature')).toBe('not_a_feature');
  });
});
