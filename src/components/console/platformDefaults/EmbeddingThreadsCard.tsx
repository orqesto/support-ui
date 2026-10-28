import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { usePlatformQueueStatus } from '@/hooks/usePlatformAdmin';
import { useUpdatePlatformIngestion } from '@/hooks/usePlatformSettings';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { readEmbeddingStatus } from '@/services/embeddingThreads';
import type { EmbeddingThreadsInput, EmbeddingThreadsSettings } from '@/services/embeddingThreads';

export const EMBEDDING_THREADS_NOT_DEPLOYED =
  'This server cannot set embedding threads yet — it arrives with the next backend release.';

type RoleDef = {
  stored: 'threadsApi' | 'threadsWorker' | 'threadsAll';
  input: keyof EmbeddingThreadsInput;
  label: string;
  hint: string;
};

const ROLES: RoleDef[] = [
  {
    stored: 'threadsAll',
    input: 'embeddingThreadsAll',
    label: 'Single server (API and background work together)',
    hint: 'The usual setup: one server answers agents and runs imports.',
  },
  {
    stored: 'threadsApi',
    input: 'embeddingThreadsApi',
    label: 'API server (split setup)',
    hint: 'Searches and drafts while an agent waits.',
  },
  {
    stored: 'threadsWorker',
    input: 'embeddingThreadsWorker',
    label: 'Background worker (split setup)',
    hint: 'Imports and knowledge-base processing.',
  },
];

const SOURCE_LABEL = { console: 'Console', env: 'Environment', default: 'Default' } as const;

/** The text as a whole number within the bounds, or null. Blank = keep the saved value. */
const asThreads = (text: string, min: number, max: number): number | null => {
  const value = Number(text);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
};

/**
 * Platform Defaults → Embedding threads (2026-10-28): how many CPU cores the local embedding model
 * may use, per server role, saved through the same partial PUT /settings/ingestion. The live value,
 * where it came from and the embedding CPU come from queue-status (the server answering it).
 */
export const EmbeddingThreadsCard = ({
  embeddingThreads,
}: {
  embeddingThreads: EmbeddingThreadsSettings | undefined;
}) => {
  const save = useUpdatePlatformIngestion();
  const queue = usePlatformQueueStatus();
  const live = readEmbeddingStatus(queue.data);
  const seedKey = ROLES.map((role) => embeddingThreads?.[role.stored] ?? '').join('|');
  const seed = () =>
    Object.fromEntries(
      ROLES.map((role) => [role.input, String(embeddingThreads?.[role.stored] ?? '')])
    );
  const [texts, setTexts] = useState<Record<string, string>>(seed);
  useEffect(() => {
    setTexts(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seedKey stands for the saved values
  }, [seedKey]);

  if (!embeddingThreads) {
    return (
      <Card data-config-card="Embedding threads">
        <CardHeader>
          <CardTitle className="flex gap-2 items-center text-xl">
            <Cpu className="w-5 h-5" />
            Embedding threads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{EMBEDDING_THREADS_NOT_DEPLOYED}</p>
        </CardContent>
      </Card>
    );
  }

  const { min, max } = embeddingThreads;
  const changed: EmbeddingThreadsInput = {};
  let invalid = false;
  for (const role of ROLES) {
    const text = (texts[role.input] ?? '').trim();
    if (text === '') continue;
    const value = asThreads(text, min, max);
    if (value === null) invalid = true;
    else if (value !== embeddingThreads[role.stored]) changed[role.input] = value;
  }
  const nothingChanged = Object.keys(changed).length === 0;
  const serverError = save.isError ? getApiErrorMessage(save.error) : undefined;

  return (
    <Card data-config-card="Embedding threads">
      <CardHeader>
        <CardTitle className="flex gap-2 items-center text-xl">
          <Cpu className="w-5 h-5" />
          Embedding threads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          How many processor cores the built-in search model may use to read mail and documents. A
          lower number leaves more of the processor for agents using the app; a higher number
          finishes imports and knowledge-base updates faster. A change applies within about a
          minute, without a restart. A server never uses more than its cores minus one.
        </p>
        {live ? (
          <div className="flex flex-wrap gap-2 items-center text-sm" data-testid="embedding-live">
            <span>
              This server ({live.role}) uses <strong>{live.effective}</strong>{' '}
              {live.effective === 1 ? 'thread' : 'threads'} (at most {live.max} here)
            </span>
            <Badge variant={live.source === 'console' ? 'success' : 'secondary'}>
              {SOURCE_LABEL[live.source]}
            </Badge>
            <span className="text-muted-foreground">
              {!live.childAlive
                ? 'Model not loaded right now.'
                : live.cores === null
                  ? 'Embedding CPU: not measured yet.'
                  : `Embedding CPU: ${live.cores.toFixed(2)} cores.`}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            The live value is not available from this server yet.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {ROLES.map((role) => {
            const text = texts[role.input] ?? '';
            const bad = text.trim() !== '' && asThreads(text.trim(), min, max) === null;
            return (
              <div key={role.input} className="space-y-1">
                <Input
                  type="number"
                  min={min}
                  max={max}
                  step={1}
                  label={role.label}
                  placeholder="Not set"
                  value={text}
                  error={bad ? `Enter a whole number from ${min} to ${max}.` : undefined}
                  onChange={(event) => {
                    save.reset();
                    setTexts((current) => ({ ...current, [role.input]: event.target.value }));
                  }}
                />
                <p className="text-xs text-muted-foreground">{role.hint}</p>
              </div>
            );
          })}
        </div>
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        <Button
          disabled={save.isPending || invalid || nothingChanged}
          onClick={() => save.mutate(changed)}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
};
