/**
 * "es" → "Spanish" for display. Falls back to the upper-cased code when the runtime has no name
 * for it (or no Intl.DisplayNames at all), so an unknown code still shows as itself rather than
 * vanishing or being mislabelled.
 */
export const languageName = (code: string | null | undefined): string | null => {
  const value = code?.trim();
  if (!value) return null;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(value);
    if (name && name.toLowerCase() !== value.toLowerCase()) return name;
  } catch {
    // An invalid tag throws — fall through to the code itself.
  }
  return value.toUpperCase();
};
