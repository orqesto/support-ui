import { useEffect } from 'react';
import { AlertTriangle, Database, PauseCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/authStore';
import { useDatabaseStatusStore, type DatabasePauseCode } from '@/stores/databaseStatusStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import type { DatabaseDisplay } from '@/services/database.service';
import { Permission } from '@/types/roles';

export type DatabaseBannerContent = {
  tone: 'info' | 'warning' | 'danger';
  text: string;
  /** Offer the Settings link (only meaningful for someone who can act on it). */
  actionable: boolean;
};

const PAUSE_TEXT: Record<DatabasePauseCode, string> = {
  DB_PROVISIONING:
    'Your data is being moved to your own database. The inbox is paused until the copy finishes — nothing is lost, and mail resumes from where it stopped.',
  DB_UNREACHABLE:
    "Your database isn't answering, so this workspace is paused. Ingestion and the inbox resume by themselves once it answers again; nothing is written to Odly's database in the meantime.",
  DB_SUSPENDED: 'This workspace is suspended. Contact Odly to restore access to its data.',
};

/**
 * What the banner should say, if anything. Pure — the store wiring lives in the component.
 *
 * Priority: a pause the app just hit (a 503 with a DB_* code) beats the registry's last
 * known state, which beats the Free-on-managed retention deadline.
 */
export const databaseBannerContent = (
  paused: DatabasePauseCode | null,
  current: DatabaseDisplay | null | undefined,
  now = Date.now()
): DatabaseBannerContent | null => {
  if (paused) {
    return { tone: paused === 'DB_PROVISIONING' ? 'info' : 'danger', text: PAUSE_TEXT[paused], actionable: false };
  }
  if (!current) return null;
  if (current.mode === 'own') {
    if (current.status === 'degraded') return { tone: 'danger', text: PAUSE_TEXT.DB_UNREACHABLE, actionable: true };
    if (current.status === 'suspended') return { tone: 'danger', text: PAUSE_TEXT.DB_SUSPENDED, actionable: false };
    if (current.status === 'provisioning' && current.move && current.move.status !== 'failed') {
      return { tone: 'info', text: PAUSE_TEXT.DB_PROVISIONING, actionable: false };
    }
    return null;
  }
  if (current.sharedRetentionUntil) {
    const deadline = new Date(current.sharedRetentionUntil);
    const daysLeft = Math.ceil((deadline.getTime() - now) / 86_400_000);
    const when =
      daysLeft <= 0
        ? 'The deadline has passed'
        : daysLeft === 1
          ? 'You have 1 day left'
          : `You have ${daysLeft} days left`;
    return {
      tone: daysLeft <= 7 ? 'danger' : 'warning',
      text: `Free runs on your own Postgres. Connect yours before ${deadline.toLocaleDateString()} or this workspace's data will be deleted from the managed database. ${when}.`,
      actionable: true,
    };
  }
  return null;
};

const TONE_CLASS: Record<DatabaseBannerContent['tone'], string> = {
  info: 'border-primary/30 bg-primary/5 text-foreground',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  danger: 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200',
};

/**
 * The workspace's own database explaining itself (BYODB Phase 2 §3.4 / §3.6): a Free
 * workspace's retention deadline, a move in progress, or a database that stopped answering.
 * Reads the member-readable onboarding status (same fetch as TrialBanner) plus the pause the
 * api-client recorded from a DB_* 503, so every member sees it — only those who can change
 * integrations get the link.
 */
export const DatabaseBanner = () => {
  const { hasPermission } = usePermissions();
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const database = useOnboardingStore((state) => state.database);
  const fetchOnce = useOnboardingStore((state) => state.fetchOnce);
  const paused = useDatabaseStatusStore((state) => state.paused);

  useEffect(() => {
    fetchOnce(selectedOrganizationId);
  }, [fetchOnce, selectedOrganizationId]);

  const content = databaseBannerContent(paused, database?.current);
  if (!content) return null;

  const Icon = content.tone === 'info' ? PauseCircle : content.tone === 'warning' ? Database : AlertTriangle;
  const canAct = content.actionable && hasPermission(Permission.MANAGE_INTEGRATIONS);

  return (
    <div
      role={content.tone === 'danger' ? 'alert' : 'status'}
      data-testid="database-banner"
      className={`mb-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${TONE_CLASS[content.tone]}`}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        {content.text}
      </span>
      {canAct && (
        <Link to="/settings#integrations/database" className="shrink-0 font-medium underline">
          Database settings
        </Link>
      )}
    </div>
  );
};
