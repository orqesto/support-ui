import { useState } from 'react';
import { Shield } from 'lucide-react';
import { DetectionRulesSettings } from './DetectionRulesSettings';
import { KnowledgeDetectionRulesSettings } from './KnowledgeDetectionRulesSettings';
import { SpamRulesSettings } from './SpamRulesSettings';

type RuleType = 'spam' | 'detection' | 'knowledge';

export const RulesSettings = () => {
  const [activeRuleType, setActiveRuleType] = useState<RuleType>('spam');

  const ruleTypes = [
    {
      id: 'spam' as RuleType,
      label: 'Spam Rules',
      description: 'Filter spam and unwanted messages',
    },
    {
      id: 'detection' as RuleType,
      label: 'Detection Rules',
      description: 'Identify legitimate support messages',
    },
    {
      id: 'knowledge' as RuleType,
      label: 'KB Detection',
      description: 'Extract valuable knowledge for KB',
    },
  ];

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
        {ruleTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => setActiveRuleType(type.id)}
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
      </div>
    </div>
  );
};
