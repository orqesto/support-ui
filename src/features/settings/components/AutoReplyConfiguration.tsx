import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, MessageCircle, Plus, X } from 'lucide-react';
import type { AlertState } from '@/features/settings/components/integrations/types';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { useAiDraftsOff } from '@/features/settings/hooks/useAiDraftsOff';
import { useDepartments } from '@/hooks/useDepartments';
import { deriveTeamsEnabled } from '@/hooks/useTeamsEnabled';
import { usePermissions } from '@/hooks/usePermissions';
import { logger } from '@/lib/logger';
import {
  organizationService,
  type AutoReplyMode,
  type AutoReplyPartialAnswer,
} from '@/services/organization.service';
import { getApiErrorMessage, getErrorBody, getErrorStatus } from '@/lib/errorMessages';
import { Permission } from '@/types/roles';
import { AutoReplyRulesSection } from './AutoReplyRulesSection';
import { FeatureSuggestions } from './FeatureSuggestions';
import {
  BUILT_IN_NOTE,
  BuiltInTopics,
  RESTRICTED_TOPICS_ALSO,
  RESTRICTED_TOPICS_HELP,
  RESTRICTED_TOPICS_TITLE,
  RestrictedTopicsField,
  TopicsReadOnly,
} from './RestrictedTopicsField';
import {
  readBuiltInTopics,
  readRestrictedTopics,
  restrictedTopicsRefusal,
} from './restrictedTopics';
import { OtherTeamTopics, TOPICS_ADMIN_ONLY, readTopicTeams } from './OtherTeamTopics';
import type { BuiltInRestrictedTopic, RestrictedTopicTeam } from '@/types/api';
import {
  PARTIAL_ANSWER_LABEL,
  PARTIAL_ANSWER_TITLE,
  PartialAnswerChoice,
} from './PartialAnswerChoice';

/* eslint-disable max-lines -- single cohesive component; splitting would
   require threading 6+ pieces of state through child props or context. */
// Unified AI Auto-Reply. Default row at top applies to every dept; per-dept
// rows override individual fields. Same PATCH /api/organizations/auto-reply
// endpoint as before — no BE change.

type Settings = {
  autoReplyEnabled?: boolean;
  /** Workspace: always set once loaded. Team: absent = same as the workspace. */
  autoReplyMode?: AutoReplyMode;
  autoReplyRequestMissingInfo?: boolean;
  autoReplySuggestSolutions?: boolean;
  autoReplyHighConfidenceThreshold?: number;
  /** Workspace: always set once loaded. Team: absent = same as the workspace. */
  autoReplyPartialAnswer?: AutoReplyPartialAnswer;
  escalationPhrases?: string[];
  /** Workspace: its own topics. Team: topics ADDED to the workspace's (never instead of them). */
  restrictedTopics?: string[];
};

/** Does a team row still override anything once `rest` is what is left of it? */
const hasOtherOverrides = (rest: Settings): boolean =>
  Object.values(rest).some(
    (value) => value !== undefined && !(Array.isArray(value) && value.length === 0)
  );

const DEFAULT_THRESHOLD = 0.9;
const DEPT_MIN_THRESHOLD = 0.9;
const DEPT_MAX_THRESHOLD = 1.0;
const MAX_ESCALATION_PHRASES = 50;

type Props = {
  onShowAlert: (alert: AlertState) => void;
};

const formatThreshold = (value: number): string => `${Math.round(value * 100)}%`;

const MODE_LABEL: Record<AutoReplyMode, string> = {
  all: 'Keyword rules and AI replies',
  rules_only: 'Keyword rules only',
};
const MODES: AutoReplyMode[] = ['all', 'rules_only'];
const MODE_HELP =
  'Keyword rules only: only your keyword rules reply; the AI never sends on its own.';
const RULES_ONLY_NOTE = 'These AI settings do not apply in "Keyword rules only".';

/** Does a team change anything of the default? Its extra restricted topics alone do not. */
const overridesDefault = (settings: Settings | undefined): boolean => {
  const { restrictedTopics: _topics, ...overrides } = settings ?? {};
  return hasOtherOverrides(overrides);
};

const TEAM_GONE =
  'This team is switched off or no longer exists, so its restricted topics cannot be changed.';
const TOPIC_ALREADY_LISTED = 'Already in the list';
/**
 * A 404 on a topic change, in words: the plain sentence when it is about the team (the server's
 * "Team not found…", or no sentence at all on a team's list), otherwise what the server said.
 */
const notFoundSentence = (err: unknown, team: boolean): string | undefined => {
  const told = getErrorBody(err)?.error;
  const sentence = typeof told === 'string' ? told.trim() : '';
  if (team && (sentence === '' || /^team not found/i.test(sentence))) return TEAM_GONE;
  return sentence || undefined;
};
const RESET_KEEPS_TOPICS = "The reset keeps this team's extra restricted topics.";

/** The team map as it is saved: without restricted topics, and without a team left empty. */
const withoutTopics = (teams: Record<string, Settings>): Record<string, Settings> =>
  Object.fromEntries(
    Object.entries(teams)
      .map(([key, { restrictedTopics: _omit, ...rest }]): [string, Settings] => [key, rest])
      .filter(([, rest]) => Object.keys(rest).length > 0)
  );

/** A team's own topics that the workspace does not have already (any letter case). */
const extraTopics = (own: string[] | undefined, workspace: string[]): string[] => {
  const taken = new Set(workspace.map((topic) => topic.trim().toLowerCase()));
  return (own ?? []).filter((topic) => !taken.has(topic.trim().toLowerCase()));
};

