import { useState } from 'react';
import { Brain } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfigCard, type ConfigSummaryRow } from '@/components/ui/ConfigCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import {
  useIsSavingPlatformReasoning,
  useUpdatePlatformReasoning,
} from '@/hooks/usePlatformSettings';
import { useConfigCardState } from '@/hooks/useConfigCardState';
import { formatError, getErrorBody, getErrorStatus } from '@/lib/errorMessages';
import type {
  PlatformReasoning,
  ReasoningInput,
} from '@/services/platformSettings.service';

const TITLE = 'AI reasoning';

/**
 * Readable names for the backend's feature ids. The LIST comes from the server
 * (`options.features`); this only names them. An id missing here is shown as-is, so a feature
 * added on the backend is still settable before this map learns its name.
 */
const FEATURE_LABELS: Record<string, string> = {
  suggested_answer: 'Suggested answers',
  lead_qualification: 'Lead qualification',
  clarifying_questions: 'Clarifying questions',
  follow_up: 'Follow-up questions',
  missing_info: 'Missing-information requests',
  response_rules: 'Response rules',
  chat_widget: 'Chat widget',
  landing_assistant: 'Website assistant',
  translation: 'Translation',
  ticket_enhance: 'Ticket enhancement',
  spam_detection: 'Spam detection',
  billing_extraction: 'Billing extraction',
  ocr_refine: 'OCR clean-up',
  kb_quality: 'Knowledge base quality',
  reply_style: 'Reply style',
  vision: 'Image analysis',
  language_detection: 'Language detection',
  message_analysis: 'Message analysis',
  message_enrichment: 'Message enrichment',
  contradiction_detection: 'Contradiction detection',
  rule_seed_enrichment: 'Rule seed enrichment',
  // `other` is the label of the provider health pings (aiProviderRecoverySweep). A call that
  // names NO feature never reads a per-feature level: it gets the default level.
  other: 'Other (provider health checks)',
};

export const featureLabel = (feature: string): string => FEATURE_LABELS[feature] ?? feature;

/**
 * Features the backend lists but that make no AI call on this server yet (checked in BE-service:
 * `landing_assistant` appears only in the TokenUsageFeature type and AI_FEATURE_AUDIENCE, no call
 * site passes it). Still listed and settable, so a level saved now applies once a call exists —
 * but the row says so, rather than implying the setting does something today.
 */
const FEATURES_WITHOUT_AI_CALLS: ReadonlySet<string> = new Set(['landing_assistant']);

const EFFORT_LABELS: Record<string, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
const effortLabel = (effort: string): string => EFFORT_LABELS[effort] ?? effort;

const MODEL_DEFAULT = 'Model default (not sent)';

/** '' means "absent" everywhere in the draft: nothing is sent for it. */
type Draft = { defaultEffort: string; byFeature: Record<string, string>; headroom: string };

const seedDraft = (stored: ReasoningInput): Draft => ({
  defaultEffort: stored.defaultEffort ?? '',
  byFeature: { ...(stored.effortByFeature ?? {}) },
  headroom: stored.headroomTokens !== undefined ? String(stored.headroomTokens) : '',
});

type Vocabulary = { features: string[]; efforts: string[] };

/**
 * The COMPLETE object a save sends. The PATCH replaces the stored value, so anything left out
 * here is cleared on the server — a feature on "Default level" is left out on purpose, and a
 * feature or level the server does not list is dropped rather than sent into a 400.
 */
const toInput = (draft: Draft, { features, efforts }: Vocabulary): ReasoningInput => {
  const input: ReasoningInput = {};
  if (efforts.includes(draft.defaultEffort)) input.defaultEffort = draft.defaultEffort;
  const byFeature = Object.fromEntries(
    features
      .filter((feature) => efforts.includes(draft.byFeature[feature] ?? ''))
      .map((feature) => [feature, draft.byFeature[feature]])
  );
  if (Object.keys(byFeature).length > 0) input.effortByFeature = byFeature;
  const headroom = draft.headroom.trim();
  if (headroom !== '') input.headroomTokens = Number(headroom);
  return input;
};

