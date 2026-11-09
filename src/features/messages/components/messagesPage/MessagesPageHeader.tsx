import type { ComponentProps, Dispatch, ReactNode, SetStateAction } from 'react';
import { Inbox, MoreHorizontal, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import type { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import type { MessagesDisplayMode } from '@/types';
import { Permission } from '@/types/roles';
import { SurfaceCount } from '../filters/SurfaceCount';
import { MessagesViewToggle } from '../MessagesViewToggle';
import { NOTIFY_TRIAGE_KEY } from './messagesPageConstants';

type SurfacePagination = ComponentProps<typeof SurfaceCount>['pagination'];

type MessagesPageHeaderProps = {
  displayMode: MessagesDisplayMode;
  setDisplayMode: (mode: MessagesDisplayMode) => void;
  split: boolean;
  contactsPagination: SurfacePagination;
  boardTotal: number;
  boardPartial: boolean;
  pagination: SurfacePagination;
  isKanban: boolean;
  /** The Compose button, permission-gated by the page (PermissionGuard lives outside this feature). */
  composeAction: ReactNode;
  handleRefresh: () => void;
  refreshing: boolean;
  hasPermission: ReturnType<typeof usePermissions>['hasPermission'];
  handleSyncEmails: () => Promise<void>;
  notifyTriage: boolean;
  setNotifyTriage: Dispatch<SetStateAction<boolean>>;
};

/** The Threads header: view switch, surface count, Compose, Refresh and the ⋯ menu. Moved unchanged from MessagesPage. */
export const MessagesPageHeader = ({
  displayMode,
  setDisplayMode,
  split,
  contactsPagination,
  boardTotal,
  boardPartial,
  pagination,
  isKanban,
  composeAction,
  handleRefresh,
  refreshing,
  hasPermission,
  handleSyncEmails,
  notifyTriage,
  setNotifyTriage,
}: MessagesPageHeaderProps) => (
  <PageHeader
    title={<span className="text-xl max-sm:sr-only">Threads</span>}
    // One row on a phone too (Messages list v4 mobile): the view tabs and the icon-only
    // actions share it, instead of the actions dropping to a row of their own.
    className="flex-row items-center justify-between"
    meta={
      <>
        {/* Text-only on a phone (Messages list v4 mobile): with the icons the tabs and
              the header actions did not fit one 390px row. */}
        <MessagesViewToggle
          displayMode={displayMode}
          onModeChange={setDisplayMode}
          size="md"
          className="max-sm:[&_svg]:hidden"
        />
        <SurfaceCount
          className={cn(
            'text-[12.5px] text-muted-foreground tabular-nums max-sm:hidden',
            split && 'hidden'
          )}
          pagination={
            /**
             * ⛔ Each surface reports ITS OWN count. Contacts already did; the board
             * did not, so the header showed the LIST's total above a board running a
             * different query — "1–50 of 53" over a board whose own badge said 64,
             * the 11 needs-routing threads being the difference.
             */
            displayMode === 'contacts'
              ? contactsPagination
              : displayMode === 'kanban'
                ? {
                    page: 1,
                    limit: boardTotal,
                    total: boardTotal,
                    totalCapped: boardPartial,
                    countTimedOut: boardPartial && boardTotal === 0,
                  }
                : pagination
          }
          isKanban={isKanban}
          noun={displayMode === 'contacts' ? 'contacts' : undefined}
        />
      </>
    }
    actions={
      <>
        {composeAction}
        {/* The list updates by itself (Live); a manual refresh stays, but quiet — as on
              the tickets list. Checking the mailboxes moved into ⋯ (Messages list v4).
              Not on a phone: the header is one row there (tabs · compose · ⋯, as the
              design's mobile), and a third icon pushed Compose over the Kanban tab. */}
        <Tooltip content="Refresh">
          <Button
            variant="ghost"
            aria-label="Refresh"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-0 w-8 h-8 max-sm:hidden"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </Tooltip>
        <Menu
          ariaLabel="More"
          align="end"
          width={300}
          trigger={({ open, toggle }) => (
            <Tooltip content="More">
              <Button
                variant="ghost"
                aria-label="More"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
                className="p-0 w-8 h-8"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </Tooltip>
          )}
        >
          {hasPermission(Permission.MANAGE_MESSAGES) && (
            <>
              <MenuItem
                icon={<Inbox className="w-3.5 h-3.5" />}
                hint="otherwise every few minutes"
                disabled={refreshing}
                onSelect={() => void handleSyncEmails()}
              >
                Check mailboxes now
              </MenuItem>
              <MenuSeparator />
            </>
          )}
          <MenuItem
            checked={notifyTriage}
            hint="spam"
            onSelect={() => {
              const next = !notifyTriage;
              setNotifyTriage(next);
              try {
                localStorage.setItem(NOTIFY_TRIAGE_KEY, next ? '1' : '0');
              } catch {
                // Private window / blocked storage: the choice lasts this page only.
              }
            }}
          >
            Notify me about new triage mail
          </MenuItem>
        </Menu>
      </>
    }
  />
);
