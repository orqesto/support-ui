import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

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

    let mounted = true;
    const controller = new AbortController();

    type SSEData =
      | { type: 'start'; sourceLang: string; targetLanguage: string }
      | { type: 'chunk'; field: 'content' | 'subject'; text: string }
      | { type: 'done' }
      | { type: 'error'; error: string };

    const run = async () => {
      try {
        const response = await fetch(`/api/translation/messages/${messageId}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetLanguage }),
          signal: controller.signal,
          credentials: 'include',
        });

        if (!response.ok || !response.body) {
          throw new Error(`Server error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            const data = JSON.parse(raw) as SSEData;
            if (data.type === 'chunk') {
              onChunk(data.field, data.text);
            } else if (data.type === 'done') {
              if (mounted) setIsTranslating(false);
              onComplete?.();
              return;
            } else if (data.type === 'error') {
              const errMsg = data.error || 'Translation failed';
              if (mounted) { setIsTranslating(false); setError(errMsg); }
              onError?.(errMsg);
              return;
            }
          }
        }

        if (mounted) setIsTranslating(false);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        const errorMessage = err instanceof Error ? err.message : 'Stream failed';
        if (mounted) { setError(errorMessage); setIsTranslating(false); }
        onError?.(errorMessage);
      }
    };

    void run();

    return () => {
      mounted = false;
      controller.abort();
      setIsTranslating(false);
    };
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
      logger.error('Failed to fetch supported languages:', err);
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
      logger.error('Failed to fetch supported languages:', err);
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
