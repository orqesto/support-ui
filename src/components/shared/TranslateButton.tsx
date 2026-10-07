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
  /** `language` is the code the agent picked, for callers that label the result. */
  onTranslated: (content: string, subject?: string, language?: string) => void;
  onCleared: () => void;
  buttonClassName?: string;
  spinnerClassName?: string;
  clearClassName?: string;
};

export const TranslateButton = ({
  messageId,
  ticketId,
  text,
  onTranslated,
  onCleared,
  buttonClassName,
  spinnerClassName,
  clearClassName,
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
      } else if (text !== undefined) {
        const result = await translateText(text, language);
        onTranslated(result.translated.content, undefined, language);
      }
      setHasTranslation(true);
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
    onCleared();
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
        disabled={!aiConfigured || isTranslating}
        trigger={({ open, toggle }) => (
          <Tooltip
            content={
              aiConfigured
                ? ''
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
              disabled={!aiConfigured || isTranslating}
              title={aiConfigured ? 'Translate' : 'AI translation needs a provider'}
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
