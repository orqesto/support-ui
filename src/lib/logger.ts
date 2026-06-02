const noop = (..._args: unknown[]): void => {};

export const logger = import.meta.env.PROD
  ? { info: noop, warn: noop, error: noop, debug: noop }
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
