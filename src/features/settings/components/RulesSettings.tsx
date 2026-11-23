import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { AdvancedToggle } from '@/features/settings/components/AdvancedToggle';
import { firstVisibleId, useShowAdvanced, visibleSections } from '@/features/settings/advanced';
import { useNavigate } from 'react-router-dom';
import { Tabs } from '@/components/ui/Tabs';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';
import { DetectionRulesSettings } from './DetectionRulesSettings';
import { KnowledgeDetectionRulesSettings } from './KnowledgeDetectionRulesSettings';
import { PriorityRulesSettings } from './PriorityRulesSettings';
import { ReplyTemplatesSettings } from './ReplyTemplatesSettings';
import { RoutingRulesSettings } from './RoutingRulesSettings';
import { SpamRulesSettings } from './SpamRulesSettings';

type RuleType = 'spam' | 'detection' | 'knowledge' | 'routing' | 'priority' | 'templates';

const KNOWN_RULE_TYPES: RuleType[] = [
  'spam',
  'detection',
  'knowledge',
  'routing',
  'priority',
  'templates',
];
const isRuleType = (value: string): value is RuleType =>
  (KNOWN_RULE_TYPES as string[]).includes(value);

type RulesSettingsProps = {
  /** Sub-section id from the parent hash. Drives deep-link
   *  (e.g. `/settings#rules/routing`). */
  section?: string;
};

export const RulesSettings = ({ section }: RulesSettingsProps = {}) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  // Routing and priority rules are gated to MANAGE_ROUTING_RULES on the BE (every
  // /api/routing-rules and /api/priority-rules route) — workspace admins AND moderators since
  // 2026-09-17 (it was MANAGE_ORGANIZATION, which hid both tabs from moderators). A role
  // without it still gets the tabs hidden rather than a dead-end UI.
  const canManageRouting = hasPermission(Permission.MANAGE_ROUTING_RULES);

  // Reply templates (2026-10-09): every agent who can read messages uses them, so every one sees
  // the list; who may change them is per template (`canEdit`) and MANAGE_REPLY_TEMPLATES.
  const canSeeTemplates = hasPermission(Permission.VIEW_MESSAGES);

  // Both families share the gate, so they hide and fall back together.
  const isManageOnly = (type: RuleType) => type === 'routing' || type === 'priority';
  const isHidden = (type: RuleType) =>
    (isManageOnly(type) && !canManageRouting) || (type === 'templates' && !canSeeTemplates);

  // Declared before the section logic that reads them (settings simplification, 2026-11-23).
  // Spam, Detection, KB Detection and Routing are engine rules: behind "Show advanced settings".
  const ruleTypes: Array<{ id: RuleType; label: string; description: string; advanced?: boolean }> = [
    { id: 'spam', label: 'Spam Rules', description: 'Filter spam and unwanted messages', advanced: true },
    { id: 'detection', label: 'Detection Rules', description: 'Identify legitimate messages', advanced: true },
    { id: 'knowledge', label: 'KB Detection', description: 'Extract valuable knowledge for KB', advanced: true },
    {
      id: 'routing',
      label: 'Routing Rules',
      description: 'Route threads to teams by subject, sender, or header',
      advanced: true,
    },
    { id: 'priority', label: 'Priority Rules', description: 'Decide which threads are critical, high, medium, or low' },
    { id: 'templates', label: 'Reply templates', description: 'Saved replies for a thread’s or a ticket’s reply box' },
  ];

  // Hide what the role cannot use (BE returns 403 on save), then what Advanced hides. A section a
  // link asks for (the raw `section` prop — never a default) stays visible.
  const visibleRuleTypes = ruleTypes.filter((type) => !isHidden(type.id));
  const [showAdvanced] = useShowAdvanced();
  const linked = section && isRuleType(section) ? section : undefined;
  const shown = visibleSections(visibleRuleTypes, showAdvanced, linked);
  const fallback = firstVisibleId(shown, 'spam');

  const [activeRuleType, setActiveRuleType] = useState<RuleType>(
    ((linked && shown.some((type) => type.id === linked) ? linked : fallback) ?? 'spam') as RuleType
  );

  useEffect(() => {
    if (!linked) return;
    const next = shown.some((type) => type.id === linked) ? linked : fallback;
    if (next) setActiveRuleType(next as RuleType);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shown derives from these flags
  }, [section, canManageRouting, canSeeTemplates]);

  // Clamp at render: the open section is always one that is shown.
  const active: RuleType | null = shown.some((type) => type.id === activeRuleType)
    ? activeRuleType
    : (fallback as RuleType | null);

  const goToRuleType = (next: RuleType) => {
    setActiveRuleType(next);
    navigate(`#rules/${next}`, { replace: true });
  };

  // Switching Advanced off from the toggle (never from an effect): leave a section that is now hidden.
  const onTurnOff = () => {
    const target = firstVisibleId(visibleSections(visibleRuleTypes, false), 'spam');
    if (target) {
      setActiveRuleType(target as RuleType);
      void navigate(`#rules/${target}`, { replace: true });
    } else {
      void navigate('#rules', { replace: true });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Rule Type Switcher */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
        <div>
          <h2 className="font-display flex gap-2 items-center text-xl font-semibold">
            <Shield className="w-5 h-5" />
            Rules Management
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure spam filtering, message detection, knowledge extraction, team
            routing, and thread priority
          </p>
        </div>
        <AdvancedToggle onTurnOff={onTurnOff} />
      </div>

      {shown.length === 0 || active === null ? (
        <p className="text-sm text-muted-foreground">
          Nothing to show here. Show advanced settings to see more.
        </p>
      ) : (
      <Tabs<RuleType>
        tabs={shown.map((type) => ({ id: type.id, label: type.label, description: type.description }))}
        activeTab={active}
        onTabChange={goToRuleType}
        variant="simple"
        showIcons={false}
      >
        {active === 'spam' && <SpamRulesSettings />}
        {active === 'detection' && <DetectionRulesSettings />}
        {active === 'knowledge' && <KnowledgeDetectionRulesSettings />}
        {active === 'routing' && canManageRouting && <RoutingRulesSettings />}
        {active === 'priority' && canManageRouting && <PriorityRulesSettings />}
        {active === 'templates' && canSeeTemplates && <ReplyTemplatesSettings />}
      </Tabs>
      )}
    </div>
  );
};
