import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
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

  const requested = section && isRuleType(section) ? section : 'spam';
  const initial: RuleType = isHidden(requested) ? 'spam' : requested;
  const [activeRuleType, setActiveRuleType] = useState<RuleType>(initial);

  useEffect(() => {
    if (!section || !isRuleType(section)) return;
    setActiveRuleType(isHidden(section) ? 'spam' : section);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isHidden reads only these two flags
  }, [section, canManageRouting, canSeeTemplates]);

  const goToRuleType = (next: RuleType) => {
    setActiveRuleType(next);
    navigate(`#rules/${next}`, { replace: true });
  };

  const ruleTypes = [
    {
      id: 'spam' as RuleType,
      label: 'Spam Rules',
      description: 'Filter spam and unwanted messages',
    },
    {
      id: 'detection' as RuleType,
      label: 'Detection Rules',
      description: 'Identify legitimate messages',
    },
    {
      id: 'knowledge' as RuleType,
      label: 'KB Detection',
      description: 'Extract valuable knowledge for KB',
    },
    {
      id: 'routing' as RuleType,
      label: 'Routing Rules',
      description: 'Route messages to departments by subject, sender, or header',
    },
    {
      id: 'priority' as RuleType,
      label: 'Priority Rules',
      description: 'Decide which messages are critical, high, medium, or low',
    },
    {
      id: 'templates' as RuleType,
      label: 'Reply templates',
      description: 'Saved replies for a thread’s or a ticket’s reply box',
    },
  ];

  // Hide the routing sub-tab from users who can't manage it (BE returns 403 on save).
  const visibleRuleTypes = ruleTypes.filter((type) => !isHidden(type.id));

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
            Configure spam filtering, message detection, knowledge extraction, department
            routing, and message priority
          </p>
        </div>
      </div>

      {/* Rule Type Switcher */}
      <Tabs<RuleType>
        tabs={visibleRuleTypes.map((type) => ({ id: type.id, label: type.label, description: type.description }))}
        activeTab={activeRuleType}
        onTabChange={goToRuleType}
        variant="simple"
        showIcons={false}
      >
        {activeRuleType === 'spam' && <SpamRulesSettings />}
        {activeRuleType === 'detection' && <DetectionRulesSettings />}
        {activeRuleType === 'knowledge' && <KnowledgeDetectionRulesSettings />}
        {activeRuleType === 'routing' && canManageRouting && <RoutingRulesSettings />}
        {activeRuleType === 'priority' && canManageRouting && <PriorityRulesSettings />}
        {activeRuleType === 'templates' && canSeeTemplates && <ReplyTemplatesSettings />}
      </Tabs>
    </div>
  );
};
