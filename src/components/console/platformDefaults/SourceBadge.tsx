import { Badge } from '@/components/ui/Badge';
import type { FieldSource } from '@/services/platformSettings.service';

/**
 * Shows where a resolved platform-default field's effective value comes from:
 * `db` = a console override, `env` = the droplet environment, `default` = the
 * built-in code fallback. UX signal only — the BE is authoritative.
 */
const LABELS: Record<FieldSource, string> = { db: 'Console', env: 'Environment', default: 'Default' };
const VARIANTS: Record<FieldSource, 'success' | 'secondary'> = {
  db: 'success',
  env: 'secondary',
  default: 'secondary',
};

// StorageFieldSource ('db' | 'env') is a subset of FieldSource, so this covers both.
export const SourceBadge = ({ source }: { source: FieldSource }) => (
  <Badge variant={VARIANTS[source] ?? 'secondary'} size="sm">
    {LABELS[source] ?? source}
  </Badge>
);
