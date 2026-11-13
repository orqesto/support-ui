import type { CustomApiEndpoint } from '@/features/custom-api/shell';

export type ParamSource = 'identity' | 'manual' | 'endpoint';

/**
 * Where the looked-up value goes in a path or body. ONE definition for the wizard, the chain step
 * and the request settings — the executor substitutes exactly this token.
 */
export const VALUE_PLACEHOLDER = '{value}';

/**
 * 2026-11-13: does this backend know a chained lookup's fallback (and the field `hidden` flag that
 * shipped with it)? Read off the rows it returns, like `supportsFlexibleRequests`: an older backend
 * strips both on save without a word, so neither control is offered to it.
 */
export const supportsFallback = (
  endpoints: readonly CustomApiEndpoint[],
  endpoint: CustomApiEndpoint | undefined
): boolean =>
  endpoint ? 'fallbackPath' in endpoint : endpoints.some((one) => 'fallbackPath' in one);

/**
 * Why the fallback as typed would be refused (the backend's `assertFallbackIsValid`), in the
 * admin's words — shown under the field, and any one of them disables Test and Save.
 */
export const fallbackProblems = (
  fallbackPath: string,
  opts: { hasEmailField: boolean; bodyCarriesValue: boolean }
): string[] => {
  if (!fallbackPath.trim()) return [];
  return [
    ...(fallbackPath.includes(VALUE_PLACEHOLDER)
      ? []
      : [`Put ${VALUE_PLACEHOLDER} in the fallback path where the email goes.`]),
    ...(opts.hasEmailField
      ? []
      : [
          'Tag the field holding each result’s email as “Customer’s email” below. Without it the fallback cannot check whose results they are.',
        ]),
    ...(opts.bodyCarriesValue
      ? [
          `This lookup sends ${VALUE_PLACEHOLDER} in its request body, so the fallback would send the email there too. Move ${VALUE_PLACEHOLDER} into the path, or clear the fallback.`,
        ]
      : []),
  ];
};

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
