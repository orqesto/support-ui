import { useEffect, useMemo, useState } from 'react';
import { BrainCog, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AutoReplyConfiguration } from './AutoReplyConfiguration';
import { LeadQualificationSettings } from './LeadQualificationSettings';
import { LearningNotificationsInbox } from './LearningNotificationsInbox';
import { LearningSuggestionsSettings } from './LearningSuggestionsSettings';
import { LearningTrustSettings } from './LearningTrustSettings';
import { PromptsSettings } from './PromptsSettings';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { apiClient } from '@/lib/api-client';

type AISection =
  | 'prompts'
  | 'auto-reply'
  | 'lead-qualification'
  | 'learning'
  | 'learning-trust';

type SectionDef = { id: AISection; label: string; description: string; adminOnly?: boolean };

const ALL_SECTIONS: SectionDef[] = [
  { id: 'prompts', label: 'AI Prompts', description: 'Customize AI prompt templates' },
  { id: 'auto-reply', label: 'Auto-Reply', description: 'When the AI replies on its own — org default + per-department overrides' },
  { id: 'lead-qualification', label: 'Lead Qualification', description: 'Configure AI lead qualification for any department' },
  // Operational engine view: pending suggestions (need my action) stacked over
  // recent auto-actions (already fired, may want to undo). Trust stays its own
  // section because it's set-and-forget configuration, not daily activity.
  { id: 'learning', label: 'Engine Activity', description: 'Review pending suggestions + recent auto-actions', adminOnly: true },
  { id: 'learning-trust', label: 'Learning Trust', description: 'Control how aggressively the engine auto-acts', adminOnly: true },
];

export const AIConfigSettings = () => {
  const { isOrgAdmin } = usePermissions();
  const sections = useMemo(
    () => ALL_SECTIONS.filter((sect) => !sect.adminOnly || isOrgAdmin),
    [isOrgAdmin]
  );
  const [active, setActive] = useState<AISection>('prompts');
  const [hasLeadQualification, setHasLeadQualification] = useState<boolean | null>(null);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });
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
        {sections.map((sect) => (
          <button
            key={sect.id}
            onClick={() => setActive(sect.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-md transition-all ${
              active === sect.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
            title={sect.description}
          >
            {sect.label}
          </button>
        ))}
      </div>

      {active === 'prompts' && <PromptsSettings />}
      {active === 'auto-reply' && <AutoReplyConfiguration onShowAlert={setAlertDialog} />}
      {active === 'learning' && (
        <div className="space-y-6">
          <LearningSuggestionsSettings />
          <LearningNotificationsInbox />
        </div>
      )}
      {active === 'learning-trust' && <LearningTrustSettings />}
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

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </div>
  );
};