/** What a team row says about the topics it cannot change. */
const teamAlsoApplies = (builtInCount: number, workspaceCount: number): string => {
  const workspace =
    workspaceCount === 0
      ? ''
      : ` and the workspace's ${workspaceCount} ${workspaceCount === 1 ? 'topic' : 'topics'}`;
  const builtIn = builtInCount > 0 ? `${builtInCount} built-in topics` : 'built-in topics';
  return `Added to the ${builtIn}${workspace}, which always apply to this team and can only be changed in the Default row.`;
};

/** The pill look of the per-team choices, selected or not. */
const pillClass = (selected: boolean): string =>
  `px-2 py-0.5 h-auto text-[10px] rounded-full ${
    selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
  }`;

export const AutoReplyConfiguration = ({ onShowAlert }: Props) => {
  const { hasPermission, isOrgAdmin } = usePermissions();
  // Workspace admins and moderators (MANAGE_AUTO_REPLY); others see a read-only summary.
  const canManage = hasPermission(Permission.MANAGE_AUTO_REPLY);
  // Restricted topics are a safety list: the backend lets only a workspace admin change them
  // (403 ROLE_REQUIRED for a moderator), so anyone else reads them.
  const canChangeTopics = canManage && isOrgAdmin;
  const { off: aiDraftsOff } = useAiDraftsOff();
  const { data: departments = [], teamsEnabled: teamsMode } = useDepartments();
  // Teams off: no per-team rows, except one that still carries an override (so it can be reset).
  const teamsEnabled = deriveTeamsEnabled(teamsMode, departments);
  const activeDepts = useMemo(() => departments.filter((dept) => dept.active), [departments]);

  // Org-level (the "Default" row). Source-of-truth lives on the server; this is
  // the local mirror. Ref guards against concurrent toggle races at the org
  // level just like perDeptRef does at the dept level (rapid double-click).
  const [org, setOrg] = useState<Settings>({});
  const orgRef = useRef<Settings>({});
  // Per-dept overrides keyed by stringified dept id. Same race-safe ref pattern
  // as the original DepartmentAutoReplySettings — overlapping saves on
  // different rows must each read the latest merged map, not a stale closure.
  const [perDept, setPerDept] = useState<Record<string, Settings>>({});
  const perDeptRef = useRef<Record<string, Settings>>({});

  const [loading, setLoading] = useState(true);
  /** Which rows have a save queued or in flight: 'org', or a team's id as text. */
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [phraseDrafts, setPhraseDrafts] = useState<Record<string, string>>({});
  // False until the backend returns the list: an older one does not know the setting, and a save
  // to it would be dropped without a word — so the section is not offered at all.
  const [topicsSupported, setTopicsSupported] = useState(false);
  /** The topics every workspace has, as the backend names them; never part of a save. */
  const [builtInTopics, setBuiltInTopics] = useState<BuiltInRestrictedTopic[]>([]);
  /** Every team that has stored topics — also a switched-off or deleted one — as the server lists them. */
  const [topicTeams, setTopicTeams] = useState<RestrictedTopicTeam[]>([]);

  // Threshold is editable via a slider that triggers a save on mouse/touch up;
  // mid-drag we hold the value locally so the slider stays responsive.
  const [tempThresholdOrg, setTempThresholdOrg] = useState<number | null>(null);
  const [tempThresholdDept, setTempThresholdDept] = useState<Record<string, number>>({});

  /** Reads the settings as stored and shows them; `stale()` true = the answer is no longer wanted. */
  const loadStored = useCallback(async (stale: () => boolean = () => false) => {
    const [auto, orgRow] = await Promise.all([
      organizationService.getAutoReply(),
      organizationService.getCurrent(),
    ]);
    if (stale()) return;
    const initialOrg: Settings = {
      autoReplyEnabled: auto.enabled,
      autoReplyMode: auto.mode,
      autoReplyRequestMissingInfo: auto.requestMissingInfo,
      autoReplySuggestSolutions: auto.suggestSolutions,
      autoReplyHighConfidenceThreshold: auto.highConfidenceThreshold,
      autoReplyPartialAnswer: auto.partialAnswer,
      restrictedTopics: readRestrictedTopics(auto.restrictedTopics) ?? [],
    };
    setTopicsSupported(readRestrictedTopics(auto.restrictedTopics) !== null);
    setBuiltInTopics(readBuiltInTopics(auto.builtInRestrictedTopics));
    setTopicTeams(readTopicTeams(auto.restrictedTopicTeams) ?? []);
    setOrg(initialOrg);
    orgRef.current = initialOrg;
    const settings: Record<string, unknown> = orgRow.settings ?? {};
    const dept = (settings.departmentSettings ?? {}) as Record<string, Settings>;
    setPerDept(dept);
    perDeptRef.current = dept;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        await loadStored(() => cancelled);
      } catch (err) {
        if (cancelled) return;
        logger.error('Failed to load auto-reply settings:', err);
        setError(getApiErrorMessage(err) ?? 'Failed to load the automatic reply settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStored]);

  // Every save of this card runs after the one before it, so each builds on what the last one
  // left (two saves in flight used to send two stale copies of the team map), and each takes
  // the stored state from its response — the screen shows what is saved, also by someone else.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const savingCountRef = useRef<Record<string, number>>({});
  const queued = useCallback((scope: string, job: () => Promise<boolean>): Promise<boolean> => {
    savingCountRef.current[scope] = (savingCountRef.current[scope] ?? 0) + 1;
    setSaving((prev) => ({ ...prev, [scope]: true }));
    const run = queueRef.current.then(job, job).finally(() => {
      savingCountRef.current[scope] -= 1;
      if (savingCountRef.current[scope] === 0) setSaving((prev) => ({ ...prev, [scope]: false }));
    });
    queueRef.current = run;
    return run;
  }, []);

  /** What the server answered a save with: the lists and the team map as they are stored now. */
  const applyStored = useCallback((stored: unknown): boolean => {
    const data = (stored as { data?: Record<string, unknown> } | undefined)?.data;
    if (!data || typeof data !== 'object') return false;
    const topics = readRestrictedTopics(data.restrictedTopics);
    if (topics) {
      orgRef.current = { ...orgRef.current, restrictedTopics: topics };
      setOrg((prev) => ({ ...prev, restrictedTopics: topics }));
    }
    const topicTeamsNow = readTopicTeams(data.restrictedTopicTeams);
    if (topicTeamsNow) setTopicTeams(topicTeamsNow);
    const teams = data.departmentSettings;
    if (!teams || typeof teams !== 'object') return false;
    perDeptRef.current = teams as Record<string, Settings>;
    setPerDept(perDeptRef.current);
    return true;
  }, []);

  const saveFailed = useCallback(
    (err: unknown, fallback: string, description: string, plain?: string) => {
      setError(plain ?? restrictedTopicsRefusal(err) ?? getApiErrorMessage(err) ?? fallback);
      onShowAlert({
        open: true,
        title: 'Save failed',
        description: plain ?? description,
        variant: 'error',
      });
    },
    [onShowAlert]
  );

  const saveOrg = useCallback(
    (
      patch: Partial<{
        enabled: boolean;
        mode: AutoReplyMode;
        requestMissingInfo: boolean;
        suggestSolutions: boolean;
        highConfidenceThreshold: number;
        partialAnswer: AutoReplyPartialAnswer;
      }>
    ): Promise<boolean> =>
      queued('org', async () => {
        setError(null);
        const previous = orgRef.current;
        const optimistic: Settings = {
          ...previous,
          ...(patch.enabled !== undefined && { autoReplyEnabled: patch.enabled }),
          ...(patch.mode !== undefined && { autoReplyMode: patch.mode }),
          ...(patch.requestMissingInfo !== undefined && {
            autoReplyRequestMissingInfo: patch.requestMissingInfo,
          }),
          ...(patch.suggestSolutions !== undefined && {
            autoReplySuggestSolutions: patch.suggestSolutions,
          }),
          ...(patch.highConfidenceThreshold !== undefined && {
            autoReplyHighConfidenceThreshold: patch.highConfidenceThreshold,
          }),
          ...(patch.partialAnswer !== undefined && { autoReplyPartialAnswer: patch.partialAnswer }),
        };
        orgRef.current = optimistic;
        try {
          const stored = await organizationService.updateAutoReply(patch);
          setOrg(optimistic);
          applyStored(stored);
          const field =
            patch.enabled !== undefined
              ? `Automatic email replies ${patch.enabled ? 'on' : 'off'}`
              : patch.mode !== undefined
                ? `Automatic email replies: ${MODE_LABEL[patch.mode]}`
                : patch.requestMissingInfo !== undefined
                  ? `Missing-info requests ${patch.requestMissingInfo ? 'on' : 'off'}`
                  : patch.suggestSolutions !== undefined
                    ? `Suggest-solutions ${patch.suggestSolutions ? 'on' : 'off'}`
                    : patch.highConfidenceThreshold !== undefined
                      ? `AI reply confidence set to ${Math.round(patch.highConfidenceThreshold * 100)}%`
                      : patch.partialAnswer !== undefined
                        ? `${PARTIAL_ANSWER_TITLE}: ${PARTIAL_ANSWER_LABEL[patch.partialAnswer]}`
                        : 'Default updated';
          onShowAlert({ open: true, title: 'Saved', description: field, variant: 'success' });
          return true;
        } catch (err) {
          orgRef.current = previous;
          logger.error('Failed to save org auto-reply:', err);
          saveFailed(
            err,
            'Failed to save the default. Please try again.',
            'Could not save the workspace default.'
          );
          return false;
        }
      }),
    [applyStored, onShowAlert, queued, saveFailed]
  );

  /**
   * One team's settings, changed from what is known NOW (not from what was on screen at the
   * click). `change` returns the team's new settings, or null to drop every override. The PATCH
   * replaces the whole team map, so every team is sent; restricted topics are never part of it —
   * the server keeps each team's topics, and they change only through changeTopics below.
   */
  const updateDept = useCallback(
    (deptId: number, change: (current: Settings) => Settings | null): Promise<boolean> =>
      queued(String(deptId), async () => {
        const key = String(deptId);
        setError(null);
        const previous = perDeptRef.current;
        const { restrictedTopics: topics, ...current } = previous[key] ?? {};
        const changed = change(current);
        const kept = changed && hasOtherOverrides(changed) ? changed : null;
        const local = { ...previous };
        const own = { ...kept, ...(topics?.length ? { restrictedTopics: topics } : {}) };
        if (Object.keys(own).length > 0) local[key] = own;
        else delete local[key];
        perDeptRef.current = local;
        try {
          const stored = await organizationService.updateAutoReply({
            departmentSettings: withoutTopics(local),
          });
          if (!applyStored(stored)) setPerDept(local);
          return true;
        } catch (err) {
          perDeptRef.current = previous;
          logger.error(`Failed to save dept ${deptId} auto-reply:`, err);
          saveFailed(
            err,
            'Failed to save the override. Please try again.',
            'Could not save the override for this team.'
          );
          return false;
        }
      }),
    [applyStored, queued, saveFailed]
  );

  /**
   * Reads ONLY the restricted-topic lists again (the workspace's, each team's, and the teams that
   * have any): everything else on the card stays as it is on screen.
   */
  const refreshTopics = useCallback(async () => {
    const [auto, orgRow] = await Promise.all([
      organizationService.getAutoReply(),
      organizationService.getCurrent(),
    ]);
    const topics = readRestrictedTopics(auto.restrictedTopics);
    if (topics) {
      orgRef.current = { ...orgRef.current, restrictedTopics: topics };
      setOrg((prev) => ({ ...prev, restrictedTopics: topics }));
    }
    const teams = readTopicTeams(auto.restrictedTopicTeams);
    if (teams) setTopicTeams(teams);
    const settings: Record<string, unknown> = orgRow.settings ?? {};
    const stored = (settings.departmentSettings ?? {}) as Record<string, Settings>;
    const next: Record<string, Settings> = {};
    for (const key of new Set([...Object.keys(perDeptRef.current), ...Object.keys(stored)])) {
      const { restrictedTopics: _stale, ...kept } = perDeptRef.current[key] ?? {};
      const own = readRestrictedTopics(stored[key]?.restrictedTopics) ?? [];
      const team = { ...kept, ...(own.length > 0 ? { restrictedTopics: own } : {}) };
      if (Object.keys(team).length > 0) next[key] = team;
    }
    perDeptRef.current = next;
    setPerDept(next);
  }, []);

  /** A list's own topics as the page holds them now (the workspace's, or one team's). */
  const topicsIn = useCallback(
    (deptId: number | null): readonly string[] =>
      (deptId === null
        ? orgRef.current.restrictedTopics
        : perDeptRef.current[String(deptId)]?.restrictedTopics) ?? [],
    []
  );
  /**
   * Add or remove ONE restricted topic. Only the change is sent, and the server applies it to
   * the list as it is stored — so a page opened a while ago, or a second admin, cannot erase
   * topics by saving an old copy of the list. The lists shown are then the ones in the answer.
   */
  const changeTopics = useCallback(
    (deptId: number | null, change: { add: string } | { remove: string }): Promise<boolean> =>
      queued(deptId === null ? 'org' : String(deptId), async () => {
        setError(null);
        try {
          const before = topicsIn(deptId);
          const stored = await organizationService.updateAutoReply({
            restrictedTopicsChange: {
              ...(deptId === null
                ? { scope: 'workspace' as const }
                : { scope: 'team' as const, departmentId: deptId }),
              ...('add' in change ? { add: [change.add] } : { remove: [change.remove] }),
            },
          });
          applyStored(stored);
          // The server keeps a topic it already stores under another spelling: answered 200, and
          // the list is as it was — "Saved" would be untrue.
          const after = topicsIn(deptId);
          if ('add' in change && before.join('\n') === after.join('\n')) {
            onShowAlert({
              open: true,
              title: TOPIC_ALREADY_LISTED,
              description: `“${change.add}” is already a restricted topic here.`,
              variant: 'info',
            });
          } else if (deptId === null) {
            onShowAlert({
              open: true,
              title: 'Saved',
              description: `${RESTRICTED_TOPICS_TITLE} updated`,
              variant: 'success',
            });
          }
          return true;
        } catch (err) {
          logger.error('Failed to save restricted topics:', err);
          saveFailed(
            err,
            'Failed to save the restricted topics. Please try again.',
            'Could not save the restricted topics.',
            // The team was switched off or deleted meanwhile (404), or the role is not enough
            // (403 ROLE_REQUIRED): said plainly. Any other 404 keeps the server's own sentence.
            getErrorStatus(err) === 404
              ? notFoundSentence(err, deptId !== null)
              : getErrorStatus(err) === 403 && getErrorBody(err)?.code === 'ROLE_REQUIRED'
                ? TOPICS_ADMIN_ONLY
                : undefined
          );
          // Not there any more (404): someone else removed the topic or the team meanwhile, so
          // the lists on screen are stale — read them again instead of leaving a chip that
          // answers 404 on every click.
          if (getErrorStatus(err) === 404) {
            await refreshTopics().catch((reloadErr: unknown) =>
              logger.error('Failed to re-read auto-reply settings:', reloadErr)
            );
          }
          return false;
        }
      }),
    [applyStored, refreshTopics, onShowAlert, queued, saveFailed, topicsIn]
  );

  const setDeptKey = <Key extends keyof Settings>(deptId: number, key: Key, value: Settings[Key]) =>
    void updateDept(deptId, (current) => {
      const { [key]: _omit, ...rest } = current;
      return value === undefined ? rest : { ...rest, [key]: value };
    });

  /** A team's mode; `undefined` = same as the workspace (the key is dropped). */
  const setDeptMode = (deptId: number, mode: AutoReplyMode | undefined) => {
    if (mode === undefined && perDeptRef.current[String(deptId)]?.autoReplyMode === undefined)
      return;
    setDeptKey(deptId, 'autoReplyMode', mode);
  };

  /** A team's partial-answer choice; `undefined` = same as the workspace (the key is dropped). */
  const setDeptPartialAnswer = (deptId: number, value: AutoReplyPartialAnswer | undefined) => {
    const current = perDeptRef.current[String(deptId)]?.autoReplyPartialAnswer;
    if (value === undefined && current === undefined) return;
    setDeptKey(deptId, 'autoReplyPartialAnswer', value);
  };

  /** Drops every override of the team. Its extra restricted topics are the server's to keep. */
  const resetDept = (deptId: number) => void updateDept(deptId, () => null);

  // Rules send only where Auto-Reply is on: the Default row, or a team that overrides it on.
  const anyAutoReplyOn =
    org.autoReplyEnabled === true ||
    Object.values(perDept).some((settings) => settings?.autoReplyEnabled === true);
  const orgTopics = org.restrictedTopics ?? [];
  // Team rows on the page: every active team, or — teams off — only one that overrides something.
  const teamRows = teamsEnabled
    ? activeDepts
    : activeDepts.filter((dept) => overridesDefault(perDept[String(dept.id)]));
  /** Teams with stored topics that have no place of their own on the page (`shown` = those that do). */
  const otherTopicTeams = (shown: readonly { id: number }[]): RestrictedTopicTeam[] =>
    topicTeams.filter((team) => !shown.some((dept) => dept.id === team.departmentId));
  const rulesSection = (
    <AutoReplyRulesSection
      canManage={canManage}
      autoReplyEnabled={anyAutoReplyOn}
      teamsEnabled={teamsEnabled}
      onShowAlert={onShowAlert}
    />
  );

  if (!canManage) {
    // Old AIAutoReplyCard was visible (read-only) to non-org-admins so they
    // could at least see what was configured. Preserve that visibility with
    // a non-interactive summary instead of hiding the section entirely.
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2 items-center">
              <MessageCircle className="w-5 h-5" />
              Automatic email replies
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Default: <strong>{org.autoReplyEnabled ? 'Enabled' : 'Disabled'}</strong>
              {org.autoReplyEnabled &&
                org.autoReplyHighConfidenceThreshold !== undefined &&
                ` · threshold ${formatThreshold(org.autoReplyHighConfidenceThreshold)}`}
              {org.autoReplyEnabled &&
                org.autoReplyMode === 'rules_only' &&
                ' · keyword rules only'}
              . Only workspace admins and moderators can change automatic reply settings.
            </p>
            {topicsSupported && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium">{RESTRICTED_TOPICS_TITLE}</p>
                <p className="text-xs text-muted-foreground">{RESTRICTED_TOPICS_HELP}</p>
                <TopicsReadOnly
                  label={RESTRICTED_TOPICS_TITLE}
                  topics={[...builtInTopics.map((topic) => topic.label), ...orgTopics]}
                />
                {activeDepts.map((dept) => {
                  const own = extraTopics(perDept[String(dept.id)]?.restrictedTopics, orgTopics);
                  if (own.length === 0) return null;
                  return (
                    <div key={dept.id} className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs text-muted-foreground">{dept.name} also:</span>
                      <TopicsReadOnly label={`${dept.name} restricted topics`} topics={own} />
                    </div>
                  );
                })}
                <OtherTeamTopics teams={otherTopicTeams(activeDepts)} canChange={false} />
              </div>
            )}
          </CardHeader>
        </Card>
        {rulesSection}
      </div>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading automatic reply settings…
        </CardContent>
      </Card>
    );
  }

  const orgEnabled = org.autoReplyEnabled ?? false;
  const orgThreshold =
    tempThresholdOrg ?? org.autoReplyHighConfidenceThreshold ?? DEFAULT_THRESHOLD;
  const orgRequestMissing = org.autoReplyRequestMissingInfo ?? true;
  const orgSuggest = org.autoReplySuggestSolutions ?? true;
  const orgMode: AutoReplyMode = org.autoReplyMode ?? 'all';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <MessageCircle className="w-5 h-5" />
            Automatic email replies
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Sends email replies without an agent: your keyword rules (canned replies) and AI answers
            from the knowledge base. It does not control the Telegram bot, the chat widget or the
            receipt confirmation.
            {teamsEnabled
              ? ' The Default row applies to every team. A team row uses the default unless overridden.'
              : ''}
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 empty:hidden">
            <FeatureSuggestions
              domains={['auto_reply']}
              title="Suggestions"
              description="Changes the engine suggests to when the AI replies on its own."
            />
          </div>
          {/* The settings below are kept, not cleared: they apply again the moment drafts are
            switched back on. So say plainly that nothing here sends while they are off. */}
          {aiDraftsOff && (
            <Alert variant="warning" className="mb-4">
              AI drafts are switched off for this workspace, so the AI sends no reply of its own —
              whatever is set below. Keyword rules with a plain prepared reply still send; rules
              that add a knowledge base answer (&quot;Template + KB&quot;) do not. These settings
              apply again when AI drafts are switched back on. The receipt confirmation (&quot;we
              got your message&quot;) is not AI-written and still goes out.
            </Alert>
          )}
          {error && (
            <div className="flex gap-2 items-start px-3 py-2 mb-4 text-sm text-destructive rounded-md border border-destructive-line bg-destructive-muted">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-md border divide-y">
            {/* Default row */}
            <div className="bg-muted/30">
              <div className="flex justify-between items-center px-3 py-2.5">
                <div className="flex gap-2 items-center min-w-0">
                  <span className="text-sm font-semibold">Default</span>
                  <span className="text-xs text-muted-foreground">
                    · applies to every team unless overridden
                  </span>
                </div>
                <div className="flex gap-3 items-center shrink-0">
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      orgEnabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {orgEnabled ? 'On' : 'Off'}
                  </span>
                  {orgEnabled && (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {formatThreshold(orgThreshold)}
                    </span>
                  )}
                </div>
              </div>
              <div className="px-3 pt-1 pb-3 space-y-3 bg-background">
                <div className="flex justify-between items-center pt-2">
                  <div>
                    <p className="text-sm font-medium">Automatic email replies</p>
                    <p className="text-xs text-muted-foreground">
                      Off: no keyword rule and no AI reply is emailed. Each team can override below.
                      A mailbox can also be switched off on its card in Integrations.
                    </p>
                  </div>
                  <Toggle
                    checked={orgEnabled}
                    disabled={saving.org === true}
                    onChange={(next) => void saveOrg({ enabled: next })}
                  />
                </div>

                {orgEnabled && (
                  <>
                    <div className="pt-3 space-y-2 border-t">
                      <p id="org-auto-reply-mode" className="text-sm font-medium">
                        What replies on its own
                      </p>
                      <div
                        role="group"
                        aria-labelledby="org-auto-reply-mode"
                        className="flex flex-wrap gap-2"
                      >
                        {MODES.map((mode) => (
                          <Button
                            key={mode}
                            type="button"
                            size="sm"
                            variant={orgMode === mode ? 'primary' : 'outline'}
                            aria-pressed={orgMode === mode}
                            disabled={saving.org === true}
                            onClick={() => {
                              if (orgMode !== mode) void saveOrg({ mode });
                            }}
                          >
                            {MODE_LABEL[mode]}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{MODE_HELP}</p>
                    </div>
                    <div className="pt-3 space-y-2 border-t">
                      <p className="text-sm font-medium">{PARTIAL_ANSWER_TITLE}</p>
                      <PartialAnswerChoice
                        groupLabel={PARTIAL_ANSWER_TITLE}
                        value={org.autoReplyPartialAnswer ?? 'hand_to_agent'}
                        onChange={(value) => {
                          if (value) void saveOrg({ partialAnswer: value });
                        }}
                        disabled={saving.org === true}
                      />
                    </div>
                    {orgMode === 'rules_only' && (
                      <p className="pt-3 text-xs border-t text-warning">{RULES_ONLY_NOTE}</p>
                    )}
                    <div className="flex justify-between items-center pt-3 border-t">
                      <div>
                        <p className="text-sm font-medium">Request missing info</p>
                        <p className="text-xs text-muted-foreground">
                          The AI emails the customer to ask for details when a message is
                          incomplete.
                        </p>
                      </div>
                      <Toggle
                        checked={orgRequestMissing}
                        disabled={saving.org === true}
                        onChange={(next) => void saveOrg({ requestMissingInfo: next })}
                      />
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t">
                      <div>
                        <p className="text-sm font-medium">Suggest solutions</p>
                        <p className="text-xs text-muted-foreground">
                          AI searches the knowledge base and drafts an answer.
                        </p>
                      </div>
                      <Toggle
                        checked={orgSuggest}
                        disabled={saving.org === true}
                        onChange={(next) => void saveOrg({ suggestSolutions: next })}
                      />
                    </div>
                    {orgSuggest && (
                      <div className="pt-3 space-y-2 border-t">
                        <div className="flex justify-between items-center">
                          <label htmlFor="org-threshold" className="text-sm font-medium">
                            AI reply confidence
                          </label>
                          <span className="text-sm font-medium text-foreground">
                            {formatThreshold(orgThreshold)}
                          </span>
                        </div>
                        <input
                          id="org-threshold"
                          type="range"
                          min={70}
                          max={100}
                          step={5}
                          value={Math.round(orgThreshold * 100)}
                          disabled={saving.org === true}
                          onChange={(ev) => setTempThresholdOrg(Number(ev.target.value) / 100)}
                          onMouseUp={() => {
                            if (tempThresholdOrg !== null) {
                              void saveOrg({ highConfidenceThreshold: tempThresholdOrg });
                              setTempThresholdOrg(null);
                            }
                          }}
                          onTouchEnd={() => {
                            if (tempThresholdOrg !== null) {
                              void saveOrg({ highConfidenceThreshold: tempThresholdOrg });
                              setTempThresholdOrg(null);
                            }
                          }}
                          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          AI replies only. Below this, the reply is saved as a suggestion for an
                          agent. Keyword rules and the Telegram bot do not use it.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {/* Not under the switch above: the topics also hold for the Telegram bot. */}
                {topicsSupported && (
                  <div className="pt-3 space-y-2 border-t">
                    <p className="text-sm font-medium">{RESTRICTED_TOPICS_TITLE}</p>
                    <p className="text-xs text-muted-foreground">
                      {RESTRICTED_TOPICS_HELP} {RESTRICTED_TOPICS_ALSO}
                    </p>
                    <BuiltInTopics topics={builtInTopics} />
                    <p className="text-[10px] text-muted-foreground">{BUILT_IN_NOTE}</p>
                    <p className="text-xs font-medium">Your workspace&apos;s topics</p>
                    {canChangeTopics ? (
                      <RestrictedTopicsField
                        label="Workspace restricted topics"
                        topics={orgTopics}
                        emptyText="No topics of your own yet"
                        placeholder='e.g. "refund disputes", "requests from journalists"'
                        disabled={saving.org === true}
                        builtIn={builtInTopics.map((topic) => topic.label)}
                        onAdd={(topic) => changeTopics(null, { add: topic })}
                        onRemove={(topic) => changeTopics(null, { remove: topic })}
                      />
                    ) : (
                      <>
                        <TopicsReadOnly
                          label="Workspace restricted topics"
                          topics={orgTopics}
                          emptyText="No topics of your own yet"
                        />
                        <p className="text-xs text-muted-foreground">{TOPICS_ADMIN_ONLY}</p>
                      </>
                    )}
                    <OtherTeamTopics
                      teams={otherTopicTeams(teamRows)}
                      canChange={canChangeTopics}
                      saving={saving}
                      onRemove={(deptId, topic) => void changeTopics(deptId, { remove: topic })}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Team rows */}
            {teamsEnabled && activeDepts.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                No active teams configured.
              </div>
            )}
            {teamRows.map((dept) => {
              const key = String(dept.id);
              const isSaving = saving[key] === true;
              const settings = perDept[key];
              const hasOverride = overridesDefault(settings);
              const overrideEnabled = settings?.autoReplyEnabled;
              const overrideThreshold = settings?.autoReplyHighConfidenceThreshold;
              const overrideRequestMissing = settings?.autoReplyRequestMissingInfo;
              const overrideSuggest = settings?.autoReplySuggestSolutions;
              const overrideMode = settings?.autoReplyMode;
              const effectiveMode = overrideMode ?? orgMode;
              const phrases = settings?.escalationPhrases ?? [];
              // A topic the workspace has too is shown once, in the Default row.
              const teamTopics = extraTopics(settings?.restrictedTopics, orgTopics);
              const sliderThreshold = tempThresholdDept[key] ?? overrideThreshold ?? orgThreshold;

              const summary = (() => {
                // A team that only adds restricted topics overrides nothing of the default.
                if (!hasOverride) return { label: 'Inherits default', tone: 'muted' as const };
                if (overrideEnabled === false)
                  return { label: 'Override: off', tone: 'red' as const };
                if (overrideEnabled === true)
                  return { label: 'Override: on', tone: 'green' as const };
                if (
                  overrideThreshold !== undefined ||
                  overrideRequestMissing !== undefined ||
                  overrideSuggest !== undefined ||
                  overrideMode !== undefined ||
                  settings?.autoReplyPartialAnswer !== undefined ||
                  phrases.length > 0
                ) {
                  return { label: 'Partial override', tone: 'amber' as const };
                }
                return { label: 'Inherits default', tone: 'muted' as const };
              })();

              const summaryClass =
                summary.tone === 'green'
                  ? 'bg-success/10 text-success'
                  : summary.tone === 'red'
                    ? 'bg-destructive/10 text-destructive'
                    : summary.tone === 'amber'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-muted text-muted-foreground';

              return (
                <div key={dept.id}>
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <div className="flex gap-2 items-center min-w-0">
                      <span className="text-sm font-medium truncate">{dept.name}</span>
                      <span className="text-[10px] text-muted-foreground">{dept.slug}</span>
                    </div>
                    <div className="flex gap-3 items-center shrink-0">
                      {isSaving && (
                        <span className="text-[10px] text-muted-foreground">Saving…</span>
                      )}
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${summaryClass}`}
                      >
                        {summary.label}
                      </span>
                    </div>
                  </div>
                  <div className="px-3 pt-1 pb-3 space-y-3 bg-muted/10">
                    {/* Override toggle: tri-state via two explicit choices */}
                    <div className="flex flex-wrap gap-2 items-center pt-2">
                      <span className="text-xs text-muted-foreground">
                        Automatic replies for this team:
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => setDeptKey(dept.id, 'autoReplyEnabled', undefined)}
                        className={`px-2 py-0.5 h-auto text-[10px] rounded-full ${
                          !hasOverride
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        Inherit default {orgEnabled ? '(on)' : '(off)'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => setDeptKey(dept.id, 'autoReplyEnabled', true)}
                        className={`px-2 py-0.5 h-auto text-[10px] rounded-full ${
                          overrideEnabled === true
                            ? 'bg-success/15 text-success border-success/40'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        Override: on
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => setDeptKey(dept.id, 'autoReplyEnabled', false)}
                        className={`px-2 py-0.5 h-auto text-[10px] rounded-full ${
                          overrideEnabled === false
                            ? 'bg-destructive/15 text-destructive border-destructive/40'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        Override: off
                      </Button>
                    </div>

                    {/* Mode: same as the workspace (key absent), or this team's own */}
                    {(overrideEnabled ?? orgEnabled) && (
                      <div className="pt-3 space-y-1 border-t">
                        <div
                          role="group"
                          aria-label={`What replies on its own for ${dept.name}`}
                          className="flex flex-wrap gap-2 items-center"
                        >
                          <span className="text-xs text-muted-foreground">
                            What replies on its own:
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-pressed={overrideMode === undefined}
                            disabled={isSaving}
                            onClick={() => setDeptMode(dept.id, undefined)}
                            className={pillClass(overrideMode === undefined)}
                          >
                            Same as workspace ({MODE_LABEL[orgMode]})
                          </Button>
                          {MODES.map((mode) => (
                            <Button
                              key={mode}
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-pressed={overrideMode === mode}
                              disabled={isSaving}
                              onClick={() => {
                                if (overrideMode !== mode) setDeptMode(dept.id, mode);
                              }}
                              className={pillClass(overrideMode === mode)}
                            >
                              {MODE_LABEL[mode]}
                            </Button>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{MODE_HELP}</p>
                        <PartialAnswerChoice
                          groupLabel={`${PARTIAL_ANSWER_TITLE} for ${dept.name}`}
                          value={settings?.autoReplyPartialAnswer}
                          inherited={org.autoReplyPartialAnswer ?? 'hand_to_agent'}
                          onChange={(value) => setDeptPartialAnswer(dept.id, value)}
                          disabled={isSaving}
                          pillClass={pillClass}
                        />
                      </div>
                    )}

                    {/* Threshold override only available when this dept will fire auto-reply */}
                    {(overrideEnabled ?? orgEnabled) && (
                      <div className="pt-3 space-y-2 border-t">
                        {effectiveMode === 'rules_only' && (
                          <p className="text-[10px] text-warning">{RULES_ONLY_NOTE}</p>
                        )}
                        <div className="flex justify-between items-center">
                          <label
                            htmlFor={`dept-threshold-${dept.id}`}
                            className="text-xs font-medium"
                          >
                            AI reply confidence
                            {overrideThreshold === undefined && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                (inheriting {formatThreshold(orgThreshold)})
                              </span>
                            )}
                          </label>
                          <span className="text-xs font-medium text-foreground">
                            {formatThreshold(sliderThreshold)}
                          </span>
                        </div>
                        <input
                          id={`dept-threshold-${dept.id}`}
                          type="range"
                          min={Math.round(DEPT_MIN_THRESHOLD * 100)}
                          max={Math.round(DEPT_MAX_THRESHOLD * 100)}
                          step={1}
                          value={Math.round(sliderThreshold * 100)}
                          disabled={isSaving}
                          onChange={(ev) =>
                            setTempThresholdDept((prev) => ({
                              ...prev,
                              [key]: Number(ev.target.value) / 100,
                            }))
                          }
                          onMouseUp={() => {
                            const value = tempThresholdDept[key];
                            if (value !== undefined) {
                              setDeptKey(dept.id, 'autoReplyHighConfidenceThreshold', value);
                              setTempThresholdDept((prev) => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                            }
                          }}
                          onTouchEnd={() => {
                            const value = tempThresholdDept[key];
                            if (value !== undefined) {
                              setDeptKey(dept.id, 'autoReplyHighConfidenceThreshold', value);
                              setTempThresholdDept((prev) => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                            }
                          }}
                          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          AI replies only. Below this, the reply is saved as a suggestion for an
                          agent. Keyword rules and the Telegram bot do not use it. Range 90–100%.
                        </p>
                      </div>
                    )}

                    {/* Escalation phrases — per dept only */}
                    <div className="pt-3 space-y-2 border-t">
                      <label className="text-xs font-medium">
                        Phrases that stop automatic replies{' '}
                        {phrases.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            ({phrases.length})
                          </span>
                        )}
                      </label>
                      <p className="text-[10px] text-muted-foreground">
                        If a customer&apos;s email contains one of these, no keyword rule and no AI
                        answer is sent; the AI answer is saved as a suggestion for an agent. Does
                        not apply to Telegram or the chat widget.
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {phrases.length === 0 && (
                          <span className="text-xs italic text-muted-foreground">No phrases</span>
                        )}
                        {phrases.map((phrase) => (
                          <span
                            key={phrase}
                            className="flex gap-1 items-center px-2 py-0.5 text-xs text-warning bg-warning-muted rounded-full"
                          >
                            {phrase}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={isSaving}
                              onClick={() =>
                                void updateDept(dept.id, (current) => ({
                                  ...current,
                                  escalationPhrases: (current.escalationPhrases ?? []).filter(
                                    (entry) => entry !== phrase
                                  ),
                                }))
                              }
                              aria-label={`Remove phrase ${phrase}`}
                              className="p-0 w-auto h-auto hover:text-destructive data-[inactive]:opacity-50"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={phraseDrafts[key] ?? ''}
                          placeholder='e.g. "speak to a human", "urgent"'
                          disabled={isSaving}
                          onChange={(ev) =>
                            setPhraseDrafts((prev) => ({ ...prev, [key]: ev.target.value }))
                          }
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') {
                              ev.preventDefault();
                              const draft = (phraseDrafts[key] ?? '').trim();
                              if (!draft) return;
                              if (phrases.includes(draft)) {
                                setPhraseDrafts((prev) => ({ ...prev, [key]: '' }));
                                return;
                              }
                              if (phrases.length >= MAX_ESCALATION_PHRASES) {
                                setError(
                                  `Maximum ${MAX_ESCALATION_PHRASES} escalation phrases per team.`
                                );
                                return;
                              }
                              void updateDept(dept.id, (current) => ({
                                ...current,
                                escalationPhrases: [...(current.escalationPhrases ?? []), draft],
                              }));
                              setPhraseDrafts((prev) => ({ ...prev, [key]: '' }));
                            }
                          }}
                          className="flex-1 px-2 py-1 text-xs rounded border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={isSaving || !(phraseDrafts[key] ?? '').trim()}
                          onClick={() => {
                            const draft = (phraseDrafts[key] ?? '').trim();
                            if (!draft) return;
                            if (phrases.includes(draft)) {
                              setPhraseDrafts((prev) => ({ ...prev, [key]: '' }));
                              return;
                            }
                            if (phrases.length >= MAX_ESCALATION_PHRASES) {
                              setError(
                                `Maximum ${MAX_ESCALATION_PHRASES} escalation phrases per team.`
                              );
                              return;
                            }
                            void updateDept(dept.id, (current) => ({
                              ...current,
                              escalationPhrases: [...(current.escalationPhrases ?? []), draft],
                            }));
                            setPhraseDrafts((prev) => ({ ...prev, [key]: '' }));
                          }}
                          className="gap-1 items-center px-2 py-1 h-auto text-xs"
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </Button>
                      </div>
                    </div>

                    {/* The team's own topics: added to the built-in and the workspace's ones */}
                    {topicsSupported && (
                      <div className="pt-3 space-y-2 border-t">
                        <p className="text-xs font-medium">
                          Extra restricted topics for this team{' '}
                          {teamTopics.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              ({teamTopics.length})
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {teamAlsoApplies(builtInTopics.length, orgTopics.length)}
                        </p>
                        {canChangeTopics ? (
                          <RestrictedTopicsField
                            label={`${dept.name} restricted topics`}
                            topics={teamTopics}
                            alsoApplies={orgTopics}
                            emptyText="No extra topics"
                            placeholder='e.g. "contract changes"'
                            disabled={isSaving}
                            builtIn={builtInTopics.map((topic) => topic.label)}
                            onAdd={(topic) => changeTopics(dept.id, { add: topic })}
                            onRemove={(topic) => changeTopics(dept.id, { remove: topic })}
                          />
                        ) : (
                          <TopicsReadOnly
                            label={`${dept.name} restricted topics`}
                            topics={teamTopics}
                            emptyText="No extra topics"
                          />
                        )}
                      </div>
                    )}

                    {hasOverride && (
                      <div className="pt-3 border-t">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isSaving}
                          onClick={() => resetDept(dept.id)}
                          className="p-0 h-auto text-xs text-muted-foreground hover:text-foreground hover:underline hover:bg-transparent"
                        >
                          Reset all overrides for {dept.name}
                        </Button>
                        {teamTopics.length > 0 && (
                          <p className="text-[10px] text-muted-foreground">{RESET_KEEPS_TOPICS}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {rulesSection}
    </div>
  );
};
