/**
 * Console → System: the worker container's and the database's figures (support-service
 * workerSnapshot.ts / databaseStatus.ts), kept beside `QueueStatus` in platform.service.
 */
import type { ProcessCpuReport, QueueStatus } from '@/services/platform.service';

/** What the worker container publishes about itself (support-service workerSnapshot.ts). */
export type WorkerSnapshot = {
  sampledAt: string;
  resources: Omit<QueueStatus['resources'], 'cpu' | 'memory' | 'processes'> & {
    cpuUsage: number;
    memoryUsage: number;
  };
  processes?: ProcessCpuReport;
  workers?: Array<{ jobType: string; isRunning: boolean }>;
};

/** The worker's figures in the shape the api reports its own in, so one summary renders both. */
export const workerResources = (snapshot: WorkerSnapshot): QueueStatus['resources'] => {
  const { cpuUsage, memoryUsage, ...rest } = snapshot.resources;
  return {
    ...rest,
    cpu: `${cpuUsage.toFixed(1)}%`,
    memory: `${memoryUsage.toFixed(1)}%`,
    processes: snapshot.processes,
  };
};

/** support-service databaseStatus.ts. `rates` is null on the first sample after a restart. */
export type DatabaseStatus = {
  sampledAt: string;
  sizeMB: number;
  connections: {
    total: number;
    active: number;
    idle: number;
    idleInTransaction: number;
    waitingOnLock: number;
    max: number;
    utilizationPct: number;
  };
  longestActiveSeconds: number | null;
  longestIdleInTransactionSeconds: number | null;
  longestQueries: Array<{
    pid: number;
    state: string | null;
    waitEvent: string | null;
    seconds: number;
    query: string;
  }>;
  rates: {
    windowSeconds: number;
    commitsPerSecond: number;
    rollbacksPerSecond: number;
    cacheHitPct: number | null;
    tempMBWritten: number;
    deadlocks: number;
  } | null;
};
