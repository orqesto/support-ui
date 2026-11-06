/** The alert dialog an integration card raises (shared by the cards and their hook). */
export type AlertState = {
  open: boolean;
  title: string;
  description: string;
  variant: 'success' | 'error' | 'warning' | 'info';
};
