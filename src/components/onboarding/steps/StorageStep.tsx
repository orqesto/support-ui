import { HardDrive } from 'lucide-react';
import { ObjectStorageConfigCard } from '@/components/settings/providers/ObjectStorageConfigCard';

/**
 * Step 3 — where files (attachments, KB documents) are stored. Optional: leaving
 * it unset keeps the org on the platform's managed storage; configuring an S3
 * bucket keeps everything in the client's own infrastructure. Wraps the existing
 * ObjectStorageConfigCard (per-org storage_configs; BE allows MANAGE_INTEGRATIONS,
 * which org admins have), which handles configure/test/save/remove itself.
 */
export const StorageStep = () => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Choose where attachments and knowledge-base documents are stored. Leave this unset to use
      our managed storage, or connect your own S3-compatible bucket (AWS, Hetzner, MinIO) to keep
      all files in your own infrastructure. You can change this later in Settings.
    </p>

    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
      <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>
        Bringing your own bucket is recommended for production — files live in storage you control
        and it scales beyond the app server. This step is optional; you can skip it and set it up
        anytime.
      </span>
    </div>

    <ObjectStorageConfigCard />
  </div>
);
