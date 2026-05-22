import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Languages, Loader2, X } from 'lucide-react';
import { useTranslation, useSupportedLanguages } from '@/hooks/useTranslation';
import { useTheme } from '@/contexts/ThemeContext';
import { logger } from '@/lib/logger';

type TranslateButtonProps = {
  messageId?: number;
  ticketId?: number;
  onTranslated: (content: string, subject?: string) => void;
  onCleared: () => void;
  buttonClassName?: string;
  spinnerClassName?: string;
  clearClassName?: string;
};

export const TranslateButton = ({
  messageId,
  ticketId,
  onTranslated,
  onCleared,
  buttonClassName,
  spinnerClassName,
  clearClassName,
}: TranslateButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [hasTranslation, setHasTranslation] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { translateMessage, translateTicket, isTranslating } = useTranslation();
  const { languages, fetchLanguages } = useSupportedLanguages();
  const { theme } = useTheme();
  const bgColor = theme === 'dark' ? '#1e293b' : '#ffffff';

  useEffect(() => {
    if (isOpen) {
      void fetchLanguages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = async (language: string) => {
    setSelectedLanguage(language);
    setIsOpen(false);
    try {
      if (messageId) {
        const result = await translateMessage(messageId, language);
        onTranslated(result.translated.content, result.translated.subject);
      } else if (ticketId) {
        const result = await translateTicket(ticketId, language);
        onTranslated(result.translated.description ?? '', result.translated.title);
      }
      setHasTranslation(true);
    } catch (err) {
      logger.error('Translation error:', err);
    }
  };

  const handleClear = () => {
    setIsOpen(false);
    setSelectedLanguage('');
    setHasTranslation(false);
    onCleared();
  };

  const languageOptions =
    languages.length > 0
      ? languages.map((lang) => ({ value: lang.code, label: lang.name }))
      : [{ value: 'en', label: 'English' }];

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.right - 110,
      });
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        title="Translate"
        className={
          buttonClassName ??
          `inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${
            isOpen || hasTranslation
              ? 'text-primary'
              : 'text-muted-foreground/40 hover:text-muted-foreground'
          }`
        }
      >
        <Languages className="w-3 h-3" />
      </button>
      {isTranslating && (
        <Loader2 className={`w-3 h-3 animate-spin flex-shrink-0 ${spinnerClassName ?? 'text-muted-foreground'}`} />
      )}
      {hasTranslation && !isTranslating && (
        <button
          type="button"
          onClick={handleClear}
          title="Show original"
          className={clearClassName ?? 'inline-flex items-center justify-center w-4 h-4 rounded text-muted-foreground/60 hover:text-muted-foreground transition-colors flex-shrink-0'}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, backgroundColor: bgColor, width: 'max-content' }}
          className="z-[9999] rounded-lg border border-border shadow-lg overflow-hidden"
        >
          <div className="overflow-y-auto max-h-52 py-1">
            {languageOptions.map((lang) => (
              <button
                key={lang.value}
                type="button"
                onClick={() => { void handleSelect(lang.value); }}
                className={`block w-full whitespace-nowrap text-left px-2.5 py-1.5 text-[13px] transition-colors ${
                  selectedLanguage === lang.value
                    ? 'font-medium text-foreground bg-accent'
                    : 'text-foreground/80 hover:bg-accent'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
