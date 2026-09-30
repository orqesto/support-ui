import { describe, expect, it } from 'vitest';
import { splitQaContent } from '../kbQaText';

/** The regex `splitQaContent` replaced — kept only as the reference rule for short inputs. */
const reference = (content: string): { question: string; answer: string } | null => {
  const match =
    /^\s*Question:\s*([\s\S]*?)\n\s*\n\s*Answer:\s*([\s\S]*)$/.exec(content) ??
    /^\s*Q:\s*([\s\S]*?)\n\s*\n\s*A:\s*([\s\S]*)$/.exec(content);
  if (!match) return null;
  const question = match[1].trim();
  const answer = match[2].trim();
  return question && answer ? { question, answer } : null;
};

describe('splitQaContent', () => {
  it('agrees with the regex it replaced on 5,000 random short inputs', () => {
    const parts = [
      'Question:',
      'Answer:',
      'Q:',
      'A:',
      '\n',
      '\n\n',
      ' ',
      ' \n ',
      'x',
      'DATA:',
      'q?',
      '\t',
    ];
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let run = 0; run < 5000; run += 1) {
      let text = '';
      const length = next() % 12;
      for (let piece = 0; piece < length; piece += 1) text += parts[next() % parts.length];
      expect({ text, got: splitQaContent(text) }).toEqual({ text, got: reference(text) });
    }
  });

  it('stays linear on hostile runs of blank lines', () => {
    for (const text of [
      `Question: x${'\n'.repeat(100_000)}y`,
      `Q: x${'\n \n'.repeat(30_000)}y`,
      `Question: x${'\n\nAnswer:'.repeat(20_000)}`,
    ]) {
      const started = Date.now();
      splitQaContent(text);
      expect(Date.now() - started).toBeLessThan(100);
    }
  });
});
