import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tabs } from '@/components/ui/Tabs';
import { usePermissions } from '@/hooks/usePermissions';
import { DetectionRulesSettings } from './DetectionRulesSettings';
import { KnowledgeDetectionRulesSettings } from './KnowledgeDetectionRulesSettings';
import { PriorityRulesSettings } from './PriorityRulesSettings';
import { RoutingRulesSettings } from './RoutingRulesSettings';
import { SpamRulesSettings } from './SpamRulesSettings';

type RuleType = 'spam' | 'detection' | 'knowledge' | 'routing' | 'priority';

const KNOWN_RULE_TYPES: RuleType[] = ['spam', 'detection', 'knowledge', 'routing', 'priority'];
const isRuleType = (value: string): value is RuleType =>
  (KNOWN_RULE_TYPES as string[]).includes(value);

type RulesSettingsProps = {
  /** Sub-section id from the parent hash. Drives deep-link
   *  (e.g. `/settings#rules/routing`). */
  section?: string;
};

export const RulesSettings = ({ section }: RulesSettingsProps = {}) => {
  const navigate = useNavigate();
  const { canManageOrganization } = usePermissions();

  // Routing rules are gated to MANAGE_ORGANIZATION on the BE (every /api/routing-rules
  // route). Moderators reach this page via VIEW_ORGANIZATION_SETTINGS but can't save
  // routing changes, so hide the sub-tab for them instead of showing a dead-end UI.
  const canManageRouting = canManageOrganization;

  // Priority rules are gated to MANAGE_ORGANIZATION on the BE exactly like routing,
  // so they hide and fall back together.
  const isManageOnly = (type: RuleType) => type === 'routing' || type === 'priority';

  const requested = section && isRuleType(section) ? section : 'spam';
  const initial: RuleType = isManageOnly(requested) && !canManageRouting ? 'spam' : requested;
  const [activeRuleType, setActiveRuleType] = useState<RuleType>(initial);

  useEffect(() => {
    if (!section || !isRuleType(section)) return;
    setActiveRuleType(isManageOnly(section) && !canManageRouting ? 'spam' : section);
  }, [section, canManageRouting]);

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
  ];

  // Hide the routing sub-tab from users who can't manage it (BE returns 403 on save).
  const visibleRuleTypes = canManageRouting
    ? ruleTypes
    : ruleTypes.filter((type) => !isManageOnly(type.id));

  return (
    <div className="space-y-6">
      {/* Header with Rule Type Switcher */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
        <div>
          <h2 className="flex gap-2 items-center text-xl font-semibold">
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
      </Tabs>
    </div>
  );
};
