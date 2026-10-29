/**
 * Translate in the reply composer's tool row (next to Attach, AI draft, KB, Look up): labelled,
 * with the real editor, picker and composer. Picking a language replaces the reply in place —
 * links and template placeholders kept — and the formatting row no longer has its own copy.
 */
import { useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Message } from '@/types';
import type { RichTextEditorHandle } from '@/components/shared/RichTextEditor';

// The reply box folds to one line while empty (every screen size since 2026-10-29): open it the
// way an agent does, by pressing into it.
const renderOpen = (ui: Parameters<typeof render>[0]) => {
  const result = render(ui);
  fireEvent.click(screen.getByTestId('composer-field'));
  return result;
};

type Translated = { translated: { content: string; language: string } };
const translateText = vi.fn<(text: string, language: string) => Promise<Translated>>();
const phone = vi.hoisted(() => ({ on: false }));

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
vi.mock('@/hooks/useAiDraftsOff', () => ({ useAiDraftsOff: () => ({ off: false }) }));
vi.mock('@/services/replyTemplates.service', () => ({
  replyTemplatesService: { list: () => Promise.resolve({ unavailable: true, templates: [] }) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../ComposerAiActions', () => ({ ComposerAiActions: () => null }));
vi.mock('../useIsPhone', () => ({ useIsPhone: () => phone.on }));

// jsdom has no layout; the translate path focuses the editor and ProseMirror scrolls through these.
const layoutStubs = {
  getClientRects: (): DOMRectList =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList,
  getBoundingClientRect: (): DOMRect => new DOMRect(),
};
for (const [name, value] of Object.entries(layoutStubs)) {
  if (!(name in Range.prototype)) {
    Object.defineProperty(Range.prototype, name, { value, configurable: true });
  }
}

const { MessageComposer } = await import('../MessageComposer');

const message = { id: 5, subject: 'Order', channel: 'email' } as unknown as Message;

let composerNow = '';
const Host = ({ initial }: { initial: string }) => {
  const [composer, setComposer] = useState(initial);
  const richEditorRef = useRef<RichTextEditorHandle>(null);
  const noteEditorRef = useRef<RichTextEditorHandle>(null);
  composerNow = composer;
  return (
    <MessageComposer
      message={message}
      composer={composer}
      setComposer={setComposer}
      composerMode="reply"
      setComposerMode={vi.fn()}
      submitting={false}
      onSend={vi.fn()}
      richEditorRef={richEditorRef}
      noteEditorRef={noteEditorRef}
      onOpenSimilarMessages={vi.fn()}
      selectedFiles={[]}
      onFilesChange={vi.fn()}
    />
  );
};

const tools = () => screen.getByTestId('composer-tools');

beforeEach(() => {
  translateText.mockImplementation((text) =>
    Promise.resolve({ translated: { content: `DE: ${text}`, language: 'de' } })
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  phone.on = false;
});

describe('MessageComposer — Translate in the tool row', () => {
  it('a labelled Translate sits in the tool row, and only there', () => {
    renderOpen(<Host initial="<p>Hello</p>" />);
    const buttons = screen.getAllByRole('button', { name: 'Translate' });
    expect(buttons).toHaveLength(1);
    expect(tools()).toContainElement(buttons[0]);
    expect(buttons[0]).toHaveTextContent('Translate');
  });

  it('picking a language replaces the reply in place, link kept around the translated words', async () => {
    translateText.mockResolvedValue({
      translated: { content: 'Setze es [[a0]]hier[[/a0]] zurück.', language: 'de' },
    });
    renderOpen(<Host initial='<p>Reset it <a href="https://help.example/reset">here</a>.</p>' />);
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.click(await screen.findByText('German'));
    await waitFor(() => expect(composerNow).toContain('Setze'));
    expect(translateText).toHaveBeenCalledWith('Reset it [[a0]]here[[/a0]].', 'de');
    expect(composerNow).toMatch(/<a [^>]*href="https:\/\/help\.example\/reset"[^>]*>hier<\/a>/);
  });

  it('an empty reply sends nothing to translate', async () => {
    renderOpen(<Host initial="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
    fireEvent.click(await screen.findByText('German'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(translateText).not.toHaveBeenCalled();
  });

  it('phone: icon only (the name stays for screen readers)', () => {
    phone.on = true;
    renderOpen(<Host initial="<p>Hello</p>" />);
    // At rest the phone shows only AI draft; a reply already in the box opens the full tool row.
    const button = screen.getByRole('button', { name: 'Translate' });
    expect(button).not.toHaveTextContent('Translate');
  });
});
