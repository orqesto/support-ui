import type { QueueStatus } from './platform.service';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Embedding child threads per process role; null = not saved (that process uses its
 * EMBEDDING_THREADS env, else 1). min/max are the saved bounds; each box lowers a value above its
 * own cores − 1.
 */
export type EmbeddingThreadsSettings = {
  threadsApi: number | null;
  threadsWorker: number | null;
  threadsAll: number | null;
  min: number;
  max: number;
};
export type EmbeddingThreadsInput = {
  embeddingThreadsApi?: number;
  embeddingThreadsWorker?: number;
  embeddingThreadsAll?: number;
};
/** `ingestion.embeddingThreads`, or undefined on a backend without it or a malformed block. */
export const normalizeEmbeddingThreads = (raw: unknown): EmbeddingThreadsSettings | undefined => {
  if (!isObject(raw) || !Number.isInteger(raw.min) || !Number.isInteger(raw.max)) return undefined;
  const role = (value: unknown): number | null =>
    Number.isInteger(value) && (value as number) >= 1 ? (value as number) : null;
  return {
    threadsApi: role(raw.threadsApi),
    threadsWorker: role(raw.threadsWorker),
    threadsAll: role(raw.threadsAll),
    min: raw.min as number,
    max: raw.max as number,
  };
};

/** The embedding child of the process that answered queue-status (ROLE api or all). */
export type EmbeddingThreadsStatus = {
  effective: number;
  source: 'console' | 'env' | 'default';
  max: number;
  role: 'all' | 'api' | 'worker';
  childAlive: boolean;
  /** Cores the child used over the last sample, or null (no child, or not measured yet). */
  cores: number | null;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isObject(value) ? value : undefined;

/** `embeddingQueue.model.threads` plus the child's row of `resources.processes`; undefined on an older backend. */
export const readEmbeddingStatus = (
  status: QueueStatus | undefined
): EmbeddingThreadsStatus | undefined => {
  const threads = asRecord(asRecord(asRecord(status?.embeddingQueue)?.model)?.threads);
  if (!threads || !Number.isInteger(threads.effective) || !Number.isInteger(threads.max))
    return undefined;
  const source =
    threads.source === 'console' || threads.source === 'env' ? threads.source : 'default';
  const role = threads.role === 'api' || threads.role === 'worker' ? threads.role : 'all';
  const pid = Number.isInteger(threads.childPid) ? (threads.childPid as number) : null;
  const report = status?.resources.processes;
  const row =
    pid !== null && report?.available
      ? report.processes.find((process) => process.pid === pid)
      : undefined;
  return {
    effective: threads.effective as number,
    source,
    max: threads.max as number,
    role,
    childAlive: pid !== null,
    cores: row?.cores ?? null,
  };
};
