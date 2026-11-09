import { useState } from 'react';
import { aiRefusalText } from './routingCopy';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { organizationService } from '@/services/organization.service';
import type { RoutingTestResult, SkillMatch } from '@/types/skillRouting';

const STATUS_BADGE = { clear: 'success', unclear: 'warning', none: 'secondary' } as const;

const REASON_TEXT: Record<string, string> = {
  skill_match: 'by skill match',
  load_balance: 'as the least busy agent (no skill matched)',
};

const describeMatch = (match: SkillMatch): string =>
  `${match.key} = ${match.value}${
    match.evidence
      ? match.source === 'pattern'
        ? ` — text pattern found “${match.evidence}”`
        : ` — mentions “${match.evidence}”`
      : ''
  }${match.source === 'ai' ? ' (AI judged)' : ''}`;

/**
 * "Test a message" (BE spec 2026-11-02 skill routing §6.8): paste a message, see what matched and
 * who would get it. Nothing is written; no AI call unless "Ask AI" is on.
 */
export const RoutingTestBox = () => {
  const [text, setText] = useState('');
  const [askAi, setAskAi] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RoutingTestResult | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const outcome = await organizationService.testRoutingMessage({ text, askAi });
      setResult(outcome);
      if (outcome.wouldAssign) {
        const members = await organizationService.getMembers().catch(() => []);
        const member = (
          members as Array<{
            userId: number;
            firstName?: string | null;
            lastName?: string | null;
            email?: string;
          }>
        ).find((candidate) => candidate.userId === outcome.wouldAssign?.userId);
        const name = member ? [member.firstName, member.lastName].filter(Boolean).join(' ') : '';
        setAssignee(name || member?.email || `Agent #${outcome.wouldAssign.userId}`);
      } else {
        setAssignee(null);
      }
    } catch {
      setError('The test could not run. Try again.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        Test a message
      </p>
      <Textarea
        aria-label="Message to test"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="Paste a customer message to see which agent routing would pick, and why"
      />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => void run()}
          disabled={!text.trim() || running}
          isLoading={running}
        >
          Test
        </Button>
        <Toggle
          checked={askAi}
          onChange={setAskAi}
          label="Ask AI for unclear keys"
          ariaLabel="Ask AI for unclear keys (one AI call)"
        />
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {result && (
        <div className="space-y-2 text-sm">
          <p>
            {result.wouldAssign ? (
              <>
                Would go to <strong>{assignee}</strong>{' '}
                {REASON_TEXT[result.wouldAssign.reason] ?? `(${result.wouldAssign.reason})`}
              </>
            ) : (
              'Nobody would get it by skill (the auto-assign mode decides what happens next).'
            )}
          </p>
          <ul className="space-y-1">
            {result.keys.map((entry) => (
              <li key={entry.key} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{entry.key}</span>
                <Badge variant={STATUS_BADGE[entry.status]}>{entry.status}</Badge>
                {entry.accepted.map((match) => (
                  <span key={match.value} className="text-muted-foreground">
                    {describeMatch(match)}
                  </span>
                ))}
                {entry.status === 'unclear' && entry.candidates.length > 0 && (
                  <span className="text-muted-foreground">
                    could be {entry.candidates.map((candidate) => candidate.value).join(' or ')}
                  </span>
                )}
                {entry.status === 'unclear' && result.judgement?.[entry.key] && (
                  <span className="text-muted-foreground">
                    AI picked {result.judgement[entry.key]}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {result.detectedLanguage && (
            <p className="text-xs text-muted-foreground">
              Detected language: {result.detectedLanguage}
            </p>
          )}
          {result.aiRefused && <Alert variant="warning">{aiRefusalText(result.aiRefused)}</Alert>}
          {result.notes.map((note) => (
            <p key={note} className="text-xs text-muted-foreground">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
