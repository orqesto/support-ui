import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

type TranslationResponse = {
  original: {
    subject?: string;
    title?: string;
    content: string;
    description?: string;
    language: string;
  };
  translated: {
    subject?: string;
    title?: string;
    content: string;
    description?: string;
    language: string;
  };
};

type SupportedLanguage = {
  code: string;
  name: string;
};

export const useTranslation = () => {
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translateMessage = async (messageId: number, targetLanguage: string) => {
    setIsTranslating(true);
    setError(null);

    try {
      const response = await apiClient.post<{ success: boolean; data: TranslationResponse }>(
        `/api/translation/messages/${messageId}/translate`,
        { targetLanguage }
      );
      return response.data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Translation failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsTranslating(false);
    }
  };

  const translateTicket = async (ticketId: number, targetLanguage: string) => {
    setIsTranslating(true);
    setError(null);

    try {
      const response = await apiClient.post<{ success: boolean; data: TranslationResponse }>(
        `/api/translation/tickets/${ticketId}/translate`,
        { targetLanguage }
      );
      return response.data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Translation failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsTranslating(false);
    }
  };

  const streamMessageTranslation = (
    messageId: number,
    targetLanguage: string,
    onChunk: (field: 'content' | 'subject', text: string) => void,
    onComplete?: () => void,
    onError?: (error: string) => void
  ) => {
    setIsTranslating(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const eventSource = new EventSource(
        `/api/translation/messages/${messageId}/stream?token=${token}&targetLanguage=${targetLanguage}`
      );

      type SSEData =
        | { type: 'start'; sourceLang: string; targetLanguage: string }
        | { type: 'chunk'; field: 'content' | 'subject'; text: string }
        | { type: 'done' }
        | { type: 'error'; error: string };

      eventSource.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data as string) as SSEData;

        if (data.type === 'chunk') {
          onChunk(data.field, data.text);
        } else if (data.type === 'done') {
          eventSource.close();
          setIsTranslating(false);
          if (onComplete) {
            onComplete();
          }
        } else if (data.type === 'error') {
          eventSource.close();
          setIsTranslating(false);
          const errMsg = data.error || 'Translation failed';
          setError(errMsg);
          if (onError) {
            onError(errMsg);
          }
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setIsTranslating(false);
        const errMsg = 'Connection failed';
        setError(errMsg);
        if (onError) {
          onError(errMsg);
        }
      };

      // Return cleanup function
      return () => {
        eventSource.close();
        setIsTranslating(false);
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Stream failed';
      setError(errorMessage);
      setIsTranslating(false);
      if (onError) {
        onError(errorMessage);
      }
    }
  };

  return {
    translateMessage,
    streamMessageTranslation,
    translateTicket,
    isTranslating,
    error,
  };
};

// Singleton cache for languages to prevent multiple fetches
let languagesCache: SupportedLanguage[] | null = null;
let languagesFetchPromise: Promise<SupportedLanguage[]> | null = null;

const fetchLanguagesOnce = async (): Promise<SupportedLanguage[]> => {
  // Return cache if available
  if (languagesCache) {
    return languagesCache;
  }

  // Return existing promise if already fetching
  if (languagesFetchPromise) {
    return languagesFetchPromise;
  }

  // Start new fetch
  languagesFetchPromise = apiClient
    .get<{ success: boolean; data: { languages: SupportedLanguage[] } }>(
      '/api/translation/languages'
    )
    .then((response) => {
      languagesCache = response.data.data.languages;
      languagesFetchPromise = null;
      return languagesCache;
    })
    .catch((err) => {
      console.error('Failed to fetch supported languages:', err);
      languagesFetchPromise = null;
      return [];
    });

  return languagesFetchPromise;
};

export const useSupportedLanguages = () => {
  const [languages, setLanguages] = useState<SupportedLanguage[]>(languagesCache ?? []);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLanguages = useCallback(async () => {
    // If already cached, just use cache
    if (languagesCache) {
      setLanguages(languagesCache);
      return;
    }

    setIsLoading(true);
    try {
      const langs = await fetchLanguagesOnce();
      setLanguages(langs);
    } catch (err) {
      console.error('Failed to fetch supported languages:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    languages,
    isLoading,
    fetchLanguages,
  };
};
