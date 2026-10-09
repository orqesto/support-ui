import type { TemplateLookup } from '@/services/customApiTemplates.service';
import type { EndpointInitial } from './endpointWizardProps';

/**
 * A template lookup → the wizard's starting values (copied, never shared). Ownership points at
 * the lookup saved for `ownershipFrom` in an earlier step; a skipped source leaves it null, which
 * reads unverified — never a guessed id.
 */
export const initialFromTemplate = (
  templateKey: string,
  lookup: TemplateLookup,
  savedIds: Record<string, number>
): EndpointInitial => ({
  label: lookup.label,
  category: lookup.category,
  parameterSource: lookup.parameterSource,
  resultShape: lookup.resultShape,
  statusLabels: { ...lookup.statusWords },
  ownershipSourceEndpointId: lookup.ownershipFrom ? (savedIds[lookup.ownershipFrom] ?? null) : null,
  createExtras: { surface: lookup.surface, templateKey },
});
