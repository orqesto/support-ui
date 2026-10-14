/**
 * `translatable`: the real editor (TipTap in jsdom) with the real TranslateButton. Picking a
 * language REPLACES the editor's text with the translation — the reply is what gets sent, so the
 * agent edits it in place — and the toolbar's Undo brings the original back.
 */
import { useState } from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';

type Translated = { translated: { content: string; language: string } };
const translateText = vi.fn<(text: string, language: string) => Promise<Translated>>();

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    translateMessage: vi.fn(),
    translateTicket: vi.fn(),
    translateText: (text: string, language: string) => translateText(text, language),
    isTranslating: false,
    error: null,
  }),
  useSupportedLanguages: () => ({
    languages: [{ code: 'de', name: 'German' }],
    isLoading: false,
    fetchLanguages: () => Promise.resolve(),
  }),
}));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: true, isLoading: false }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import RichTextEditor from '../RichTextEditor';
import { shieldPlaceholders } from '@/lib/replyPlaceholders';

const onChange = vi.fn<(html: string) => void>();

/** Controlled, as every composer holds it — its re-render is what refreshes the toolbar. */
const Host = ({ initial, translatable }: { initial: string; translatable: boolean }) => {
  const [content, setContent] = useState(initial);
  return (
    <RichTextEditor
      content={content}
      onChange={(html) => {
        onChange(html);
        setContent(html);
      }}
      initiallyHidden={false}
      translatable={translatable}
    />
  );
};

const renderEditor = async (content: string, translatable = true) => {
  const { container } = render(<Host initial={content} translatable={translatable} />);
  const editorOf = () =>
    container.querySelector<HTMLElement & { editor?: Editor }>('.ProseMirror')?.editor;
  await waitFor(() => expect(editorOf()).toBeDefined());
  return editorOf()!;
};

const pickGerman = async () => {
  fireEvent.click(screen.getByLabelText('Translate'));
  fireEvent.click(await screen.findByText('German'));
};

describe('RichTextEditor — translatable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translateText.mockImplementation((text) =>
      Promise.resolve({ translated: { content: `DE: ${text}`, language: 'de' } })
    );
  });
  afterEach(cleanup);

  it('CONTROL: off by default — no Translate in the toolbar', async () => {
    await renderEditor('<p>Hello</p>', false);
    expect(screen.queryByLabelText('Translate')).toBeNull();
  });

  it('sends the plain text, paragraphs kept apart, and replaces the content in place', async () => {
    const editor = await renderEditor('<p>Hello <strong>there</strong>.</p><p>Second line.</p>');
    await pickGerman();
    await waitFor(() => expect(editor.getText()).toContain('DE: Hello there.'));
    expect(translateText).toHaveBeenCalledWith('Hello there.\n\nSecond line.', 'de');
    // Still two paragraphs, and the host heard about it (the composer's state is the reply).
    expect(editor.getHTML()).toMatch(/<p>DE: Hello there\.<\/p><p>Second line\.<\/p>/);
    expect(onChange).toHaveBeenLastCalledWith(editor.getHTML());
  });

  it('the toolbar Undo brings the original back', async () => {
    const editor = await renderEditor('<p>Hello</p>');
    await pickGerman();
    await waitFor(() => expect(editor.getText()).toBe('DE: Hello'));
    fireEvent.click(screen.getByLabelText('Undo'));
    expect(editor.getText()).toBe('Hello');
  });

  it('a translation is TEXT: markup-looking characters are not parsed', async () => {
    translateText.mockResolvedValue({
      translated: { content: 'Use <b>code</b> & _this_ one', language: 'de' },
    });
    const editor = await renderEditor('<p>x</p>');
    await pickGerman();
    await waitFor(() => expect(editor.getText()).toBe('Use <b>code</b> & _this_ one'));
  });

  it('⛔ template placeholders go out as markers and come back untouched', async () => {
    // A model that would happily translate the fallback word inside the token.
    translateText.mockImplementation((text) =>
      Promise.resolve({
        translated: {
          content: text.replace('Hi', 'Hallo').replace('there', 'dort'),
          language: 'de',
        },
      })
    );
    const editor = await renderEditor('<p>Hi {first_name|there}, ticket {{ticket_id}}.</p>');
    await pickGerman();
    await waitFor(() => expect(editor.getText()).toContain('Hallo'));
    expect(translateText).toHaveBeenCalledWith('Hi [[0]], ticket [[1]].', 'de');
    expect(editor.getText()).toBe('Hallo {first_name|there}, ticket {{ticket_id}}.');
  });

  it('an empty editor sends nothing', async () => {
    await renderEditor('<p></p>');
    await pickGerman();
    expect(translateText).not.toHaveBeenCalled();
  });

  it('no "Show original" — the text was replaced, the editor’s Undo is the way back', async () => {
    const editor = await renderEditor('<p>Hello</p>');
    await pickGerman();
    await waitFor(() => expect(editor.getText()).toBe('DE: Hello'));
    expect(screen.queryByLabelText('Show original')).toBeNull();
    // The picker is ready for another pick, reading the text as it is NOW.
    await pickGerman();
    await waitFor(() => expect(translateText).toHaveBeenLastCalledWith('DE: Hello', 'de'));
  });
});

describe('shieldPlaceholders', () => {
  it('round-trips every placeholder form; ordinary braces are left alone', () => {
    const shielded = shieldPlaceholders('{first_name} {{agent_name|us}} {SPRING}');
    expect(shielded.text).toBe('[[0]] [[1]] {SPRING}');
    expect(shielded.restore(shielded.text)).toBe('{first_name} {{agent_name|us}} {SPRING}');
  });

  it('a marker the model invented is left as it came back, never filled with a stranger', () => {
    const shielded = shieldPlaceholders('Hi {first_name}');
    expect(shielded.restore('Hallo [[0]] [[7]]')).toBe('Hallo {first_name} [[7]]');
  });
});
