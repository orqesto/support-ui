/**
 * Reply-template placeholders — `{first_name|there}`, `{{ticket_id}}` — mirroring the BE's
 * replyPlaceholders (filled for each thread at send, or by AI draft's polish before the model).
 *
 * ⛔ A fresh literal per call: a shared /g regex keeps lastIndex between `.test()` and `.replace()`.
 */
const KEYS = 'first_name|customer_name|ticket_id|thread_id|agent_name';
const placeholderPattern = (flags = ''): RegExp =>
  new RegExp(
    `\\{\\{(?:${KEYS})(?:\\|[^{}]{0,200})?\\}\\}|\\{(?:${KEYS})(?:\\|[^{}]{0,200})?\\}`,
    flags
  );

export const hasTemplatePlaceholders = (text: string): boolean => placeholderPattern().test(text);

/**
 * Swap each placeholder for an opaque marker before the text goes to a model that would otherwise
 * translate or reword it (`{first_name|there}` → `{first_name|dort}`), and put them back after.
 * A marker the model dropped leaves its placeholder out — the agent sees the result in the editor.
 */
export const shieldPlaceholders = (
  text: string
): { text: string; restore: (translated: string) => string } => {
  const found: string[] = [];
  const shielded = text.replace(placeholderPattern('g'), (match) => {
    found.push(match);
    return `[[${found.length - 1}]]`;
  });
  return {
    text: shielded,
    restore: (translated) =>
      translated.replace(/\[\[(\d+)\]\]/g, (match, index: string) => found[Number(index)] ?? match),
  };
};
