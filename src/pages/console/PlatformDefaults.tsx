import { Button } from '@/components/ui/Button';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { ManagedAiDefaultsCard } from '@/components/console/platformDefaults/ManagedAiDefaultsCard';
import { DefaultStorageCard } from '@/components/console/platformDefaults/DefaultStorageCard';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { Alert } from '@/components/ui/Alert';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';

/**
 * Platform Defaults (Epic #2) — global-admin console section. Lets an admin set the
 * managed-AI model/cost defaults and the default-storage target (incl. encrypted
 * secrets) live, without a deploy or a droplet .env edit. Every value resolves
 * DB → env → const on the BE; the source badges show which layer is in effect.
 */
export const PlatformDefaults = () => {
  const query = usePlatformSettings();

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Platform Defaults"
        description="Managed-AI models, cost rates, and default storage — resolved DB → environment → built-in default."
      />

      {query.isLoading ? (
        <ConsoleLoading />
      ) : query.isError || !query.data ? (
        <Alert variant="danger">
          <div className="space-y-3">
            <p>Failed to load platform defaults.</p>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : (
        <div className="space-y-6">
          <ManagedAiDefaultsCard ai={query.data.ai} />
          <DefaultStorageCard storage={query.data.storage} />
        </div>
      )}
    </div>
  );
};
