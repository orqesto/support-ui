import { useState } from 'react';
import type { EndpointWizardProps } from './endpointWizardProps';
import {
  buildParameterFields,
  type ChainSettings,
  fallbackProblems,
  type ParamSource,
  supportsFallback,
} from './parameterFields';
import { explainOutcome } from './RecordsPathField';
import { getApiErrorMessage } from '@/lib/errorMessages';

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
  /** A fallback test only: what the ownership filter kept and hid (absent from older backends). */
  fallback?: { kept: number; dropped: number };
}>;

/** The wizard's own busy flag and error line, shared so a fallback test cannot double-create. */
interface WizardUi {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
}

/** What a "Test fallback" says, from the backend's answer. */
const describeFallbackTest = (result: Awaited<ReturnType<SendTest>>, email: string): string => {
  const { outcome } = result;
  if (outcome.status !== 'ok') {
    return explainOutcome(outcome.status, outcome.reason, outcome.missingKind, outcome.missing);
  }
  const count = outcome.rows?.length ?? 0;
  const head = `The fallback answered with ${count} ${count === 1 ? 'result' : 'results'}.`;
  if (!result.fallback) return head;
  const { kept, dropped } = result.fallback;
  // ⛔ The counts the live card would apply: a wrongly tagged email field shows up as 0 shown.
  return `${head} ${kept} would show for ${email}; ${dropped} hidden because their “Customer’s email” field is not ${email}.`;
};

/**
 * D21 + 2026-11-13: a chained lookup's state for the wizard — which lookup gives the value, which
 * field of its answer, and the optional fallback — plus what each write sends. Its own file so the
 * wizard stays within its size budget.
 *  - `fallback.supported`: the backend knows fallbacks and the field `hidden` flag.
 *  - `fallback.problems`: why the backend would refuse the fallback; they block SAVE only — the
 *    lookup's own Test must stay usable, since fields can only be tagged after a Test.
 *  - `fallback.onTest`: "Test fallback" — saves the lookup first (WITHOUT the fallback: the backend
 *    accepts it only beside the picked fields, on Save), then calls the fallback path with a sample
 *    email and reports what the ownership filter kept.
 */
export const useChain = (opts: {
  connection: CustomApiConnection;
  endpoint: CustomApiEndpoint | undefined;
  paramSource: ParamSource;
  picked: FieldPick[];
  path: string;
  request: { bodyCarriesValue: boolean; problem: string | null };
  wordsPayload: Record<string, unknown>;
  ui: WizardUi;
  ensureSaved: () => Promise<number>;
  sendTest: SendTest;
}) => {
  const { endpoint, paramSource, ui } = opts;
  const [chain, setChain] = useState<ChainSettings & { fallbackPath: string }>({
    sourceEndpointId: endpoint?.sourceEndpointId ?? null,
    sourceFieldPath: endpoint?.sourceFieldPath ?? '',
    fallbackPath: endpoint?.fallbackPath ?? '',
  });
  const supported = supportsFallback(opts.connection.endpoints, endpoint);
  const chained = paramSource === 'endpoint';
  const problems =
    supported && chained
      ? fallbackProblems(chain.fallbackPath, {
          hasEmailField: opts.picked.some((field) => field.role === 'customer_email'),
          bodyCarriesValue: opts.request.bodyCarriesValue,
        })
      : [];
  /**
   * ⛔ A chain without both halves is a 400 (the create schema refines them together), and the
   * FIRST Test press creates the lookup — so both are required before Test as well as Save.
   */
  const chainIncomplete =
    chained && (chain.sourceEndpointId === null || chain.sourceFieldPath.trim() === '');
  /** A fallback the backend would refuse blocks Save (also after switching the method to POST). */
  const saveBlocked = chainIncomplete || problems.length > 0;
  // The wizard's own Test conditions, plus a fallback path with nothing wrong with it.
  const testable =
    !ui.busy &&
    !chainIncomplete &&
    opts.path.trim() !== '' &&
    !opts.request.problem &&
    chain.fallbackPath.trim() !== '' &&
    problems.length === 0;

  const onTest = async (email: string): Promise<string | null> => {
    ui.setBusy(true);
    ui.setError(null);
    try {
      const id = await opts.ensureSaved();
      const result = await opts.sendTest(opts.connection.id, id, email, chain.fallbackPath.trim());
      return describeFallbackTest(result, email);
    } catch (err) {
      // Shown like the lookup's own Test shows a failure.
      ui.setError(getApiErrorMessage(err) ?? 'Could not reach your system.');
      return null;
    } finally {
      ui.setBusy(false);
    }
  };

  // ⛔ A Test's pre-save carries no fallback path — except to CLEAR one (blank box ⇒ null), which
  // the backend accepts without fields. Not sent at all to a backend that does not know it.
  const { fallbackPath: _fallbackPath, ...withoutFallback } = chain;
  const testChain = supported && !chain.fallbackPath.trim() ? chain : withoutFallback;
  const testParameterFields = {
    ...buildParameterFields(paramSource, endpoint, testChain),
    ...opts.wordsPayload,
  };
  const parameterFields = {
    ...buildParameterFields(paramSource, endpoint, supported ? chain : withoutFallback),
    ...opts.wordsPayload,
  };
  return {
    chain,
    setChain,
    chainIncomplete,
    saveBlocked,
    fallback: { supported, problems, testable, onTest },
    parameterFields,
    testParameterFields,
  };
};
