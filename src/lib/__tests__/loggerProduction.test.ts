/**
 * FE audit 2026-09-29, cross-cutting theme 1: `logger` was a no-op in production for every
 * level, so a failure the code "only logged" (a save that did not land, a count that could not
 * be loaded) left no trace anywhere — nothing a user could copy into a bug report. `warn` and
 * `error` now reach the console in production; `info` and `debug` stay silent there.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';

const loadLogger = async (prod: boolean) => {
  vi.resetModules();
  vi.stubEnv('PROD', prod);
  return (await import('../logger')).logger;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('logger in production', () => {
  it('warn and error reach the console; info and debug do not', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const logger = await loadLogger(true);
    logger.warn('w', 1);
    logger.error('e', 2);
    logger.info('i');
    logger.debug('d');
    expect(warn).toHaveBeenCalledWith('w', 1);
    expect(error).toHaveBeenCalledWith('e', 2);
    expect(info).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
  });

  it('CONTROL: outside production every level logs', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = await loadLogger(false);
    logger.info('i');
    logger.error('e');
    expect(info).toHaveBeenCalledWith('i');
    expect(error).toHaveBeenCalledWith('e');
  });
});
