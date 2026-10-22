/**
 * The console shell BORROWS the org context for the workspace being managed and restores the
 * admin's own workspace when it unmounts. A link that deliberately opens the app in the managed
 * workspace (e.g. "Settings › Teams") sets this flag first so the shell leaves the context on it.
 * The flag is consumed by the next shell unmount.
 */
let keepOnExit = false;

export const keepWorkspaceOnExit = (): void => {
  keepOnExit = true;
};

export const consumeKeepWorkspaceOnExit = (): boolean => {
  const keep = keepOnExit;
  keepOnExit = false;
  return keep;
};
