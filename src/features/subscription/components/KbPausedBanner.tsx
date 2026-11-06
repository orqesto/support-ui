import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import type { AiStatus } from './aiStatus';
import { AI_KEY_SETTINGS_PATH, KB_USED_ADMIN_TEXT, KB_USED_AGENT_TEXT } from './starterAllowance';

/**
 * Free on our AI with its knowledge-base / history-import allowance used up (`ai.kbPaused`, BE
 * #1112). Not the AI-paused banner: live mail keeps its own allowance and AI keeps answering new
 * mail; only history import and knowledge-base building go on without our AI. Admins read the
 * server's sentence (`ai.kbMessage`) plus that live mail is fine, with Add your AI key; agents read
 * "ask your admin". Hidden while live AI is paused (that banner says more) and on an older backend.
 */
export const KbPausedBanner = ({ ai, isAdmin }: { ai: AiStatus | undefined; isAdmin: boolean }) => {
  if (!ai?.kbPaused || ai.paused) return null;
  const text = isAdmin
    ? ai.kbMessage
      ? `${ai.kbMessage} AI for new mail keeps running.`
      : KB_USED_ADMIN_TEXT
    : KB_USED_AGENT_TEXT;
  return (
    <div
      data-testid="kb-paused-banner"
      className="mb-3 flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      <span className="flex items-center gap-2 text-foreground">
        <BookOpen className="h-4 w-4 shrink-0 text-warning" />
        <span>{text}</span>
      </span>
      {isAdmin && (
        <Link
          to={AI_KEY_SETTINGS_PATH}
          className="shrink-0 font-medium text-primary hover:underline"
        >
          Add your AI key
        </Link>
      )}
    </div>
  );
};
