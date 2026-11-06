import type { Integration } from '@/services/integrations.service';
import type { AlertState } from '@/types/alert';

export type IntegrationCardProps = {
  integrations: Integration[];
  onRefresh: () => Promise<void>;
  onShowAlert: (alert: AlertState) => void;
  defaultKB?: boolean; // when set, card shows only that KB mode and seeds the form accordingly
};

// Moved to `@/types/alert` (modularity task F2): a hook names it too.
export type { AlertState };

export type DeleteConfirmState = {
  id: number;
  name: string;
} | null;
