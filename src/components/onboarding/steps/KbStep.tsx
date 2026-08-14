import { DocumentationSettings } from '@/components/settings/DocumentationSettings';

interface KbStepProps {
  /**
   * Reports the current KB document count up to the wizard, so the footer button
   * switches from "Skip this step" to "Next" once the org has added any content.
   */
  onDocsCountChange?: (count: number) => void;
}

/**
 * Step — seed the knowledge base. Uploaded docs feed AI suggested answers and
 * drafted replies, so a fresh org's AI has something to draw from instead of an
 * empty KB. Fully optional and skippable; the same manager lives in
 * Settings → Knowledge base for adding more later.
 */
export const KbStep = ({ onDocsCountChange }: KbStepProps) => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Upload FAQs, policies, product docs, or past answers — your AI uses these to suggest and
      draft replies. Optional: skip for now and add documents anytime in Settings → Knowledge base.
    </p>
    <DocumentationSettings onDocsCountChange={onDocsCountChange} compact />
  </div>
);
