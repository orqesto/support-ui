import { useRef, useState } from 'react';
import {
  AI_KEY_SLOT_BY_PROVIDER,
  platformSettingsService,
  type ManagedAiTestResult,
  type PlatformSettings,
} from '@/services/platformSettings.service';
import type { AIProvider } from '@/types/aiProviders';

type Ai = PlatformSettings['ai'];

/**
 * The stored credentials a probe ran against.
 *
 * Keys are saved on their own buttons, so replacing one kept an older "answered" on screen for
 * a key that was never probed. A result is compared for the provider that ANSWERED, not the
 * stored one: a Save and test that switches provider refetches the settings after the probe
 * starts, and keying on the stored provider hid the fresh answer the moment that refetch landed.
 */
type CredentialSnapshot = {
  secrets: PlatformSettings['secrets'];
  bedrock: [Ai['bedrockAccessKeyId'], Ai['bedrockSecretAccessKey']];
};

/** The stored credential a provider authenticates with, as a comparable string. */
const credentialOf = (provider: string, snapshot: CredentialSnapshot): string => {
  const slot = AI_KEY_SLOT_BY_PROVIDER[provider as AIProvider];
  if (slot) return JSON.stringify(snapshot.secrets[slot] ?? null);
  if (provider === 'bedrock') return JSON.stringify(snapshot.bedrock);
  return '';
};

type TestRecord = {
  result: ManagedAiTestResult;
  providerAtRun: AIProvider;
  credentialsAtRun: CredentialSnapshot;
};

/**
 * Prove the stored managed-AI config answers, and keep the answer only while it is still true.
 *
 * ⛔ Saving already succeeds when the key is wrong — the card goes green on a typo and the
 * first sign of trouble is managed workspaces silently failing to get replies. This is the
 * PLATFORM key: one bad value breaks every managed workspace at once.
 *
 * A result that outlives the thing it describes is worse than no result, so it is dropped when:
 * the caller retires it (a save, a provider switch); a newer probe starts — a probe can take up
 * to 15 s, and one overtaken mid-flight used to land afterwards and print "answered" under
 * settings it never tested; or the credential it ran against is no longer the stored one.
 */
export const useManagedAiTest = ({
  ai,
  secrets,
  storedProvider,
}: {
  ai: Ai;
  secrets: PlatformSettings['secrets'];
  storedProvider: AIProvider;
}) => {
  const currentCredentials: CredentialSnapshot = {
    secrets,
    bedrock: [ai.bedrockAccessKeyId, ai.bedrockSecretAccessKey],
  };
  const [record, setRecord] = useState<TestRecord | null>(null);
  const [testing, setTesting] = useState(false);
  const testRun = useRef(0);

  const answeredBy = record ? (record.result.provider ?? record.providerAtRun) : null;
  const aiTest =
    record &&
    answeredBy !== null &&
    credentialOf(answeredBy, record.credentialsAtRun) ===
      credentialOf(answeredBy, currentCredentials)
      ? record.result
      : null;

  const discardTestResult = () => {
    testRun.current += 1;
    setRecord(null);
  };

  const runAiTest = async () => {
    discardTestResult();
    const run = testRun.current;
    const keep = (result: ManagedAiTestResult) =>
      setRecord({ result, providerAtRun: storedProvider, credentialsAtRun: currentCredentials });
    setTesting(true);
    try {
      const result = await platformSettingsService.testManagedAi();
      if (run === testRun.current) keep(result);
    } catch (err) {
      if (run === testRun.current) {
        keep({ ok: false, reason: err instanceof Error ? err.message : 'Test failed' });
      }
    } finally {
      setTesting(false);
    }
  };

  return { aiTest, testing, runAiTest, discardTestResult };
};
