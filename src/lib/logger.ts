const noop = (..._args: unknown[]): void => {};

/**
 * In production, `warn` and `error` still reach the console. They used to be no-ops too, so
 * every "only logged" failure (a save that did not land, a count that could not be loaded)
 * left NO trace at all — not in the browser, not in a bug report's console copy (FE audit
 * 2026-09-29, cross-cutting theme 1). `info` and `debug` stay silent in production.
 */
export const logger = import.meta.env.PROD
  ? {
      info: noop,
      debug: noop,
      warn: (...args: unknown[]) => {
        console.warn(...args);
      },
      error: (...args: unknown[]) => {
        console.error(...args);
      },
    }
  : {
      info: (...args: unknown[]) => {
        console.info(...args);
      },
      warn: (...args: unknown[]) => {
        console.warn(...args);
      },
      error: (...args: unknown[]) => {
        console.error(...args);
      },
      debug: (...args: unknown[]) => {
        // eslint-disable-next-line no-console
        console.debug(...args);
      },
    };
