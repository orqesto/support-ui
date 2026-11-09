import type { Dispatch, SetStateAction } from 'react';

/** The page's alert dialog state (MessagesPage owns it). */
export type MessagesPageAlert = {
  open: boolean;
  title: string;
  description: string;
  variant: 'success' | 'error' | 'warning' | 'info';
};

export type SetMessagesPageAlert = Dispatch<SetStateAction<MessagesPageAlert>>;
