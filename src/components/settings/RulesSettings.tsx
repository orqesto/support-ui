import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { DetectionRulesSettings } from './DetectionRulesSettings';
import { KnowledgeDetectionRulesSettings } from './KnowledgeDetectionRulesSettings';
import { RoutingRulesSettings } from './RoutingRulesSettings';
import { SpamRulesSettings } from './SpamRulesSettings';

type RuleType = 'spam' | 'detection' | 'knowledge' | 'routing';

const KNOWN_RULE_TYPES: RuleType[] = ['spam', 'detection', 'knowledge', 'routing'];
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

  const requested = section && isRuleType(section) ? section : 'spam';
  const initial: RuleType = requested === 'routing' && !canManageRouting ? 'spam' : requested;
  const [activeRuleType, setActiveRuleType] = useState<RuleType>(initial);

  useEffect(() => {
    if (!section || !isRuleType(section)) return;
    setActiveRuleType(section === 'routing' && !canManageRouting ? 'spam' : section);
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
  ];

  // Hide the routing sub-tab from users who can't manage it (BE returns 403 on save).
  const visibleRuleTypes = canManageRouting
    ? ruleTypes
    : ruleTypes.filter((type) => type.id !== 'routing');

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
            Configure spam filtering, message detection, and knowledge extraction rules
          </p>
        </div>
      </div>

      {/* Rule Type Switcher - Pill Buttons */}
      <div className="flex gap-2 p-1 rounded-lg border bg-muted/50">
        {visibleRuleTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => goToRuleType(type.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-md transition-all ${
              activeRuleType === type.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
            title={type.description}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Rule Content */}
      <div>
        {activeRuleType === 'spam' && <SpamRulesSettings />}
        {activeRuleType === 'detection' && <DetectionRulesSettings />}
        {activeRuleType === 'knowledge' && <KnowledgeDetectionRulesSettings />}
        {activeRuleType === 'routing' && canManageRouting && <RoutingRulesSettings />}
      </div>
    </div>
  );
};
