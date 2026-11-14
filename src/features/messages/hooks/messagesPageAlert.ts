import type { Dispatch, SetStateAction } from 'react';

/** The page's alert dialog state (MessagesPage owns it). */
export type MessagesPageAlert = {
  open: boolean;
  title: string;
  description: string;
  variant: 'success' | 'error' | 'warning' | 'info';
};

/** No alert on screen: the dialog's starting state. */
export const CLOSED_MESSAGES_PAGE_ALERT: MessagesPageAlert = {
  open: false,
  title: '',
  description: '',
  variant: 'info',
};

export type SetMessagesPageAlert = Dispatch<SetStateAction<MessagesPageAlert>>;
