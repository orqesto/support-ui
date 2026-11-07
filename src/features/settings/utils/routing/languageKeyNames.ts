/**
 * Mirror of the backend's LANGUAGE_KEY_NAMES (BE src/shared/routing/languageKeyNames.ts): only
 * PRE-SELECTS the type when an admin types a new key name. The stored type decides routing.
 */
const LANGUAGE_KEY_NAMES = new Set([
  'language',
  'languages',
  'lang',
  'langs',
  'locale',
  'idioma',
  'idiomas',
  'sprache',
  'sprachen',
  'langue',
  'langues',
  'lingua',
  'lingue',
  'taal',
  'jezik',
  'język',
  'язык',
  'языки',
  'мова',
  'valoda',
  'kalba',
  'keel',
  'kieli',
  'språk',
  'sprog',
]);

export const isLanguageKeyName = (name: string): boolean =>
  LANGUAGE_KEY_NAMES.has(name.toLowerCase().replace(/[_-]/g, ''));
