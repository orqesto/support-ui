import { useState } from 'react';
import { Languages, Loader2, X } from 'lucide-react';
import { useTranslation, useSupportedLanguages } from '@/hooks/useTranslation';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { toast } from '@/lib/toast';
import {
  isAiDraftsOffError,
  isAiNotConfiguredError,
  AI_DRAFTS_OFF_MESSAGE,
  AI_NOT_CONFIGURED_MESSAGE,
} from '@/lib/errorMessages';
import { logger } from '@/lib/logger';

type TranslateButtonProps = {
  messageId?: number;
  ticketId?: number;
  /** Free text with no stored id — an AI draft. Used when neither id is given. */
  text?: string;
  /**
   * Free text read at the moment a language is picked — for a source that changes without a
   * re-render (an editor's content). Takes precedence over `text`.
   */
  getText?: () => string;
  /** `language` is the code the agent picked, for callers that label the result. */
  onTranslated: (content: string, subject?: string, language?: string) => void;
  onCleared?: () => void;
  /**
   * Offer "Show original" after a translation (default). Off where the translation REPLACED
   * editable text: the agent may have edited it since, and the editor's own Undo is the way back.
   */
  clearable?: boolean;
  buttonClassName?: string;
  spinnerClassName?: string;
  clearClassName?: string;
  /** Text after the icon, for a labelled toolbar button. Icon only when omitted. */
  label?: string;
  /** Hover hint (a design-system tooltip) in place of the browser's own "Translate" title. */
  tooltip?: string;
  /** Held shut by the host (e.g. while an AI draft is replacing the text). */
  disabled?: boolean;
};

export const TranslateButton = ({
  messageId,
  ticketId,
  text,
  getText,
  onTranslated,
  onCleared,
  clearable = true,
  buttonClassName,
  spinnerClassName,
  clearClassName,
  label,
  tooltip,
  disabled = false,
}: TranslateButtonProps) => {
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [hasTranslation, setHasTranslation] = useState(false);

  const { translateMessage, translateTicket, translateText, isTranslating } = useTranslation();
  const { languages, fetchLanguages } = useSupportedLanguages();
  const { aiConfigured } = useAiConfigured();

  // The panel closes itself on a pick (single select).
  const handleSelect = async (language: string) => {
    setSelectedLanguage(language);
    try {
      if (messageId) {
        const result = await translateMessage(messageId, language);
        onTranslated(result.translated.content, result.translated.subject, language);
      } else if (ticketId) {
        const result = await translateTicket(ticketId, language);
        onTranslated(result.translated.description ?? '', result.translated.title, language);
      } else if (getText || text !== undefined) {
        const source = getText?.() ?? text ?? '';
        // An empty editor: nothing to translate, and the endpoint would 400.
        if (!source.trim()) {
          setSelectedLanguage('');
          return;
        }
        const result = await translateText(source, language);
        onTranslated(result.translated.content, undefined, language);
      }
      // Replaced in place: there is no "translated state" to show or clear, and the picker must
      // allow the same language again after the agent edits the text.
      if (clearable) setHasTranslation(true);
      else setSelectedLanguage('');
    } catch (err) {
      logger.error('Translation error:', err);
      // useTranslation tracks `error`, but its state is stale in this synchronous
      // catch and the api-client masks 5xx text — so surface from the raw error.
      if (isAiDraftsOffError(err)) {
        toast.error(AI_DRAFTS_OFF_MESSAGE);
      } else if (isAiNotConfiguredError(err)) {
        toast.error(AI_NOT_CONFIGURED_MESSAGE);
      } else {
        toast.error(err instanceof Error ? err.message : 'Translation failed');
      }
    }
  };

  const handleClear = () => {
    setSelectedLanguage('');
    setHasTranslation(false);
    onCleared?.();
  };

  const languageOptions =
    languages.length > 0
      ? languages.map((lang) => ({ value: lang.code, label: lang.name }))
      : [{ value: 'en', label: 'English' }];

  return (
    <div className="flex items-center gap-1">
      {/*
        One translation at a time: with the dropdown re-openable mid-flight, a second language
        could be fired while the first was pending, and whichever request RESOLVED last won — not
        whichever the agent clicked last. `disabled` keeps it shut while one is in flight.
      */}
      <Select
        variant="popover"
        align="end"
        aria-label="Language"
        options={languageOptions}
        value={selectedLanguage}
        onChange={(language) => void handleSelect(language)}
        disabled={disabled || !aiConfigured || isTranslating}
        trigger={({ open, toggle }) => (
          <Tooltip
            content={
              aiConfigured
                ? open
                  ? ''
                  : (tooltip ?? '')
                : 'AI translation needs a provider — configure one in Settings.'
            }
            size="sm"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                if (!open) void fetchLanguages();
                toggle();
              }}
              disabled={disabled || !aiConfigured || isTranslating}
              title={
                tooltip ? undefined : aiConfigured ? 'Translate' : 'AI translation needs a provider'
              }
              aria-label="Translate"
              className={`${
                buttonClassName ??
                `inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${
                  open || hasTranslation
                    ? 'text-primary'
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                }`
              } ${!aiConfigured ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Languages className="w-3 h-3" />
              {label}
            </Button>
          </Tooltip>
        )}
      />
      {isTranslating && (
        <Loader2
          className={`w-3 h-3 animate-spin flex-shrink-0 ${spinnerClassName ?? 'text-muted-foreground'}`}
        />
      )}
      {hasTranslation && !isTranslating && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          title="Show original"
          aria-label="Show original"
          className={
            clearClassName ??
            'inline-flex items-center justify-center w-4 h-4 rounded text-muted-foreground/60 hover:text-muted-foreground transition-colors flex-shrink-0'
          }
        >
          <X className="w-2.5 h-2.5" />
        </Button>
      )}
    </div>
  );
};
