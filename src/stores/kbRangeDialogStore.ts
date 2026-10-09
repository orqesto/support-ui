import { create } from 'zustand';

/** Which mailbox's knowledge-base history-range dialog is open (at most one). */
type KbRangeDialogState = {
  openSourceId: number | null;
  open: (id: number) => void;
  close: () => void;
};

export const useKbRangeDialogStore = create<KbRangeDialogState>((set) => ({
  openSourceId: null,
  open: (id) => set({ openSourceId: id }),
  close: () => set({ openSourceId: null }),
}));
