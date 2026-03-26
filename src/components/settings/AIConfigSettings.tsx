import { useEffect, useState } from 'react';
import { BrainCog, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LeadQualificationSettings } from './LeadQualificationSettings';
import { PromptsSettings } from './PromptsSettings';
import { apiClient } from '@/lib/api-client';

type AISection = 'prompts' | 'lead-qualification';

const sections = [
  { id: 'prompts' as AISection, label: 'AI Prompts', description: 'Customize AI prompt templates' },
  { id: 'lead-qualification' as AISection, label: 'Lead Qualification', description: 'Configure AI lead qualification for any department' },
];

export const AIConfigSettings = () => {
  const [active, setActive] = useState<AISection>('prompts');
  const [hasLeadQualification, setHasLeadQualification] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiClient
      .get<{ success: boolean; data: { plan: { features: Record<string, boolean> } } }>(
        '/api/subscriptions/current'
      )
      .then((res) => setHasLeadQualification(res.data.data.plan.features.leadQualification === true))
      .catch(() => setHasLeadQualification(false));
  }, []);

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
      {active === 'lead-qualification' && (
        hasLeadQualification === false ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <Lock className="w-10 h-10 text-muted-foreground" />
            <div>
              <p className="font-semibold">Lead Qualification not included in your plan</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upgrade to Enterprise or Admin plan to access AI Lead Qualification.
              </p>
            </div>
            <button
              onClick={() => navigate('/pricing')}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              View Plans
            </button>
          </div>
        ) : hasLeadQualification === true ? (
          <LeadQualificationSettings />
        ) : null
      )}
    </div>
  );
};
