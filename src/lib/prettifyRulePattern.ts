/**
 * Display-only prettifier for rule pattern values.
 *
 * The stored pattern is raw regex and is never changed — this only affects
 * what the admin sees in the table cell. The edit form always receives the
 * raw value so power users can keep working with full regex syntax.
 *
 * Transforms applied (in order):
 *  1. \b(a|b|c)\b  → "a, b, c"  (the common seeded shape)
 *  2. a|b|c        → "a, b, c"  (plain pipe-OR of word tokens)
 *  3. Unicode escape sequences  → human label  (e.g. "zero-width chars")
 *  4. Everything else            → raw value unchanged
 */
export function prettifyRulePattern(pattern: string): string {
  if (!pattern) return '';

  // Unwrap \b(...)\b if present
  const wrapped = pattern.match(/^\\b\(([^)]+)\)\\b$/);
  const inner = wrapped ? wrapped[1] : pattern;

  // If it's purely a pipe-OR of plain word tokens, show as comma list
  if (/^[\w\s'-]+(\|[\w\s'-]+)*$/.test(inner)) {
    return inner
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .join(', ');
  }

  // Known Unicode-escape-heavy patterns — replace with a readable label
  const unicodeEscapePattern = /\\u[0-9A-Fa-f]{4}/g;
  if (unicodeEscapePattern.test(inner)) {
    // Build a short label: collect the named categories present
    const labels: string[] = [];
    if (/\\u200[BCDEFbcdef]|\\u200[0-9]/.test(inner)) labels.push('zero-width chars');
    if (/\\uFEFF/.test(inner)) labels.push('BOM');
    if (/\\u00AD/.test(inner) || /&shy;/.test(inner)) labels.push('soft hyphens');
    if (/\\u202[0-9A-Fa-f]/.test(inner)) labels.push('formatting chars');
    if (labels.length > 0) return labels.join(' + ') + ' (regex)';
    return 'unicode chars (regex)';
  }

  // Patterns containing HTML entities or soft-hyphen sequences
  if (/&shy;/.test(pattern) || /&#/.test(pattern)) {
    return 'HTML entity pattern (regex)';
  }

  return pattern;
}
