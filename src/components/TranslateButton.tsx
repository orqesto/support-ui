import { useState, useEffect } from 'react';
import { Languages, ChevronDown, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useTranslation, useSupportedLanguages } from '@/hooks/useTranslation';
import { linkifyText } from '@/lib/linkify';

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
    if (isOpen) {
      void fetchLanguages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fetchLanguages]);

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
        <Languages className="mr-2 w-4 h-4" />
        Translate
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <div className="flex justify-between items-center">
                <span className="flex gap-2 items-center">
                  <Languages className="w-5 h-5" />
                  Translate Content
                </span>
                <Button variant="ghost" size="sm" onClick={handleClose} className="p-0 w-8 h-8">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Language Selector */}
            <div className="flex gap-4 items-center">
              <label
                htmlFor="language-select"
                className="text-sm font-medium text-gray-900 dark:text-gray-100"
              >
                Translate to:
              </label>
              <div className="relative flex-1 max-w-xs">
                <select
                  id="language-select"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="px-3 py-2 pr-8 w-full text-gray-900 bg-white rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:focus:ring-blue-400"
                >
                  {languages && languages.length > 0 ? (
                    languages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))
                  ) : (
                    <option value="en">English</option>
                  )}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 w-4 h-4 text-gray-400 -translate-y-1/2 pointer-events-none dark:text-gray-500" />
              </div>
              <Button onClick={handleTranslate} disabled={isTranslating}>
                {isTranslating ? (
                  <>
                    <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                    Translating...
                  </>
                ) : (
                  'Translate'
                )}
              </Button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 text-sm text-red-800 bg-red-50 rounded-md border border-red-200 dark:bg-red-950/30 dark:border-red-800 dark:text-red-200">
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
              <div className="p-4 bg-gray-50 rounded-md border border-gray-200 dark:bg-gray-800/50 dark:border-gray-700">
                {originalSubject && (
                  <div className="mb-2 font-medium text-gray-900 dark:text-gray-100">
                    {linkifyText(originalSubject)}
                  </div>
                )}
                <div className="text-sm text-gray-800 whitespace-pre-wrap dark:text-gray-200">
                  {linkifyText(originalContent)}
                </div>
              </div>
            </div>

            {/* Translated Content */}
            {translatedData && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Translated
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({languages?.find((l) => l.code === selectedLanguage)?.name ?? selectedLanguage}
                    )
                  </span>
                </h3>
                <div className="p-4 bg-blue-50 rounded-md border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800/50">
                  {translatedData.subject && (
                    <div className="mb-2 font-medium text-gray-900 dark:text-gray-100">
                      {linkifyText(translatedData.subject)}
                    </div>
                  )}
                  <div className="text-sm text-gray-800 whitespace-pre-wrap dark:text-gray-200">
                    {linkifyText(translatedData.content)}
                  </div>
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
