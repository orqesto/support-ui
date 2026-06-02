import type { Integration } from '@/services/integrations.service';

export type IntegrationCardProps = {
  integrations: Integration[];
  onRefresh: () => Promise<void>;
  onShowAlert: (alert: AlertState) => void;
  defaultKB?: boolean; // when set, card shows only that KB mode and seeds the form accordingly
};

export type AlertState = {
  open: boolean;
  title: string;
  description: string;
  variant: 'success' | 'error' | 'warning' | 'info';
};

export type DeleteConfirmState = {
  id: number;
  name: string;
} | null;
