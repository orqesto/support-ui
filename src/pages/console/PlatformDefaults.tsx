import { Button } from '@/components/ui/Button';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { ManagedAiDefaultsCard } from '@/components/console/platformDefaults/ManagedAiDefaultsCard';
import { DefaultStorageCard } from '@/components/console/platformDefaults/DefaultStorageCard';
import { ReasoningCard } from '@/components/console/platformDefaults/ReasoningCard';
import { KbCaptureCard } from '@/components/console/platformDefaults/KbCaptureCard';
import { AiDraftsCard } from '@/components/console/platformDefaults/AiDraftsCard';
import { CustomApiHealthCard } from '@/components/console/platformDefaults/CustomApiHealthCard';
import { AnalysisHourlyCard } from '@/components/console/platformDefaults/AnalysisHourlyCard';
import { FreeStarterCard } from '@/components/console/platformDefaults/FreeStarterCard';
import { EmbeddingThreadsCard } from '@/components/console/platformDefaults/EmbeddingThreadsCard';
import { IngestionCard } from '@/components/console/platformDefaults/IngestionCard';
import { RoutingProposalsCard } from '@/components/console/platformDefaults/RoutingProposalsCard';
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
        description="Managed-AI models, cost rates, default storage, knowledge-base capture, AI drafts, custom API health, mail-import limits and routing proposals — resolved DB → environment → built-in default."
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
          <ManagedAiDefaultsCard ai={query.data.ai} secrets={query.data.secrets} />
          <DefaultStorageCard storage={query.data.storage} />
          <ReasoningCard reasoning={query.data.reasoning} />
          <KbCaptureCard kb={query.data.kb} />
          <AiDraftsCard drafts={query.data.drafts} />
          <CustomApiHealthCard customApi={query.data.customApi} />
          <AnalysisHourlyCard analysisHourly={query.data.analysisHourly} />
          <FreeStarterCard />
          <IngestionCard ingestion={query.data.ingestion} />
          <EmbeddingThreadsCard embeddingThreads={query.data.embeddingThreads} />
          <RoutingProposalsCard routing={query.data.routing} />
        </div>
      )}
    </div>
  );
};
