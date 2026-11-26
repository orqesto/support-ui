import type { RuleLibraryFlow } from './services/ruleLibrary.service';

/**
 * Editable payload fields per flow. Mirrors the backend's per-flow payload schemas
 * (`ruleLibraryPayloads.ts`): same keys, same kinds. The backend stays the validator (every schema
 * is strict and bounds are enforced there), so this list only decides which input to draw.
 */
export type FieldKind = 'text' | 'longtext' | 'number' | 'boolean' | 'enum' | 'list' | 'json';

export interface PayloadField {
  key: string;
  label: string;
  kind: FieldKind;
  /** A key the backend requires. An optional field left empty is dropped from the payload. */
  required?: boolean;
  /** number kinds: an empty input saves as null (the backend allows null for this key). */
  nullable?: boolean;
  options?: readonly string[];
}

const text = (key: string, label: string, required = true): PayloadField => ({ key, label, kind: 'text', required });
const long = (key: string, label: string, required = true): PayloadField => ({ key, label, kind: 'longtext', required });
const num = (key: string, label: string, nullable = false): PayloadField => ({ key, label, kind: 'number', required: true, nullable });
const pick = (key: string, label: string, options: readonly string[], required = true): PayloadField => ({
  key,
  label,
  kind: 'enum',
  required,
  options,
});

export const PAYLOAD_FIELDS: Record<RuleLibraryFlow, PayloadField[]> = {
  spam: [
    text('pattern', 'Pattern'),
    long('exampleText', 'Example text', false),
    pick('matchField', 'Match field', ['sender', 'subject', 'content'], false),
    text('category', 'Category'),
    num('severity', 'Severity (1-100)'),
  ],
  detection: [
    text('pattern', 'Pattern'),
    long('exampleText', 'Example text', false),
    text('category', 'Category'),
    num('confidence', 'Confidence (1-100)'),
  ],
  // The category keywords are ONE comma-separated text, not a list.
  categories: [long('keywords', 'Keywords (comma-separated)')],
  prompts: [text('type', 'Type'), long('prompt', 'Prompt')],
  contradiction: [
    long('exampleText', 'Example text'),
    text('category', 'Category'),
    num('confidenceThreshold', 'Confidence threshold'),
  ],
  kb_detection: [
    text('pattern', 'Pattern'),
    long('exampleText', 'Example text'),
    text('category', 'Category'),
    num('confidence', 'Confidence (1-100)'),
  ],
  priority: [
    pick('priority', 'Priority', ['critical', 'high', 'medium', 'low']),
    num('confidence', 'Confidence'),
    text('pattern', 'Pattern'),
    long('exampleText', 'Example text'),
  ],
  response: [
    text('category', 'Category'),
    text('triggerType', 'Trigger type'),
    long('exampleText', 'Example text'),
    long('responseTemplate', 'Response template'),
    text('responseType', 'Response type'),
    num('confidenceThreshold', 'Confidence threshold'),
    text('language', 'Language'),
    num('priority', 'Priority'),
    { key: 'contextConditions', label: 'Context conditions (JSON)', kind: 'json' },
  ],
  routing: [
    text('seedKey', 'Seed key'),
    pick('type', 'Match type', ['subject_contains', 'subject_regex', 'sender_domain', 'body_contains']),
    text('value', 'Value'),
    long('exampleText', 'Example text'),
    num('weight', 'Weight (1-100)'),
    pick('tier', 'Tier', ['specific', 'catchall'], false),
    { key: 'supersedes', label: 'Supersedes (one per line)', kind: 'list' },
  ],
  sla: [
    pick('type', 'Type', ['ticket', 'message']),
    pick('key', 'Key', [
      'low',
      'medium',
      'high',
      'critical',
      'email',
      'telegram',
      'slack',
      'chat',
      'whatsapp',
      'other',
    ]),
    num('firstResponseMinutes', 'First response (minutes)'),
    num('resolutionMinutes', 'Resolution (minutes, empty = no cap)', true),
  ],
  auto_reply: [
    { key: 'keywords', label: 'Keywords (one per line)', kind: 'list', required: true },
    long('replyText', 'Reply text'),
    { key: 'useKnowledgeBase', label: 'Use the knowledge base', kind: 'boolean', required: true },
    num('kbMinSimilarity', 'KB minimum similarity (0.8-0.99, empty = default)', true),
  ],
  capability: [
    pick('role', 'Role', [
      'generalRules',
      'billingExtraction',
      'receivesPromotional',
      'analysisPreferred',
      'intentRouted',
    ]),
  ],
};

/** Flows whose rows are embedded by the backend; a missing vector is only a defect for these. */
export const EMBEDDED_FLOWS: readonly RuleLibraryFlow[] = [
  'spam',
  'detection',
  'categories',
  'contradiction',
  'kb_detection',
  'priority',
  'response',
  'routing',
];

export const FLOW_LABELS: Record<RuleLibraryFlow, string> = {
  spam: 'Spam',
  detection: 'Detection',
  categories: 'Categories',
  prompts: 'Prompts',
  contradiction: 'Contradiction',
  kb_detection: 'KB detection',
  priority: 'Priority',
  response: 'Response',
  routing: 'Routing',
  sla: 'SLA',
  auto_reply: 'Auto reply',
  capability: 'Capability',
};

/** Form values are strings (booleans aside) until saved; this turns an item's payload into them. */
export type FieldValues = Record<string, string | boolean>;

export const valuesFromPayload = (flow: RuleLibraryFlow, payload: Record<string, unknown>): FieldValues => {
  const values: FieldValues = {};
  for (const field of PAYLOAD_FIELDS[flow]) {
    const raw = payload[field.key];
    if (field.kind === 'boolean') values[field.key] = raw === true;
    else if (field.kind === 'list') values[field.key] = Array.isArray(raw) ? raw.join('\n') : '';
    else if (field.kind === 'json') values[field.key] = raw === undefined ? '' : JSON.stringify(raw, null, 2);
    else values[field.key] = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  }
  return values;
};

/**
 * The payload to send. Starts from `base` so a key this list does not know is kept, then
 * overlays the edited fields. Throws an Error with a readable message on unparseable input.
 */
export const payloadFromValues = (
  flow: RuleLibraryFlow,
  base: Record<string, unknown>,
  values: FieldValues
): Record<string, unknown> => {
  const payload: Record<string, unknown> = { ...base };
  for (const field of PAYLOAD_FIELDS[flow]) {
    const raw = values[field.key];
    const str = typeof raw === 'string' ? raw : '';
    if (field.kind === 'boolean') {
      payload[field.key] = raw === true;
    } else if (field.kind === 'number') {
      if (str.trim() === '') {
        if (field.nullable) payload[field.key] = null;
        else delete payload[field.key];
      } else {
        const parsed = Number(str);
        if (!Number.isFinite(parsed)) throw new Error(`${field.label} must be a number.`);
        payload[field.key] = parsed;
      }
    } else if (field.kind === 'list') {
      const lines = str.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0 && !field.required) delete payload[field.key];
      else payload[field.key] = lines;
    } else if (field.kind === 'json') {
      if (str.trim() === '') delete payload[field.key];
      else {
        try {
          payload[field.key] = JSON.parse(str) as unknown;
        } catch {
          throw new Error(`${field.label} is not valid JSON.`);
        }
      }
    } else if (str === '' && !field.required) {
      delete payload[field.key];
    } else {
      payload[field.key] = str;
    }
  }
  return payload;
};
