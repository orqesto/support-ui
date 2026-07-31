import { DocumentationSettings } from '@/components/settings/DocumentationSettings';

/**
 * Step 3 — seed the knowledge base. Uploaded docs feed AI suggested answers and
 * drafted replies, so a fresh org's AI has something to draw from instead of an
 * empty KB. Fully optional and skippable; the same manager lives in
 * Settings → Knowledge base for adding more later.
 */
export const KbStep = () => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Upload FAQs, policies, product docs, or past answers — your AI uses these to suggest and
      draft replies. Optional: skip for now and add documents anytime in Settings → Knowledge base.
    </p>
    <DocumentationSettings />
  </div>
);
