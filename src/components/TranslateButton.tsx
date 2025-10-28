import { useState, useEffect } from 'react';
import { Languages, ChevronDown, Loader2, X } from 'lucide-react';
import { useTranslation, useSupportedLanguages } from '../hooks/useTranslation';
import { Button } from './ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/Dialog';

type TranslateButtonProps = {
  messageId?: number;
  ticketId?: number;
  originalContent: string;
  originalSubject?: string;
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

export const TranslateButton = ({
  messageId,
  ticketId,
  originalContent,
  originalSubject,
  variant = 'outline',
  size = 'sm',
}: TranslateButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [translatedData, setTranslatedData] = useState<{
    content: string;
    subject?: string;
    sourceLanguage: string;
  } | null>(null);

  const { translateMessage, translateTicket, isTranslating, error } = useTranslation();
  const { languages, fetchLanguages } = useSupportedLanguages();

  useEffect(() => {
    if (isOpen && languages.length === 0) {
      void fetchLanguages();
    }
  }, [isOpen, languages.length, fetchLanguages]);

  const handleTranslate = async () => {
    try {
      if (messageId) {
        const result = await translateMessage(messageId, selectedLanguage);
        setTranslatedData({
          content: result.translated.content,
          subject: result.translated.subject,
          sourceLanguage: result.original.language,
        });
      } else if (ticketId) {
        const result = await translateTicket(ticketId, selectedLanguage);
        setTranslatedData({
          content: result.translated.description ?? '',
          subject: result.translated.title,
          sourceLanguage: result.original.language,
        });
      }
    } catch (err) {
      console.error('Translation error:', err);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setTranslatedData(null);
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setIsOpen(true)}>
        <Languages className="h-4 w-4 mr-2" />
        Translate
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Languages className="h-5 w-5" />
                  Translate Content
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Language Selector */}
            <div className="flex items-center gap-4">
              <label htmlFor="language-select" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Translate to:
              </label>
              <div className="relative flex-1 max-w-xs">
                <select
                  id="language-select"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 dark:focus:ring-blue-400"
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-gray-400 dark:text-gray-500" />
              </div>
              <Button onClick={handleTranslate} disabled={isTranslating}>
                {isTranslating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Translating...
                  </>
                ) : (
                  'Translate'
                )}
              </Button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
                {error}
              </div>
            )}

            {/* Original Content */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Original
                {translatedData && (
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({translatedData.sourceLanguage})
                  </span>
                )}
              </h3>
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-md">
                {originalSubject && (
                  <div className="font-medium mb-2 text-gray-900 dark:text-gray-100">{originalSubject}</div>
                )}
                <div className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200">{originalContent}</div>
              </div>
            </div>

            {/* Translated Content */}
            {translatedData && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Translated
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    (
                    {languages.find((l) => l.code === selectedLanguage)?.name ??
                      selectedLanguage}
                    )
                  </span>
                </h3>
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-md">
                  {translatedData.subject && (
                    <div className="font-medium mb-2 text-gray-900 dark:text-gray-100">{translatedData.subject}</div>
                  )}
                  <div className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200">{translatedData.content}</div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
