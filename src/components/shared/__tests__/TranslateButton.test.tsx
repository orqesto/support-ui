/**
 * The one language dropdown every surface shares. Its third source — free text with no
 * stored id, i.e. an AI draft — was added so the draft panel stops hardcoding English.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

type Translated = { translated: { content: string; subject?: string; language: string } };
const translateMessage = vi.fn<(...args: unknown[]) => Promise<Translated>>();
const translateTicket = vi.fn<(...args: unknown[]) => Promise<Translated>>();
const translateText = vi.fn<(...args: unknown[]) => Promise<Translated>>();
const fetchLanguages = vi.fn<() => Promise<void>>();
let isTranslating = false;

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    translateMessage: (...args: unknown[]) => translateMessage(...args),
    translateTicket: (...args: unknown[]) => translateTicket(...args),
    translateText: (...args: unknown[]) => translateText(...args),
    isTranslating,
    error: null,
  }),
  useSupportedLanguages: () => ({
    languages: [
      { code: 'de', name: 'German' },
      { code: 'sv', name: 'Swedish' },
    ],
    isLoading: false,
    fetchLanguages: () => fetchLanguages(),
  }),
}));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: true, isLoading: false }),
}));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
const toastError = vi.fn<(message: string) => void>();
vi.mock('@/lib/toast', () => ({
  toast: { error: (message: string) => toastError(message), success: vi.fn(), info: vi.fn() },
}));

import { TranslateButton } from '@/components/shared/TranslateButton';
import { apiError } from '@/test/apiError';

const onTranslated = vi.fn<(content: string, subject?: string, language?: string) => void>();
const onCleared = vi.fn<() => void>();

const pick = async (languageName: string) => {
  fireEvent.click(screen.getByLabelText('Translate'));
  fireEvent.click(await screen.findByText(languageName));
};

describe('TranslateButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTranslating = false;
    fetchLanguages.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('free text (an AI draft) → translates the text itself and reports the picked language', async () => {
    translateText.mockResolvedValue({
      translated: { content: 'Ditt paket är i tullen.', language: 'sv' },
    });
    render(
      <TranslateButton text="Ihr Paket ist im Zoll." onTranslated={onTranslated} onCleared={onCleared} />
    );

    await pick('Swedish');

    await waitFor(() =>
      expect(translateText).toHaveBeenCalledWith('Ihr Paket ist im Zoll.', 'sv')
    );
    expect(onTranslated).toHaveBeenCalledWith('Ditt paket är i tullen.', undefined, 'sv');
    expect(translateMessage).not.toHaveBeenCalled();
    expect(translateTicket).not.toHaveBeenCalled();
  });

  it('a draft translation refused because AI drafts are off says so', async () => {
    translateText.mockRejectedValue(
      // Keyed on the CODE: a backend that words it differently must still read as drafts off.
      await apiError(409, { code: 'AI_DRAFTS_OFF', error: 'Drafting refused.' })
    );
    render(<TranslateButton text="Ihr Paket." onTranslated={onTranslated} onCleared={onCleared} />);

    await pick('Swedish');

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('AI drafts are switched off for this workspace.')
    );
    expect(onTranslated).not.toHaveBeenCalled();
  });

  it('CONTROL: a stored message still goes through the message endpoint, never the text one', async () => {
    translateMessage.mockResolvedValue({
      translated: { content: 'Ihr Paket ist im Zoll.', subject: 'Zoll', language: 'de' },
    });
    render(<TranslateButton messageId={7} onTranslated={onTranslated} onCleared={onCleared} />);

    await pick('German');

    await waitFor(() => expect(translateMessage).toHaveBeenCalledWith(7, 'de'));
    expect(onTranslated).toHaveBeenCalledWith('Ihr Paket ist im Zoll.', 'Zoll', 'de');
    expect(translateText).not.toHaveBeenCalled();
  });

  it('"Show original" hands control back to the caller', async () => {
    translateText.mockResolvedValue({ translated: { content: 'Ditt paket.', language: 'sv' } });
    render(<TranslateButton text="Ihr Paket." onTranslated={onTranslated} onCleared={onCleared} />);

    await pick('Swedish');
    fireEvent.click(await screen.findByLabelText('Show original'));

    expect(onCleared).toHaveBeenCalledTimes(1);
  });

  it('fetches the languages when the panel opens, not when it closes', () => {
    render(<TranslateButton text="Ihr Paket." onTranslated={onTranslated} onCleared={onCleared} />);

    fireEvent.click(screen.getByLabelText('Translate'));
    expect(fetchLanguages).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Translate'));
    expect(screen.queryByRole('combobox', { name: 'Language' })).toBeNull();
    expect(fetchLanguages).toHaveBeenCalledTimes(1);
  });

  it('picking a language closes the panel; reopened, that language is the ticked one', async () => {
    translateText.mockResolvedValue({ translated: { content: 'Ditt paket.', language: 'sv' } });
    render(<TranslateButton text="Ihr Paket." onTranslated={onTranslated} onCleared={onCleared} />);

    await pick('Swedish');
    expect(screen.queryByRole('combobox', { name: 'Language' })).toBeNull();
    await waitFor(() => expect(onTranslated).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText('Translate'));
    expect(screen.getByRole('option', { name: 'Swedish' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: 'German' }).getAttribute('aria-selected')).toBe('false');
  });

  it('stays shut while a translation is in flight — one translation at a time', () => {
    isTranslating = true;
    render(<TranslateButton text="Ihr Paket." onTranslated={onTranslated} onCleared={onCleared} />);

    fireEvent.click(screen.getByLabelText('Translate'));

    expect(screen.queryByRole('combobox', { name: 'Language' })).toBeNull();
    expect(screen.queryByText('Swedish')).toBeNull();
  });
});
