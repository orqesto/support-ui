import { useState } from 'react';
import type { CustomApiConnection, CustomApiEndpoint } from '@/services/customApi.service';
import {
  readRequestSettings,
  requestSettingsPayload,
  requestSettingsProblem,
  supportsFlexibleRequests,
} from './requestSettings';

/**
 * The wizard's request settings (2026-09-29) in one place: the state, whether this backend knows
 * them, what blocks a save, and the payload EVERY write carries.
 * ⛔ `payload` is `{}` against an older backend, which would drop the fields without a word.
 */
export const useRequestSettings = (
  connection: CustomApiConnection,
  endpoint: CustomApiEndpoint | undefined,
  resultShape: 'one' | 'many'
) => {
  const [settings, setSettings] = useState(() => readRequestSettings(endpoint));
  const show = supportsFlexibleRequests(connection);
  return {
    show,
    settings,
    setSettings,
    problem: show ? requestSettingsProblem(settings, resultShape) : null,
    payload: show ? requestSettingsPayload(settings, resultShape) : {},
    /** A POST sends the value in its body — somewhere for it to go besides the path. */
    bodyCarriesValue:
      show && settings.method === 'POST' && settings.requestBodyTemplate.includes('{value}'),
  };
};

export type RequestSettingsState = ReturnType<typeof useRequestSettings>;
