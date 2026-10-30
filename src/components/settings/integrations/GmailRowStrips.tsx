import { GmailMarkImportedStrip } from '@/components/settings/integrations/GmailMarkImportedStrip';
import { SourceKbStrip } from '@/components/settings/integrations/SourceKbStrip';
import type { AlertState } from '@/components/settings/integrations/types';
import type { Integration } from '@/services/integrations.service';

/**
 * The strips under a Gmail row: Knowledge Base, then mark-imported (support-service#1229). One
 * element in the card because GmailIntegrationCard sits at the repo's max-lines cap.
 */
export const GmailRowStrips = ({
  source,
  onRefresh,
  onShowAlert,
}: {
  source: Integration;
  onRefresh: () => Promise<void>;
  onShowAlert: (alert: AlertState) => void;
}) => (
  <>
    <SourceKbStrip source={source} onShowAlert={onShowAlert} onRefresh={onRefresh} />
    <GmailMarkImportedStrip source={source} onShowAlert={onShowAlert} onRefresh={onRefresh} />
  </>
);
