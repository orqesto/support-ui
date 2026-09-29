import { useEffect, useRef } from 'react';
import { buildParameterFields, type ParamSource } from './parameterFields';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  requestSettingsPayload,
  readRequestSettings,
  supportsFlexibleRequests,
} from './requestSettings';
import {
  customApiService,
  type CustomApiConnection,
  type CustomApiEndpoint,
} from '@/services/customApi.service';

/**
 * ⛔ TEST IS A WRITE, SO CANCEL MUST UNDO IT (FE audit H7, 2026-09-29). Test runs the SAVED lookup,
 * so pressing it saves the edits first. An admin who tried a new address on a working lookup,
 * watched the test fail and pressed Cancel was left with the broken address live for every agent —
 * a saved change they believe they discarded. Likewise the first Test on a NEW lookup creates it,
 * and Cancel left that lookup behind.
 *
 * So the wizard remembers the lookup AS IT WAS WHEN OPENED, and what a Test changed:
 *  · edited  → Cancel writes back the fields a Test writes (the same set `ensureSaved` sends);
 *  · created → Cancel removes the lookup this visit created.
 * Save clears it: a saved change is meant. Leaving by any other route (the page's back link, the
 * browser's back) reverts too — fire-and-forget, because there is nowhere left to show an error.
 *
 * ⚠️ NOT undone: the response SKELETON a Test stores (it only shapes the field picker, and no write
 * route takes it), and a tab closed or reloaded mid-edit.
 */
export const useTestRevert = (
  connection: CustomApiConnection,
  endpoint: CustomApiEndpoint | undefined
) => {
  const original = useRef(
    endpoint
      ? {
          label: endpoint.label,
          path: endpoint.path,
          dataPath: endpoint.dataPath ?? null,
          resultShape: endpoint.resultShape,
          category: endpoint.category ?? null,
          statusLabels: endpoint.statusLabels,
          ...(supportsFlexibleRequests(connection)
            ? requestSettingsPayload(
                readRequestSettings(endpoint),
                endpoint.resultShape === 'many' ? 'many' : 'one'
              )
            : {}),
          ...buildParameterFields(endpoint.parameterSource as ParamSource, endpoint, {
            sourceEndpointId: endpoint.sourceEndpointId ?? null,
            sourceFieldPath: endpoint.sourceFieldPath ?? '',
          }),
        }
      : null
  );
  const touched = useRef<{ kind: 'updated' | 'created'; id: number } | null>(null);

  const revert = async (): Promise<boolean> => {
    const change = touched.current;
    if (!change) return false;
    if (change.kind === 'created') await customApiService.removeEndpoint(connection.id, change.id);
    else if (original.current)
      await customApiService.updateEndpoint(connection.id, change.id, original.current);
    // Only once it WORKED: a failed undo must still be there for the next Cancel (or the backstop).
    touched.current = null;
    return true;
  };

  // The backstop for every exit that is not Cancel. A ref, so the cleanup sees the latest state.
  const revertRef = useRef(revert);
  revertRef.current = revert;
  useEffect(() => () => void revertRef.current().catch(() => undefined), []);

  return {
    /**
     * An EXISTING lookup was saved by a Test. A lookup created this visit has no `original` (it did
     * not exist when the editor opened), so it stays "created" and Cancel removes it.
     */
    markUpdated: (id: number) => {
      if (original.current) touched.current = { kind: 'updated', id };
    },
    markCreated: (id: number) => {
      touched.current = { kind: 'created', id };
    },
    /** After a real Save: the change is meant, nothing to undo. */
    clear: () => {
      touched.current = null;
    },
    revert,
    /** Cancel: undo what a Test saved, THEN leave. A failed undo stays on the page and says so. */
    cancel: async (
      close: () => void,
      afterUndo: () => void,
      showError: (message: string) => void
    ): Promise<void> => {
      try {
        if (await revert()) afterUndo();
        close();
      } catch (err) {
        showError(
          getApiErrorMessage(err) ??
            'Could not undo what Test saved. Try Cancel again, or Save to keep it.'
        );
      }
    },
  };
};
