import { Alert } from '@/components/ui/Alert';
import { useAiDraftsOff } from '@/hooks/useAiDraftsOff';
import { LeadQualificationSettings } from './LeadQualificationSettings';

/**
 * The Lead Qualification tab. Lead qualification WRITES the replies sent to leads, so "AI drafts
 * off" stops it as a whole on the backend (leadQualificationService); the settings are kept for
 * when drafts come back, and the page says they are not running meanwhile. Lead data captured by
 * enrichment is unaffected.
 *
 * A wrapper rather than a line in LeadQualificationSettings: that file sits exactly at the
 * max-lines cap.
 */
export const LeadQualificationSection = () => {
  const { off: aiDraftsOff } = useAiDraftsOff();
  return (
    <div className="space-y-4">
      {aiDraftsOff && (
        <Alert variant="warning">
          AI drafts are switched off for this workspace, so lead qualification is not running — it
          writes the replies sent to leads. These settings apply again when AI drafts are switched
          back on.
        </Alert>
      )}
      <LeadQualificationSettings />
    </div>
  );
};
