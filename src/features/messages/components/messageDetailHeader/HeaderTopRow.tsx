import type React from 'react';
import type { RefObject } from 'react';
import {
  RefreshCw,
  X,
  LinkIcon,
  Maximize2,
  Mail,
  MailOpen,
  MoreHorizontal,
  ChevronLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatConvId } from '@/lib/messageHelpers';
import type { Message } from '@/types';
import { LABEL, CHANNEL_ICONS, channelName } from '../messageDetailConstants';
import { ICON_BTN, PHONE_ICON_BTN } from './headerStyles';

type HeaderTopRowProps = {
  message: Message;
  orgCode: string | undefined;
  threadCount: number;
  compact: boolean;
  isPhone: boolean;
  isFullPage: boolean;
  showFullPageButton: boolean;
  onClose?: () => void;
  onRefresh?: () => void;
  showReadToggle?: boolean;
  isRead?: boolean;
  onToggleRead?: () => void;
  showLabelPicker: boolean;
  setShowLabelPicker: (open: boolean) => void;
  linkCopied: boolean;
  handleCopyLink: (announce?: boolean) => void;
  moreButtonRef: RefObject<HTMLButtonElement>;
  moreOpen: boolean;
  setMoreOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** The More menu (MoreMenuSheet), portalled to <body> on a phone. */
  moreSheet: React.ReactNode;
};

/**
 * Top row (v3): identity line left, 30px icon actions right — each with a tooltip that names its
 * key where one exists. The More menu lives here now ("…", was ACTIONS).
 */
export function HeaderTopRow({
  message,
  orgCode,
  threadCount,
  compact,
  isPhone,
  isFullPage,
  showFullPageButton,
  onClose,
  onRefresh,
  showReadToggle,
  isRead,
  onToggleRead,
  showLabelPicker,
  setShowLabelPicker,
  linkCopied,
  handleCopyLink,
  moreButtonRef,
  moreOpen,
  setMoreOpen,
  moreSheet,
}: HeaderTopRowProps) {
  return (
    <div
      data-testid="detail-top-row"
      data-compact={compact || undefined}
      className={`flex items-center gap-[5px] px-3.5 pt-2.5 ${compact ? 'pb-2.5' : 'pb-1.5'} max-sm:pb-0 max-sm:sticky max-sm:top-[var(--md-sticky-top,0px)] max-sm:z-[7] max-sm:h-[52px] max-sm:gap-0 max-sm:px-1.5 max-sm:pt-0 max-sm:bg-card max-sm:border-b max-sm:border-border`}
    >
      {isPhone && onClose && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Back to inbox"
          className="flex-none w-11 h-11 rounded-xl text-foreground hover:bg-muted"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={2.2} />
        </Button>
      )}
      <div className="flex items-center gap-2 mr-1 min-w-0 text-muted-foreground max-sm:flex-1 max-sm:flex-col max-sm:gap-px max-sm:mr-0 max-sm:leading-tight">
        <span className="font-mono text-[10.5px] max-sm:text-[12px] max-sm:font-semibold max-sm:text-foreground">
          {formatConvId(message, orgCode)}
        </span>
        <span
          className={`${LABEL} max-sm:text-[10.5px] max-sm:truncate max-sm:max-w-full`}
          title={channelName(message.channel) || undefined}
        >
          {/* The channel's name ("WhatsApp", not the key) — LABEL sets it in capitals, as v4. */}
          {CHANNEL_ICONS[message.channel] ?? '◌'} {channelName(message.channel)}
          {threadCount > 1 && ` · ${threadCount} msgs`}
        </span>
      </div>
      {/* Desktop: the subject shares the id's line (owner, 2026-10-29) — one line, the full
          subject on hover — instead of a row of its own. Phones keep it under the top row. */}
      {isPhone ? (
        <span className="flex-1 max-sm:hidden" />
      ) : (
        <h2
          title={message.subject ?? undefined}
          className="flex-1 min-w-0 truncate font-display text-[15px] font-semibold leading-[1.3] tracking-[-0.015em] text-foreground"
        >
          {message.subject ?? '(no subject)'}
        </h2>
      )}
      {showLabelPicker && (
        <button
          type="button"
          aria-label="Close"
          className="fixed inset-0 z-30 cursor-default"
          onClick={() => setShowLabelPicker(false)}
        />
      )}
      {/* Phones: Copy link / Refresh / read toggle / full page / Close live in More or the Back
          button instead (v4 mobile hides these icons). */}
      {!isPhone && (
        <Tooltip content={linkCopied ? 'Link copied' : 'Copy link'} side="bottom" size="sm">
          <button
            type="button"
            onClick={() => handleCopyLink()}
            aria-label="Copy link"
            className={ICON_BTN}
          >
            <LinkIcon className="w-[15px] h-[15px]" />
          </button>
        </Tooltip>
      )}
      {!isPhone && onRefresh && (
        <Tooltip content="Refresh thread" side="bottom" size="sm">
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh thread"
            className={ICON_BTN}
          >
            <RefreshCw className="w-[15px] h-[15px]" />
          </button>
        </Tooltip>
      )}
      {!isPhone && showReadToggle && onToggleRead && (
        <Tooltip
          // U does the same (detailShortcuts.ts) — it acts exactly where this toggle is shown.
          content={isRead ? 'Mark as unread · U' : 'Mark as read · U'}
          side="bottom"
          size="sm"
        >
          <button
            type="button"
            onClick={onToggleRead}
            aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
            className={ICON_BTN}
          >
            {isRead ? (
              <MailOpen className="w-[15px] h-[15px]" />
            ) : (
              <Mail className="w-[15px] h-[15px]" />
            )}
          </button>
        </Tooltip>
      )}
      {!isPhone && showFullPageButton && !isFullPage && (
        <Tooltip content="Open full page" side="bottom" size="sm">
          <Link to={`/threads/${message.id}`} aria-label="Open full page" className={ICON_BTN}>
            <Maximize2 className="w-[15px] h-[15px]" />
          </Link>
        </Tooltip>
      )}
      <div className="relative">
        <Tooltip content="More actions" side="bottom" size="sm" quietFocus>
          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setMoreOpen((val) => !val)}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            className={`${ICON_BTN} ${PHONE_ICON_BTN} ${moreOpen ? 'bg-muted text-foreground' : ''}`}
          >
            <MoreHorizontal className="w-[15px] h-[15px]" />
          </button>
        </Tooltip>
        {moreOpen &&
          /*
            Phones: the sheet and its scrim go to <body>. Inside this sticky row they sat in its
            stacking context (z 7), under the app's fixed header (z 65) on the full page — the
            Related sheet, rendered outside the row, covers it; both sheets now behave alike.
          */
          (isPhone ? createPortal(moreSheet, document.body) : moreSheet)}
      </div>
      {!isPhone && onClose && !isFullPage && (
        <>
          <span className="w-px h-[18px] mx-0.5 bg-border flex-none" aria-hidden />
          <Tooltip content="Close · Esc" side="bottom" size="sm">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`${ICON_BTN} hover:!bg-destructive-muted hover:!text-destructive`}
            >
              <X className="w-[15px] h-[15px]" />
            </button>
          </Tooltip>
        </>
      )}
    </div>
  );
}
