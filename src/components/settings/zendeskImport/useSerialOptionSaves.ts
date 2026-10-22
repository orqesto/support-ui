import { useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/apiError';
import { toast } from '@/lib/toast';
import {
  zendeskImportService,
  type ZendeskImportOptions,
  type ZendeskRun,
} from '@/services/zendeskImport.service';

/**
 * Saves of the import's choices, one at a time, each built from the LAST SAVED run: the backend
 * replaces the options it is sent, and a patch like `groupDepartments` is built from the current
 * map — two saves in flight would overwrite each other (a team set on group A lost when group B's
 * save, built from the older render, lands second).
 *
 * `save` resolves `true` when the choice was saved, `false` when it failed (already toasted).
 */
export const useSerialOptionSaves = (run: ZendeskRun, onRunChange: (run: ZendeskRun) => void) => {
  const [saving, setSaving] = useState(false);
  const latest = useRef(run);
  latest.current = run;
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));

  const save = (
    patchFrom: (current: ZendeskImportOptions) => Partial<ZendeskImportOptions>
  ): Promise<boolean> => {
    setSaving(true);
    const next = queue.current.then(async () => {
      try {
        const saved = await zendeskImportService.updateOptions(
          latest.current.id,
          patchFrom(latest.current.options)
        );
        latest.current = saved;
        onRunChange(saved);
        return true;
      } catch (error) {
        toast.error(apiErrorMessage(error, 'Could not save the choice'));
        return false;
      } finally {
        if (queue.current === next) setSaving(false);
      }
    });
    queue.current = next;
    return next;
  };

  return { save, saving };
};
