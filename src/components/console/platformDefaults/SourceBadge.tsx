import { Badge } from '@/components/ui/Badge';
import type { FieldSource } from '@/services/platformSettings.service';

/**
 * Shows where a resolved platform-default field's effective value comes from:
 * `db` = a console override, `env` = the droplet environment, `default` = the
 * built-in code fallback. UX signal only — the BE is authoritative.
 */
const LABELS: Record<FieldSource, string> = {
  db: 'Console',
  env: 'Environment',
  default: 'Default',
};
const VARIANTS: Record<FieldSource, 'success' | 'secondary'> = {
  db: 'success',
  env: 'secondary',
  default: 'secondary',
};

/**
 * `unsetLabel` overrides the `default` label for fields that have no built-in
 * fallback — storage has no code default, so "Default" there read as though
 * something were configured when in fact nothing was.
 */
export const SourceBadge = ({
  source,
  unsetLabel,
  envLabel,
}: {
  source: FieldSource;
  unsetLabel?: string;
  /** Overrides "Environment" for settings whose env value is simply the server's own setting. */
  envLabel?: string;
}) => (
  <Badge variant={VARIANTS[source] ?? 'secondary'} size="sm">
    {source === 'default' && unsetLabel
      ? unsetLabel
      : source === 'env' && envLabel
        ? envLabel
        : (LABELS[source] ?? source)}
  </Badge>
);
