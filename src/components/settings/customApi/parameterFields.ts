import type { CustomApiEndpoint } from '@/services/customApi.service';

export type ParamSource = 'identity' | 'manual' | 'endpoint';

/**
 * Where a lookup's value comes from, as the write payload says it.
 *
 * ⛔ `identityField` travels WITH `identity`: the create schema refines that an identity parameter
 * needs one, so sending the source without it is a 400.
 *
 * ⛔ AND IT KEEPS AN EXISTING ONE (audit pass 2 — the class pass 1 found one of). The contract
 * allows `email`, `phone` and `displayName`; the wizard only offers "the customer's email address",
 * so hardcoding `email` here would SILENTLY RETARGET a lookup someone had configured to match on
 * phone — the next time an admin opened it and pressed Save, for a field the screen never showed
 * them. Email is the default for a NEW lookup, not an overwrite of an old one.
 */
export const buildParameterFields = (
  paramSource: ParamSource,
  endpoint: CustomApiEndpoint | undefined,
  chain: { sourceEndpointId: number | null; sourceFieldPath: string }
) =>
  paramSource === 'identity'
    ? {
        parameterSource: 'identity' as const,
        identityField: endpoint?.identityField ?? ('email' as const),
      }
    : paramSource === 'endpoint'
      ? {
          parameterSource: 'endpoint' as const,
          identityField: null,
          sourceEndpointId: chain.sourceEndpointId,
          sourceFieldPath: chain.sourceFieldPath.trim(),
        }
      : { parameterSource: 'manual' as const, identityField: null };
