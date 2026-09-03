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

  // ⛔ A streaming variant (`streamMessageTranslation`) used to live here. It was never
  // called from anywhere, and it could never have worked when it was: it bypassed
  // `apiClient` with a raw fetch to a RELATIVE `/api/...` URL, and every deployed FE
  // serves the API from a different origin — the request would have hit the SPA host and
  // received index.html. Removed rather than fixed so nobody wires up a silent failure;
  // the BE `/messages/:id/stream` endpoint still exists if streaming is ever wanted,
  // in which case go through API_BASE_URL and the auth handling apiClient provides.
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
