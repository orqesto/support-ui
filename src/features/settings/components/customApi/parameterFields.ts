import type { CustomApiEndpoint } from '@/features/custom-api/shell';

export type ParamSource = 'identity' | 'manual' | 'endpoint';

/** A chain: which lookup gives the value, which field of its answer, and the optional fallback. */
export interface ChainSettings {
  sourceEndpointId: number | null;
  sourceFieldPath: string;
  /**
   * 2026-11-13: the path called with the customer's email when the source finds no account. Blank
   * is sent as `null` (no fallback). Undefined ⇒ not sent at all — a backend that predates it.
   */
  fallbackPath?: string;
}

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
  chain: ChainSettings
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
          ...(chain.fallbackPath === undefined
            ? {}
            : { fallbackPath: chain.fallbackPath.trim() || null }),
        }
      : { parameterSource: 'manual' as const, identityField: null };
