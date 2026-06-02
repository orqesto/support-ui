/**
 * Sub-sections of the expanded org detail row in AdminUsageTab.
 * Extracted to keep AdminUsageTab.tsx under the max-lines limit.
 */

import { RefreshCw, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import {
  UsageProgressBar,
  formatCurrency,
  type CatalogModule,
  type OrgModule,
  type UsageItem,
} from './AdminUsageTab.helpers';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

type OrgModulesSectionProps = {
  orgId: number;
  modulesLoading: boolean;
  allModules: CatalogModule[];
  orgModules: OrgModule[];
  togglingModule: { orgId: number; moduleId: number } | null;
  onEnableModule: (orgId: number, moduleId: number) => void;
  onDisableModule: (orgId: number, moduleId: number) => void;
};

export const OrgModulesSection = ({
  orgId,
  modulesLoading,
  allModules,
  orgModules,
  togglingModule,
  onEnableModule,
  onDisableModule,
}: OrgModulesSectionProps) => {
  const activeModules = allModules.filter((mod) => mod.isActive);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground">AI Modules</h4>

      {modulesLoading ? (
        <div className="text-sm text-muted-foreground">Loading modules...</div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 font-medium text-left text-muted-foreground">Module</th>
                <th className="px-3 py-2 font-medium text-left text-muted-foreground">Status</th>
                <th className="px-3 py-2 font-medium text-left text-muted-foreground hidden sm:table-cell">
                  Usage
                </th>
                <th className="px-3 py-2 font-medium text-right text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {activeModules.map((catalogMod) => {
                const orgMod = orgModules.find((mod) => mod.moduleId === catalogMod.id);
                const enabled = orgMod?.isActive ?? false;
                const isToggling =
                  togglingModule?.orgId === orgId && togglingModule?.moduleId === catalogMod.id;

                return (
                  <tr key={catalogMod.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <div className="font-medium">{catalogMod.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(catalogMod.monthlyFee, 'EUR')}/mo
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {enabled ? (
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 sm:table-cell text-muted-foreground">
                      {orgMod?.currentPeriodUsage !== null &&
                      orgMod?.currentPeriodUsage !== undefined
                        ? `${orgMod.currentPeriodUsage} ${catalogMod.unitName}s`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant={enabled ? 'outline' : 'primary'}
                        disabled={isToggling}
                        onClick={() =>
                          enabled
                            ? onDisableModule(orgId, catalogMod.id)
                            : onEnableModule(orgId, catalogMod.id)
                        }
                      >
                        {isToggling ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : enabled ? (
                          <>
                            <ToggleLeft className="mr-1.5 w-3.5 h-3.5" /> Disable
                          </>
                        ) : (
                          <>
                            <ToggleRight className="mr-1.5 w-3.5 h-3.5" /> Enable
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {activeModules.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-center text-sm text-muted-foreground"
                  >
                    No AI modules configured in the catalog
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

type OrgAiUsageSectionProps = {
  aiCalls: UsageItem;
};

export const OrgAiUsageSection = ({ aiCalls }: OrgAiUsageSectionProps) => (
  <div className="space-y-2">
    <h4 className="text-sm font-semibold text-muted-foreground">AI Usage This Month</h4>
    <div className="p-4 rounded-lg border bg-card border-border">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-sm font-medium">AI API Calls</div>
          <div className="text-xs text-muted-foreground">All AI features combined</div>
        </div>
        <Zap className="w-4 h-4 text-amber-500" />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Usage:</span>
          <span className="font-medium">
            {aiCalls.current.toLocaleString()} / {aiCalls.limit.toLocaleString()} calls
          </span>
        </div>
        <UsageProgressBar percentage={aiCalls.percentage} />
        {aiCalls.critical && (
          <div className="p-2 text-xs bg-red-50 rounded border border-red-200">
            <span className="font-medium text-red-700">
              AI call limit reached! Some AI features may be unavailable.
            </span>
          </div>
        )}
        {aiCalls.warning && !aiCalls.critical && (
          <div className="p-2 text-xs bg-orange-50 rounded border border-orange-200">
            <span className="font-medium text-orange-700">
              Approaching AI call limit ({aiCalls.percentage}% used)
            </span>
          </div>
        )}
      </div>
    </div>
  </div>
);