/** Identity of a draft or a stored value, independent of key order and blank entries. */
const keyOf = (input: ReasoningInput): string =>
  JSON.stringify([
    input.defaultEffort ?? '',
    Object.entries(input.effortByFeature ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    input.headroomTokens ?? null,
  ]);

const FIELD_NAMES: Record<string, string> = {
  defaultEffort: 'Default level',
  effortByFeature: 'Per-feature levels',
  headroomTokens: 'Reasoning headroom',
};

/** "effortByFeature.translation" → "Translation"; the whole-object marker `_` and an empty path
 *  are not fields. */
const fieldName = (path: string): string | null => {
  if (path === '_' || path.trim() === '') return null;
  const [head, feature] = path.split('.');
  if (head === 'effortByFeature' && feature) return `${featureLabel(feature)} level`;
  return FIELD_NAMES[head] ?? path;
};

/**
 * One line per part of the saved row this server could not use, in plain words. `stored` is
 * only the usable part, so these are exactly what the next save drops or rewrites.
 */
const problemLines = (reasoning: PlatformReasoning): string[] => [
  ...reasoning.ignoredFeatures.map(
    (feature) => `Saved level for ${featureLabel(feature)} isn't a feature this server knows, and is ignored.`
  ),
  ...reasoning.ignoredFields.map(
    (path) => `Saved value for ${fieldName(path) ?? path} isn't valid on this server and is ignored.`
  ),
  ...reasoning.adjustedFields.map(({ field, stored, used }) => {
    const name = field === 'headroomTokens' ? 'Headroom' : (fieldName(field) ?? field);
    if (stored === null || used === null) {
      return `Saved value for ${name} is outside what this server accepts, and is adjusted.`;
    }
    const bound = stored < used ? 'below the minimum' : 'above the maximum';
    return `${name} ${stored} is ${bound}; ${used} is used.`;
  }),
];

/**
 * What a refused save says, in this card, next to the form. A 400 names the field the server
 * rejected; a 403 says it is a permission problem, not a value problem.
 */
const describeSaveError = (error: unknown): string => {
  const status = getErrorStatus(error);
  if (status === 403) {
    return 'The server refused the change: your account is not allowed to edit platform settings.';
  }
  const body = getErrorBody(error);
  if (status === 400 && body?.code === 'VALIDATION_FAILED' && Array.isArray(body.fields)) {
    const names = body.fields
      .filter((field): field is string => typeof field === 'string')
      .map(fieldName)
      .filter((name): name is string => name !== null);
    if (names.length > 0) {
      return `The server rejected these values, so nothing was saved: ${[...new Set(names)].join(', ')}.`;
    }
    return 'The server rejected the values, so nothing was saved.';
  }
  return formatError('save the reasoning settings', error);
};

/** Shown when the backend does not report the setting (it predates it). */
const UnavailableCard = () => (
  <Card data-config-card={TITLE}>
    <CardHeader>
      <CardTitle className="flex gap-2 items-center text-xl">
        <Brain className="w-5 h-5 text-ai" />
        {TITLE}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">
        Not available on this server. The backend this console is connected to does not report
        reasoning settings, so nothing can be read or saved here until it is updated.
      </p>
    </CardContent>
  </Card>
);

export const ReasoningCard = ({ reasoning }: { reasoning: PlatformReasoning | undefined }) =>
  reasoning ? <ReasoningForm reasoning={reasoning} /> : <UnavailableCard />;

const ReasoningForm = ({ reasoning }: { reasoning: PlatformReasoning }) => {
  const { stored, effective, options } = reasoning;
  const { min, max, default: defaultHeadroom } = options.headroomTokens;

  const [draft, setDraft] = useState<Draft>(() => seedDraft(stored));
  const [saveError, setSaveError] = useState<string | null>(null);
  /** The stored value changed (another admin, another tab) under unsaved edits. */
  const [serverMoved, setServerMoved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const vocabulary: Vocabulary = { features: options.features, efforts: options.efforts };
  const draftKey = keyOf(toInput(draft, vocabulary));
  // Through the same filter as the draft: a stored feature this server ignores is not part of
  // what a save sends, so it must not make an untouched form look edited.
  const storedKey = keyOf(toInput(seedDraft(stored), vocabulary));

  const reseed = () => {
    setDraft(seedDraft(stored));
    setSaveError(null);
    setServerMoved(false);
  };

  // A row holding only unusable parts still IS a stored row (its `stored` is {}), and Reset is
  // how it is cleared, so it counts as configured.
  // De-duplicated: each line is also its list key.
  const problems = [...new Set(problemLines(reasoning))];
  const configured = keyOf(stored) !== keyOf({}) || problems.length > 0;
  const card = useConfigCardState({ configured, onCancel: reseed });
  const update = useUpdatePlatformReasoning();

  /**
   * ⛔ NOTHING CAN BE EDITED WHILE A SAVE OR RESET IS IN FLIGHT. Every field, Edit, Reset and
   * Save are disabled until the request AND its refetch have settled (the hook refetches inside
   * the mutation). Four audit rounds each found a new defect in machinery that tried to reconcile
   * edits made mid-flight with the answer; removing the possibility removed the class.
   * Shared across instances (a mutation key), so a card remounted mid-save is locked too.
   */
  const busy = useIsSavingPlatformReasoning();

  /**
   * Re-seed when the STORED value changes — but never over edits.
   *
   * The draft follows the server when the editor is closed (nothing to protect, and Edit must
   * open on what is stored — this is also how our own save arrives, since the save's onSuccess
   * closes the editor first), when it is untouched (still what was last seeded), or when the
   * open draft already equals the new value (another admin saved exactly what I am typing:
   * nothing to warn about). Otherwise the editor holds edits and a DIFFERENT value arrived: the
   * edits stay and the card says the saved values moved.
   */
  const [seededFrom, setSeededFrom] = useState(storedKey);
  if (seededFrom !== storedKey) {
    setSeededFrom(storedKey);
    if (!card.isEditing || draftKey === seededFrom || draftKey === storedKey) {
      setDraft(seedDraft(stored));
      setServerMoved(false);
    } else {
      setServerMoved(true);
    }
  }

  const headroomText = draft.headroom.trim();
  const headroomInvalid =
    headroomText !== '' &&
    (!/^\d+$/.test(headroomText) || Number(headroomText) < min || Number(headroomText) > max);

  /** `fromEditor`: a Save, which closes the editor once stored; a Reset comes from the read-only view. */
  const send = (input: ReasoningInput, { fromEditor }: { fromEditor: boolean }) => {
    setSaveError(null);
    update.mutate(input, {
      onSuccess: () => {
        setServerMoved(false);
        if (fromEditor) card.confirmSaved();
      },
      onError: (error: unknown) => setSaveError(describeSaveError(error)),
    });
  };

  /** A message about an earlier Reset or save must not greet a fresh edit. */
  const startEditing = () => {
    setSaveError(null);
    card.startEditing();
  };

  const save = () => {
    if (headroomInvalid || busy) return;
    send(toInput(draft, vocabulary), { fromEditor: true });
  };

  const defaultLevelPhrase = draft.defaultEffort
    ? `Default level (${effortLabel(draft.defaultEffort)})`
    : `Default level: ${MODEL_DEFAULT}`;

  const effortOptions = options.efforts.map((effort) => (
    <option key={effort} value={effort}>
      {effortLabel(effort)}
    </option>
  ));

  const ignored = new Set(reasoning.ignoredFeatures);
  const storedByFeature = Object.entries(stored.effortByFeature ?? {}).filter(
    ([feature]) => options.features.includes(feature) && !ignored.has(feature)
  );

  /**
   * "High" with a headroom at or below the built-in default: the thinking can use up the limit
   * before any answer is written. Judged on what the card is SHOWING — the draft while editing,
   * the stored value otherwise, both without features this server ignores (a High on one of
   * those is never sent, so it is no reason to warn).
   */
  const shown = toInput(card.isEditing ? draft : seedDraft(stored), vocabulary);
  const shownHeadroom = card.isEditing
    ? headroomText === '' || headroomInvalid
      ? defaultHeadroom
      : Number(headroomText)
    : effective.headroomTokens.value;
  const highWithLowHeadroom =
    (shown.defaultEffort === 'high' ||
      Object.values(shown.effortByFeature ?? {}).includes('high')) &&
    shownHeadroom <= defaultHeadroom;
  const summary: ConfigSummaryRow[] = [
    {
      label: 'Default level',
      value: stored.defaultEffort ? effortLabel(stored.defaultEffort) : undefined,
      source: 'set here',
      placeholder: MODEL_DEFAULT,
    },
    ...(storedByFeature.length > 0
      ? storedByFeature.map(([feature, effort]) => ({
          label: featureLabel(feature),
          value: effortLabel(effort),
          source: 'set here',
        }))
      : [{ label: 'Per-feature levels', value: undefined, placeholder: 'none set' }]),
    {
      label: 'Reasoning headroom',
      value: `${effective.headroomTokens.value} tokens`,
      source: effective.headroomTokens.source === 'db' ? 'set here' : 'built-in default',
    },
  ];

  return (
    <>
      <ConfigCard
        title={TITLE}
        icon={<Brain className="w-5 h-5 text-ai" />}
        description="How much a GPT-5 or o-series model thinks before it answers, per AI feature, and how many extra tokens each of its requests is allowed for that thinking."
        state={card.state}
        summary={summary}
        emptyNote={`Nothing is set here, so no reasoning level is sent with any request and GPT-5 / o-series requests get the built-in headroom of ${defaultHeadroom} tokens.`}
        note={
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Levels are sent only to GPT-5 models (gpt-5, gpt-5-mini, gpt-5-nano, gpt-5.1 and
              later) and o-series models (o1, o3, o3-mini, o4-mini). Nothing is sent to other
              models, including gpt-4o, Claude, DeepSeek and Ollama models; to o1-mini or
              o1-preview; to any chat, pro, search, codex or deep-research variant (for example
              gpt-5-chat-latest, o3-pro, o3-deep-research); or on requests that carry tools. A
              level a model does not accept is moved to the nearest one it does.
            </p>
            <p className="text-xs text-muted-foreground">
              A change applies at once on the server that saves it; the other server processes
              pick it up within about a minute.
            </p>
            {problems.length > 0 && (
              <Alert variant="warning">
                <ul className="space-y-1">
                  {problems.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  {card.isEditing
                    ? 'Saving will drop the ignored entries and store adjusted values as they are used.'
                    : 'The next save or Reset drops the ignored entries and stores adjusted values as they are used.'}
                </p>
              </Alert>
            )}
            {highWithLowHeadroom && (
              <Alert variant="warning">
                A level is set to High while the headroom is {shownHeadroom} tokens, not above the
                built-in {defaultHeadroom}. High reasoning can use up the whole limit before any
                answer is written, which comes back as an empty reply. Consider a larger headroom.
              </Alert>
            )}
            {serverMoved && (
              <Alert variant="warning">
                The saved values changed on the server while you were editing. Your edits are
                still here; press Cancel to load the saved values instead.
              </Alert>
            )}
            {saveError && <Alert variant="danger">{saveError}</Alert>}
          </div>
        }
        extraActions={
          !card.isEditing && configured ? (
            <Button
              variant="outline"
              onClick={() => setConfirmReset(true)}
              isLoading={busy}
              disabled={busy}
            >
              Reset
            </Button>
          ) : null
        }
        onConfigure={startEditing}
        onEdit={startEditing}
        onCancel={card.cancelEditing}
        onSave={save}
        saveDisabled={headroomInvalid}
        saving={busy}
        editDisabled={busy}
        configureLabel="Configure reasoning"
        saveLabel="Save reasoning settings"
      >
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Saving replaces every value on this card: a feature left on the default level, a
            default level left on &quot;{MODEL_DEFAULT}&quot; and an empty headroom are all
            cleared on the server. &quot;{MODEL_DEFAULT}&quot; sends no level, so the model uses
            its own.
          </p>

          <div>
            <Label htmlFor="reasoning-default-effort">Default level</Label>
            <Select
              id="reasoning-default-effort"
              disabled={busy}
              value={draft.defaultEffort}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, defaultEffort: event.target.value }))
              }
            >
              <option value="">{MODEL_DEFAULT}</option>
              {effortOptions}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Used by every feature below that is left on the default level, and by calls that do
              not name a feature.
            </p>
          </div>

          <div>
            <Label htmlFor="reasoning-headroom">Reasoning headroom (tokens)</Label>
            <Input
              id="reasoning-headroom"
              // Text, not number: a number input reports "" for text it cannot parse ("8,000",
              // "3 000"), which read as "empty = default" and silently dropped the stored value.
              // The /^\d+$/ check below is the validation.
              type="text"
              inputMode="numeric"
              disabled={busy}
              value={draft.headroom}
              error={headroomInvalid ? `Enter a whole number from ${min} to ${max}.` : undefined}
              placeholder={String(defaultHeadroom)}
              onChange={(event) => setDraft((prev) => ({ ...prev, headroom: event.target.value }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Added to the token limit of every GPT-5 / o-series request, so the thinking does not
              use up the room for the answer. Leave empty for the built-in {defaultHeadroom}. A
              lower headroom risks empty replies: the model can spend the whole limit thinking.
              In effect now: {effective.headroomTokens.value} tokens (
              {effective.headroomTokens.source === 'db' ? 'saved here' : 'built-in default'}).
            </p>
          </div>

          <div className="pt-4 space-y-3 border-t border-border">
            <p className="text-sm font-medium text-foreground">Per feature</p>
            {options.features.map((feature) => {
              const id = `reasoning-feature-${feature}`;
              const current = draft.byFeature[feature] ?? '';
              return (
                <div key={feature} className="grid gap-2 items-center sm:grid-cols-2">
                  <Label htmlFor={id} className="mb-0">
                    {featureLabel(feature)}
                    {FEATURES_WITHOUT_AI_CALLS.has(feature) && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        (no AI calls yet)
                      </span>
                    )}
                  </Label>
                  <Select
                    id={id}
                    disabled={busy}
                    value={current}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        byFeature: { ...prev.byFeature, [feature]: event.target.value },
                      }))
                    }
                  >
                    <option value="">{defaultLevelPhrase}</option>
                    {effortOptions}
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      </ConfigCard>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        onConfirm={() => send({}, { fromEditor: false })}
        variant="danger"
        confirmText="Reset"
        title="Reset reasoning settings?"
        description={`This clears the default level, every per-feature level and the headroom. No reasoning level will be sent with any request, and the headroom goes back to the built-in ${defaultHeadroom} tokens.`}
      />
    </>
  );
};
