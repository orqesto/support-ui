/**
 * BE R17 `settingsLookupFailed`: the stored limit settings could not be read, so the backend
 * resolved the limit without them — to the server environment setting when one is set, else the
 * built-in default (tokenBudget `effectiveTokenLimit`). Named from the figure's own `source`:
 * "the default limit" was said of an env figure too (FE audit pass 18, LOW). Null: the figure is a
 * stored one after all (a workspace or platform source), so nothing is qualified.
 */
export const fallbackLayer = (source: string | null | undefined): string | null => {
  if (source === 'env') return 'the server environment setting';
  if (source === 'default') return 'the built-in default';
  if (source === 'workspace' || source === 'platform') return null;
  return 'a fallback limit';
};
