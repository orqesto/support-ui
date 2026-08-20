import { create } from 'zustand';

/**
 * A revision counter for the server-sourced role → permission table.
 *
 * `applyServerRolePermissions` swaps a module-level constant, which React cannot observe,
 * so something has to tell components that the numbers underneath them changed. This is
 * that something: bump it once the matrix lands and every `usePermissions` consumer
 * re-evaluates.
 *
 * 🔑 A zustand store rather than the react-query hook itself, deliberately. `usePermissions`
 * is called by a large share of the component tree, and subscribing it to a query would make
 * a QueryClientProvider a hard requirement for rendering almost anything — every component
 * test touching a permission-aware component would need one. Zustand needs no provider, so
 * the coupling stays where it belongs: one fetch, at the app root.
 */
type RoleMatrixState = {
  /** Increments each time a server table is adopted. Only its identity matters. */
  revision: number;
  bump: () => void;
};

export const useRoleMatrixStore = create<RoleMatrixState>((set) => ({
  revision: 0,
  bump: () => set((state) => ({ revision: state.revision + 1 })),
}));
