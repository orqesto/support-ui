import type { EndpointWizardProps } from './endpointWizardProps';
import { explainOutcome } from './RecordsPathField';
import { useState } from 'react';
import {
  buildParameterFields,
  type ChainSettings,
  fallbackProblems,
  type ParamSource,
  supportsFallback,
} from './parameterFields';

type CustomApiConnection = EndpointWizardProps['connection'];
type CustomApiEndpoint = NonNullable<EndpointWizardProps['endpoint']>;
type FieldPick = CustomApiConnection['endpoints'][number]['fieldPaths'][number];
/** `customApiService.sendTest`, passed in by the wizard (this file reaches no other feature). */
export type SendTest = (
  connectionId: number,
  endpointId: number,
  parameter?: string,
  fallbackPath?: string
) => Promise<{
  outcome: {
    status: string;
    reason?: string;
    missingKind?: 'records' | 'fields';
    missing?: string[];
    rows?: unknown[];
  };
}>;

/**
 * 2026-11-13: everything the wizard needs about a chained lookup's fallback, in one place so the
 * wizard stays within its size budget.
 *  - `supported`: the backend knows fallbacks and the field `hidden` flag (else neither is offered).
 *  - `problems`: why a save would be refused; any one disables Test and Save.
 *  - `onTest`: "Test fallback" — saves the lookup if it is new (WITHOUT the fallback, which
 *    the backend only accepts together with the picked fields on Save), then calls the fallback
 *    path with a sample email through the lookup's records path, and says what came back.
 */
export const useChainFallback = (opts: {
  connection: CustomApiConnection;
  endpoint: CustomApiEndpoint | undefined;
  chained: boolean;
  fallbackPath: string;
  picked: FieldPick[];
  bodyCarriesValue: boolean;
  ensureSaved: () => Promise<number>;
  sendTest: SendTest;
}) => {
  const supported = supportsFallback(opts.connection.endpoints, opts.endpoint);
  const problems =
    supported && opts.chained
      ? fallbackProblems(opts.fallbackPath, {
          hasEmailField: opts.picked.some((field) => field.role === 'customer_email'),
          bodyCarriesValue: opts.bodyCarriesValue,
        })
      : [];
  const onTest = async (email: string): Promise<string> => {
    const id = await opts.ensureSaved();
    const result = await opts.sendTest(opts.connection.id, id, email, opts.fallbackPath.trim());
    const { outcome } = result;
    if (outcome.status !== 'ok') {
      return explainOutcome(outcome.status, outcome.reason, outcome.missingKind, outcome.missing);
    }
    const count = outcome.rows?.length ?? 0;
    return `The fallback answered with ${count} ${count === 1 ? 'result' : 'results'}. Agents see only those whose “Customer’s email” field is ${email}.`;
  };
  return { supported, problems, onTest };
};

/**
 * D21 + 2026-11-13: a chained lookup's state for the wizard — which lookup gives the value, which
 * field of its answer, and the optional fallback — plus what each write sends.
 */
export const useChain = (opts: {
  connection: CustomApiConnection;
  endpoint: CustomApiEndpoint | undefined;
  paramSource: ParamSource;
  picked: FieldPick[];
  bodyCarriesValue: boolean;
  wordsPayload: Record<string, unknown>;
  ensureSaved: () => Promise<number>;
  sendTest: SendTest;
}) => {
  const { endpoint, paramSource } = opts;
  const [chain, setChain] = useState<ChainSettings & { fallbackPath: string }>({
    sourceEndpointId: endpoint?.sourceEndpointId ?? null,
    sourceFieldPath: endpoint?.sourceFieldPath ?? '',
    fallbackPath: endpoint?.fallbackPath ?? '',
  });
  const fallback = useChainFallback({
    connection: opts.connection,
    endpoint,
    chained: paramSource === 'endpoint',
    fallbackPath: chain.fallbackPath,
    picked: opts.picked,
    bodyCarriesValue: opts.bodyCarriesValue,
    ensureSaved: opts.ensureSaved,
    sendTest: opts.sendTest,
  });
  /**
   * ⛔ A chain without both halves is a 400 (the create schema refines them together), and the
   * FIRST Test press creates the lookup — so both are required before Test as well as Save. A
   * fallback the backend would refuse (no {value}, no email tag, a POST body carrying {value})
   * blocks them too, including after the method is switched to POST.
   */
  const chainIncomplete =
    paramSource === 'endpoint' &&
    (chain.sourceEndpointId === null ||
      chain.sourceFieldPath.trim() === '' ||
      fallback.problems.length > 0);
  // ⛔ The fallback is SAVED only with the fields (Save), never by a Test's pre-save: the backend
  // accepts it only beside a “Customer’s email” field, and a Test sends no fields. Not sent at all
  // to a backend that does not know it.
  const { fallbackPath: _fallbackPath, ...withoutFallback } = chain;
  const testParameterFields = {
    ...buildParameterFields(paramSource, endpoint, withoutFallback),
    ...opts.wordsPayload,
  };
  const parameterFields = {
    ...buildParameterFields(paramSource, endpoint, fallback.supported ? chain : withoutFallback),
    ...opts.wordsPayload,
  };
  return { chain, setChain, chainIncomplete, fallback, parameterFields, testParameterFields };
};
