import { MarkImportedStrip } from '@/components/settings/integrations/MarkImportedStrip';
import { SourceKbStrip } from '@/components/settings/integrations/SourceKbStrip';
import type { AlertState } from '@/components/settings/integrations/types';
import type { Integration } from '@/services/integrations.service';

/**
 * The strips under a mail source row (Gmail and IMAP): Knowledge Base, then mark-imported
 * (support-service#1229). One element in each card because both cards sit at the repo's max-lines
 * cap. `editing`: the row's edit form is open and carries the same switch, so the row hides its own
 * (two controls for one setting, and the form's save would overwrite the row's).
 */
export const SourceRowStrips = ({
  source,
  onRefresh,
  onShowAlert,
  onReconnect,
  editing = false,
}: {
  source: Integration;
  onRefresh: () => Promise<void>;
  onShowAlert: (alert: AlertState) => void;
  onReconnect?: () => void | Promise<void>;
  editing?: boolean;
}) => (
  <>
    <SourceKbStrip
      source={source}
      onShowAlert={onShowAlert}
      onRefresh={onRefresh}
      onReconnect={onReconnect}
    />
    {!editing && (
      <MarkImportedStrip source={source} onShowAlert={onShowAlert} onRefresh={onRefresh} />
    )}
  </>
);
