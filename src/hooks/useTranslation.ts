import { useState, useCallback } from 'react';
import { apiClient } from '../lib/api-client';

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
      const response = await apiClient.post<TranslationResponse>(
        `/api/translation/messages/${messageId}/translate`,
        { targetLanguage }
      );
      return response.data;
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
      const response = await apiClient.post<TranslationResponse>(
        `/api/translation/tickets/${ticketId}/translate`,
        { targetLanguage }
      );
      return response.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Translation failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsTranslating(false);
    }
  };

  return {
    translateMessage,
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
    .get<{ languages: SupportedLanguage[] }>('/api/translation/languages')
    .then((response) => {
      languagesCache = response.data.languages;
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
