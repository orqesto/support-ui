import { describe, it, expect } from 'vitest';
import {
  describeGroupAction,
  formatFailedAt,
  formatJobCount,
  estimateClearTime,
  formatCpuBreakdown,
  formatDuration,
  queuedJobs,
  formatCpuFigures,
  formatMemoryBreakdown,
  formatMemoryFigures,
  formatWorkspace,
} from '../failureAnalysis.format';
import type { QueueFailureGroup } from '@/services/platform.service';

const group: QueueFailureGroup = {
  reason: 'invalid input value for enum ticket_priority: "High" (22P02)',
  count: 9,
  queues: [
    { name: 'ai-analysis', count: 8 },
    { name: 'ai-reanalyze', count: 1 },
  ],
  organizations: [{ id: 21, count: 9 }],
  firstFailedAt: 1_000,
  lastFailedAt: 2_000,
  sample: [],
  jobs: Array.from({ length: 9 }, (_, index) => ({ queue: 'ai-analysis', id: String(index) })),
};

describe('failure analysis formatting', () => {
  it('renders a dash for a missing timestamp and a locale string otherwise', () => {
    expect(formatFailedAt(null)).toBe('—');
    expect(formatFailedAt(Number.NaN)).toBe('—');
    expect(formatFailedAt(0)).not.toBe('—');
  });

  it('labels workspaces and counts jobs', () => {
    expect(formatWorkspace(21)).toBe('org 21');
    expect(formatWorkspace(null)).toBe('no workspace');
    expect(formatJobCount(1)).toBe('1 job');
    expect(formatJobCount(9)).toBe('9 jobs');
  });

  it('confirms a bulk action by verb, count and queues', () => {
    expect(describeGroupAction('retry', group)).toBe('Retry 9 jobs in ai-analysis, ai-reanalyze?');
    expect(describeGroupAction('remove', group)).toBe('Remove 9 jobs in ai-analysis, ai-reanalyze?');
  });

  it('explains a memory percentage with the figures behind it', () => {
    expect(formatMemoryFigures({ used: 1020, total: 3584, limitSource: 'cgroup' })).toBe(
      '1,020 of 3,584 MB (container limit)'
    );
    expect(formatMemoryFigures({ used: 335, total: 7937, limitSource: 'host' })).toBe(
      '335 of 7,937 MB (host memory, no container limit)'
    );
    // The backend sized itself — the total is NOT host memory (2026-09-16).
    expect(formatMemoryFigures({ used: 619, total: 6963, limitSource: 'budget' })).toBe(
      '619 of 6,963 MB (automatic: 85% of free memory, at least 2,048 MB)'
    );
    // A value this build does not know claims neither.
    expect(formatMemoryFigures({ used: 1, total: 2, limitSource: 'future' })).toBe('1 of 2 MB (memory limit)');
    expect(formatMemoryFigures(null)).toBeNull();
    expect(formatMemoryBreakdown({ rssMB: 1020, heapUsedMB: 210, externalMB: 700, arrayBuffersMB: 12 })).toBe(
      'heap 210 MB · native 712 MB · other 98 MB'
    );
    expect(formatMemoryBreakdown(undefined)).toBeNull();
  });

  // The real prod payload, app.odly.ai 2026-09-23 (support-service #737 fields).
  const prod = {
    cpu: '2.0%',
    cpuCores: 4,
    effectiveCores: 4,
    cpuSource: 'container',
    processCpu: 2.03,
    containerCpu: 2.03,
    loadAvg: 0.75,
    sampledAt: '2026-09-23T14:48:41.858Z',
    ticks: 507,
  };

  it('explains a CPU percentage in cores, against the denominator it was measured on', () => {
    expect(formatCpuFigures(prod)).toBe('0.08 of 4 cores (all host cores)');
    expect(formatCpuBreakdown(prod)).toBe(
      'whole container 0.08 cores · this process 0.08 cores · load average 0.75 (1 min, whole host) · status uses whole container'
    );
    // A 2-core quota on an 8-core host: the container figure is a share of 2, never of 8.
    const quota = { ...prod, cpu: '75.0%', cpuCores: 8, effectiveCores: 2, containerCpu: 75, processCpu: 5 };
    expect(formatCpuFigures(quota)).toBe('1.5 of 2 cores (container limit; the host has 8)');
    // …while this process's % is of the HOST's 8 cores: 5% of 8 = 0.4, not 5% of 2.
    expect(formatCpuBreakdown(quota)).toContain('this process 0.4 cores');
    expect(formatCpuBreakdown(quota)).toContain('whole container 1.5 cores');
  });

  it('reads taco\'s pinned 1-core container (real payload, 2026-09-23)', () => {
    const taco = {
      cpu: '100.0%',
      cpuCores: 2,
      effectiveCores: 1,
      cpuSource: 'container',
      processCpu: 4.26,
      containerCpu: 99.99,
      loadAvg: 2.07,
      sampledAt: '2026-09-23T14:56:58.248Z',
      ticks: 506,
    };
    expect(formatCpuFigures(taco)).toBe('1 of 1 core (container limit; the host has 2)');
    // The app process is 4.26% of the HOST's 2 cores; the rest of the container's core is
    // spent elsewhere in the container (the local embedding child).
    expect(formatCpuBreakdown(taco)).toBe(
      'whole container 1 core · this process 0.09 cores · load average 2.07 (1 min, whole host) · status uses whole container'
    );
  });

  it('converts a process-sourced figure with the host core count', () => {
    const processOnly = { ...prod, cpu: '25.0%', cpuSource: 'process', cpuCores: 8, effectiveCores: 2, containerCpu: 10, processCpu: 25 };
    expect(formatCpuFigures(processOnly)).toBe('2 of 8 host cores (this process only)');
    const hostScoped = { ...processOnly, cpuSource: 'host-cgroup' };
    expect(formatCpuFigures(hostScoped)).toBe('2 of 8 host cores (this process only)');
    expect(formatCpuBreakdown(hostScoped)).toBe(
      'whole container: not measurable (counter is host-wide) · this process 2 cores · load average 0.75 (1 min, whole host) · status uses this process (the container counter is host-wide)'
    );
  });

  it('reads a load-average status and a missing cgroup honestly', () => {
    const load = { ...prod, cpu: '50.0%', cpuSource: 'loadavg', containerCpu: null, loadAvg: 2, processCpu: 1 };
    // Host-wide load is never written as cores this container used.
    expect(formatCpuFigures(load)).toBe('load average 2.00 against 4 cores (whole host; no container counter here)');
    expect(formatCpuBreakdown(load)).toBe(
      'whole container: not measurable here · this process 0.04 cores · load average 2.00 (1 min, whole host) · status uses load average (no container counter)'
    );
    // Off Linux there is no load average: the part is left out, not shown as 0.
    expect(formatCpuBreakdown({ ...prod, loadAvg: null })).not.toContain('load average');
  });

  it('says a CPU figure is not measured yet instead of converting the placeholder 0%', () => {
    const fresh = { ...prod, cpu: '0.0%', sampledAt: null, ticks: 0 };
    expect(formatCpuFigures(fresh)).toBe('not measured yet (the first 10-second window is still running)');
    expect(formatCpuBreakdown(fresh)).toBeNull();
    expect(formatCpuFigures({ ...prod, ticks: 0 })).toMatch(/^not measured yet/);
  });

  it('converts the exact reading, so the two CPU lines agree on the same number', () => {
    // `cpu` is rounded to one decimal: 0.1% of 64 = 0.06, but the reading was 0.14% = 0.09.
    const big = { ...prod, cpu: '0.1%', cpuCores: 64, effectiveCores: 64, containerCpu: 0.14, processCpu: 0.14 };
    expect(formatCpuFigures(big)).toBe('0.09 of 64 cores (all host cores)');
    expect(formatCpuBreakdown(big)).toContain('whole container 0.09 cores');
    // A busy-but-tiny reading is not shown as idle.
    const tiny = { ...prod, cpu: '0.1%', containerCpu: 0.1, processCpu: 0 };
    expect(formatCpuFigures(tiny)).toBe('<0.01 of 4 cores (all host cores)');
    expect(formatCpuBreakdown(tiny)).toContain('this process 0 cores');
  });

  it('claims nothing on a backend without the figures or with a source it does not know', () => {
    expect(formatCpuFigures({ cpu: '2.0%' })).toBeNull();
    expect(formatCpuBreakdown({ cpu: '2.0%' })).toBeNull();
    expect(formatCpuFigures(null)).toBeNull();
    expect(formatCpuFigures({ ...prod, cpuSource: 'future' })).toBeNull();
    // No exact reading and an unreadable string: nothing to convert.
    expect(formatCpuFigures({ ...prod, cpu: 'n/a', containerCpu: null })).toBeNull();
    // The rounded string is only the fallback — the exact reading wins when present.
    expect(formatCpuFigures({ ...prod, cpu: 'n/a' })).toBe('0.08 of 4 cores (all host cores)');
  });

  const timing = {
    sampled: 20,
    medianRunMs: 2_400,
    slowestRunMs: 9_000,
    medianWaitMs: 800,
    lastFinishedAt: '2026-09-23T15:00:00.000Z',
    finishesPerMinute: 4,
    rateSample: 20,
  };

  it('formats a run or wait time at a readable scale', () => {
    expect(formatDuration(340)).toBe('340 ms');
    expect(formatDuration(2_449)).toBe('2.4 s');
    expect(formatDuration(12 * 60_000)).toBe('12 min');
    expect(formatDuration(190 * 60_000)).toBe('3 h 10 min');
    expect(formatDuration(120 * 60_000)).toBe('2 h');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
  });

  it('counts prioritized jobs as waiting — "waiting: 0" once hid 211 queued jobs', () => {
    expect(queuedJobs({ waiting: 0, prioritized: 211 })).toBe(211);
    expect(queuedJobs({ waiting: 5 })).toBe(5);
  });

  it('estimates how long the waiting jobs take at the recent pace', () => {
    expect(estimateClearTime({ waiting: 48, timing })).toBe('~12 min');
    // Prioritized jobs are part of the pile the estimate is about.
    expect(estimateClearTime({ waiting: 8, prioritized: 40, timing })).toBe('~12 min');
    expect(estimateClearTime({ waiting: 3, timing })).toBe('under a minute');
    expect(estimateClearTime({ waiting: 760, timing })).toBe('~3 h 10 min');
  });

  it('says why there is no estimate instead of inventing one', () => {
    expect(estimateClearTime({ waiting: 0, timing })).toBeNull();
    // The record's newest job is 3 h old: say that, never "stuck".
    const now = Date.parse('2026-09-23T18:10:00.000Z');
    expect(
      estimateClearTime({ waiting: 10, timing: { ...timing, finishesPerMinute: null, rateSample: 0 } }, now)
    ).toBe('last finished 3 h 10 min ago');
    // No record at all (sync-confluence keeps none): not "nothing finished".
    const empty = { ...timing, sampled: 0, lastFinishedAt: null, finishesPerMinute: null, rateSample: 0 };
    expect(estimateClearTime({ waiting: 10, timing: empty }, now)).toBe('no finished jobs on record');
    expect(estimateClearTime({ waiting: 10, timing: { ...timing, finishesPerMinute: null, rateSample: 1 } })).toBe(
      'too few recent jobs to estimate'
    );
    // A paused queue is paused whether or not the backend sent timing.
    expect(estimateClearTime({ waiting: 10, paused: true, timing })).toBe('paused');
    expect(estimateClearTime({ waiting: 10, paused: true })).toBe('paused');
    // An older backend (no timing) or a failed read: nothing to say.
    expect(estimateClearTime({ waiting: 10 })).toBeNull();
    expect(estimateClearTime({ waiting: 10, timing: null })).toBeNull();
  });
});
