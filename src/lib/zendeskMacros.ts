import DOMPurify from 'dompurify';
import { normalizeEditorHtml } from '@/lib/editorSchema';
import { escapeHtml } from '@/lib/editorText';
import { isBlankRichText } from '@/lib/stripHtml';

/**
 * Zendesk macros → reply templates. Reads the JSON Zendesk's API returns for
 * `GET /api/v2/macros.json` (or one `GET /api/v2/macros/{id}.json`) and turns each macro's reply
 * text into a template body, with Zendesk's placeholders rewritten to ours.
 *
 * Only the reply text is taken. A macro's other actions (status, priority, assignee, group, tags…)
 * have no template equivalent; they are listed per macro so the person importing sees what was
 * left behind. A Zendesk placeholder or Liquid tag with no equivalent stays as written and is
 * listed too.
 *
 * ⛔ The body is put in the editor's own form (`normalizeEditorHtml`), as a template written by
 * hand is: a ticket draft is made from the stored body directly, so HTML the editor would not hold
 * (inline styles, images, forms) must not be stored in the first place.
 */

export type ZendeskMacro = {
  title: string;
  active: boolean;
  description: string | null;
  /** HTML with our placeholders; '' when the macro sets no reply text. */
  body: string;
  /** Zendesk placeholders and Liquid tags left as written, each once. */
  unmappedFields: string[];
  /** Action fields other than the reply text, each once. */
  ignoredActions: string[];
};

export type ZendeskMacroFile = {
  macros: ZendeskMacro[];
  /** The export is one page of a longer list (`next_page` set): the rest is NOT in this file. */
  morePages: boolean;
  /** Zendesk's total for the whole list, when the file says. */
  total: number | null;
};

type RawAction = { field?: unknown; value?: unknown };
type RawMacro = {
  title?: unknown;
  raw_title?: unknown;
  active?: unknown;
  description?: unknown;
  actions?: unknown;
};

/**
 * Zendesk placeholder → ours. `{customer_name}` without a fallback refuses the send when the name
 * is unknown, so it gets one; `{first_name}` already greets "there".
 */
const FIELD_MAP: Record<string, string> = {
  'ticket.requester.first_name': '{first_name}',
  'ticket.requester.name': '{customer_name|there}',
  'ticket.id': '{ticket_id}',
  'current_user.name': '{agent_name}',
};

const REPLY_FIELDS = new Set(['comment_value_html', 'comment_value']);

/** Plain `comment_value` text as paragraphs: a blank line splits them, a newline breaks a line. */
const plainToHtml = (text: string): string =>
  text
    .split(/\r?\n\s*\r?\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');

/**
 * `{{ticket.requester.first_name}}`, also as `\{{…}}` (how Zendesk's editor sometimes stores it)
 * and with spaces inside the braces. A placeholder with a Liquid filter (`{{x | upcase}}`) is not
 * matched by the inner pattern and so stays as written — and is reported. So is Liquid logic
 * (`{% if … %}`), which would otherwise reach the customer as text.
 */
const convertFields = (html: string): { body: string; unmapped: string[] } => {
  const unmapped = new Set<string>();
  const body = html.replace(/\\?\{\{\s*([^{}]*?)\s*\}\}/g, (match, inner: string) => {
    const mapped = FIELD_MAP[inner];
    if (mapped) return mapped;
    unmapped.add(`{{${inner}}}`);
    return match;
  });
  for (const [tag] of body.matchAll(/\{%[^%]{0,200}%\}/g)) unmapped.add(tag);
  return { body, unmapped: [...unmapped] };
};

const toMacro = (raw: RawMacro): ZendeskMacro | null => {
  const title = typeof raw.title === 'string' ? raw.title : raw.raw_title;
  if (typeof title !== 'string' || !title.trim()) return null;
  const actions = (Array.isArray(raw.actions) ? raw.actions : []) as RawAction[];
  const html = actions.find((action) => action.field === 'comment_value_html')?.value;
  const plain = actions.find((action) => action.field === 'comment_value')?.value;
  const source =
    typeof html === 'string' && html.trim()
      ? html
      : typeof plain === 'string'
        ? plainToHtml(plain)
        : '';
  const normalized = normalizeEditorHtml(DOMPurify.sanitize(source));
  const { body, unmapped } = convertFields(normalized);
  return {
    title: title.trim(),
    active: raw.active !== false,
    description: typeof raw.description === 'string' && raw.description ? raw.description : null,
    body: isBlankRichText(body) ? '' : body,
    unmappedFields: unmapped,
    ignoredActions: [
      ...new Set(
        actions
          .map((action) => action.field)
          .filter((field): field is string => typeof field === 'string' && !REPLY_FIELDS.has(field))
      ),
    ],
  };
};

/**
 * The macros in an export, in file order. Text after the last `}` is ignored (a saved API
 * response can carry a stray character after it). Throws when the file is not a macros export.
 */
export const parseZendeskMacros = (text: string): ZendeskMacroFile => {
  let data: unknown;
  try {
    data = JSON.parse(text.slice(0, text.lastIndexOf('}') + 1));
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const wrapper = (data ?? {}) as {
    macros?: unknown;
    macro?: unknown;
    next_page?: unknown;
    count?: unknown;
  };
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(wrapper.macros)
      ? wrapper.macros
      : wrapper.macro
        ? [wrapper.macro]
        : null;
  if (!rows) throw new Error('No macros found — upload the JSON from Zendesk’s macros API.');
  return {
    macros: rows
      .map((row) => toMacro((row ?? {}) as RawMacro))
      .filter((macro): macro is ZendeskMacro => macro !== null),
    morePages: typeof wrapper.next_page === 'string' && wrapper.next_page.length > 0,
    total: typeof wrapper.count === 'number' ? wrapper.count : null,
  };
};
