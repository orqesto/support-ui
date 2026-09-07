import { useEffect } from 'react';
import { Check, Cloud, Database } from 'lucide-react';
import { DatabaseConfigCard } from '@/components/settings/providers/DatabaseConfigCard';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { DatabaseDisplay } from '@/services/database.service';

type Choice = 'managed' | 'own';

interface DatabaseStepProps {
  value: Choice | undefined;
  onChoose: (choice: Choice) => void;
  /** Whether the managed database is on offer for this workspace (Free = own database). */
  managedAllowed: boolean;
  /** What the workspace runs on now; null while unknown. */
  current: DatabaseDisplay | null;
  /** The BE refused the managed choice (402 `MANAGED_DB_NOT_ENTITLED`) — shown under the card. */
  choiceError?: string | null;
  /** The card connected an own database — the wizard re-reads the workspace's state. */
  onConnected?: (display: DatabaseDisplay) => void;
}

/**
 * Step — where the workspace's data lives (BYODB Phase 2 §4). Mirrors the storage step:
 * managed by default, "bring your own" reveals the Database card. Unlike storage it is NOT
 * optional for a Free workspace — Free runs on its own Postgres, so the managed card is
 * disabled with the reason and the wizard cannot move past this step until one is connected.
 */
export const DatabaseStep = ({
  value,
  onChoose,
  managedAllowed,
  current,
  choiceError,
  onConnected,
}: DatabaseStepProps) => {
  // On resume, a workspace already on its own database has made its choice — reflect it.
  useEffect(() => {
    if (value === undefined && current?.mode === 'own') onChoose('own');
  }, [current?.mode, onChoose, value]);

  const ownConnected = current?.mode === 'own';

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose the database your conversations, contacts, tickets and knowledge are stored in.
        Connect it before your channels, so mail lands in the database you keep.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={value === 'managed'}
          aria-disabled={!managedAllowed || ownConnected}
          disabled={!managedAllowed || ownConnected}
          onClick={() => onChoose('managed')}
          className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
          data-testid="database-choice-managed"
        >
          <Card
            className={cn(
              'h-full transition-colors',
              managedAllowed && !ownConnected && 'cursor-pointer hover:border-primary/60',
              value === 'managed' && 'border-primary ring-2 ring-primary',
              (!managedAllowed || ownConnected) && 'opacity-60'
            )}
          >
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Use Odly's managed database</span>
                {value === 'managed' && <Check className="ml-auto h-4 w-4 text-primary" />}
              </div>
              <p className="text-sm text-muted-foreground">
                {managedAllowed
                  ? 'Nothing to set up. Your data is stored on the platform, isolated per workspace.'
                  : 'Free runs on your own Postgres — the same way it brings its own AI key. Upgrade to a paid plan to use the managed database.'}
              </p>
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          aria-pressed={value === 'own'}
          onClick={() => onChoose('own')}
          className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          data-testid="database-choice-own"
        >
          <Card
            className={cn(
              'h-full cursor-pointer transition-colors hover:border-primary/60',
              value === 'own' && 'border-primary ring-2 ring-primary'
            )}
          >
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Bring your own Postgres</span>
                {value === 'own' && <Check className="ml-auto h-4 w-4 text-primary" />}
              </div>
              <p className="text-sm text-muted-foreground">
                Your data is read and written in a database you run. Odly keeps only sign-in,
                billing and audit metadata.{managedAllowed ? '' : ' Required on the Free plan.'}
              </p>
            </CardContent>
          </Card>
        </button>
      </div>

      {choiceError && (
        <p role="alert" className="text-sm text-destructive" data-testid="database-choice-error">
          {choiceError}
        </p>
      )}

      {value === 'own' && <DatabaseConfigCard onChanged={onConnected} defaultMode="own" hideModeToggle />}
    </div>
  );
};
