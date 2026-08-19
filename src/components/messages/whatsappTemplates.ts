/**
 * WhatsApp template rendering for the composer.
 *
 * Once the 24-hour window has closed, an approved template is the only thing Meta will
 * deliver. The agent picks one and fills its positional parameters; this turns that into
 * the text the customer will actually receive.
 *
 * The rule here MIRRORS the backend's `renderTemplateBody`, deliberately: the server
 * renders the body it stores and sends, and if this preview disagreed the agent would
 * approve one message and send another. Any change to one must change the other.
 *
 * ONE deliberate difference: an EMPTY string leaves the placeholder visible here, while
 * the server would substitute the blank. That case cannot reach the server —
 * `templateReadyToSend` refuses to send a blank parameter — so the divergence exists only
 * in the half-filled form, where showing `{{2}}` is what tells the agent it is unfinished.
 */

export type WhatsAppTemplate = {
  id: number;
  name: string;
  language: string;
  category: string;
  bodyText: string | null;
  variableCount: number;
  /** Human-facing price band, e.g. "Utility — low per-message rate". Comes from the server. */
  cost: string;
};

/**
 * Substitute positional parameters into a template body.
 *
 * Every occurrence of `{{n}}` is replaced, so a body repeating `{{1}}` renders both from
 * a single value — the counterpart to the parameter count being the HIGHEST index rather
 * than the number of occurrences. An index with no value yet is left visible rather than
 * blanked, so a half-filled preview reads as unfinished instead of as finished copy with
 * a hole in it.
 */
export const renderTemplatePreview = (
  bodyText: string | null | undefined,
  parameters: string[]
): string =>
  (bodyText ?? '').replace(/\{\{\s*(\d+)\s*\}\}/g, (placeholder, index: string) => {
    const value = parameters[Number(index) - 1];
    return value === undefined || value === '' ? placeholder : value;
  });

/**
 * Whether this template can be sent yet.
 *
 * Requires every parameter to hold real text. Blank ones would pass the server's count
 * check — it compares lengths, not content — and reach the customer as a gap in the
 * middle of a sentence.
 */
export const templateReadyToSend = (
  template: WhatsAppTemplate | null,
  parameters: string[]
): boolean => {
  if (!template) return false;
  if (parameters.length !== template.variableCount) return false;
  return parameters.every((value) => value.trim().length > 0);
};

/** Blank parameter slots for a freshly chosen template. */
export const emptyParameters = (template: WhatsAppTemplate): string[] =>
  Array.from({ length: template.variableCount }, () => '');
