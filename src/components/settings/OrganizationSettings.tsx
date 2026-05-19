import { useState } from 'react';
import { Layers } from 'lucide-react';
import { CategoriesSettings } from './CategoriesSettings';
import { LabelsSettings } from './LabelsSettings';
import { RoutingKeysSettings } from './RoutingKeysSettings';
import { SLAConfigSettings } from './SLAConfigSettings';

type OrgSection = 'categories' | 'labels' | 'routing-skills' | 'sla-config';

const sections = [
  { id: 'categories' as OrgSection, label: 'Categories', description: 'Ticket categories and keywords' },
  { id: 'labels' as OrgSection, label: 'Labels', description: 'Custom ticket labels' },
  { id: 'routing-skills' as OrgSection, label: 'Routing Skills', description: 'Skill keys for auto-assignment' },
  { id: 'sla-config' as OrgSection, label: 'SLA Thresholds', description: 'Response and resolution time targets' },
];

export const OrganizationSettings = () => {
  const [active, setActive] = useState<OrgSection>('categories');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex gap-2 items-center text-xl font-semibold">
          <Layers className="w-5 h-5" />
          Organization
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage ticket categories and custom labels
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

      {active === 'categories' && <CategoriesSettings />}
      {active === 'labels' && <LabelsSettings />}
      {active === 'routing-skills' && <RoutingKeysSettings />}
      {active === 'sla-config' && <SLAConfigSettings />}
    </div>
  );
};
