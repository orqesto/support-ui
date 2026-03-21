import { useState } from 'react';
import { BrainCog } from 'lucide-react';
import { LeadQualificationSettings } from './LeadQualificationSettings';
import { PromptsSettings } from './PromptsSettings';

type AISection = 'prompts' | 'lead-qualification';

const sections = [
  { id: 'prompts' as AISection, label: 'AI Prompts', description: 'Customize AI prompt templates' },
  { id: 'lead-qualification' as AISection, label: 'Lead Qualification', description: 'Configure AI lead qualification for any department' },
];

export const AIConfigSettings = () => {
  const [active, setActive] = useState<AISection>('prompts');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex gap-2 items-center text-xl font-semibold">
          <BrainCog className="w-5 h-5" />
          AI Configuration
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure AI behavior, prompt templates, and lead qualification
        </p>
      </div>

      <div className="flex gap-2 p-1 rounded-lg border bg-muted/50">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-md transition-all ${
              active === s.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
            title={s.description}
          >
            {s.label}
          </button>
        ))}
      </div>

      {active === 'prompts' && <PromptsSettings />}
      {active === 'lead-qualification' && <LeadQualificationSettings />}
    </div>
  );
};
