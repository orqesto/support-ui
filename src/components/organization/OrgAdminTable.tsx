import { Edit2, Save, X, Trash2, Settings2, Unlink, Network } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { SearchInput } from '@/components/ui/SearchInput';
import { Toggle } from '@/components/ui/Toggle';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatDate } from '@/lib/utils';

interface OrgItem {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  active: boolean;
  createdAt: string;
  tenantDb?: { deploymentType: string } | null;
  /** The alliance this workspace belongs to, or null/absent when standalone. Drives the
   *  per-row "Detach from alliance" action (only shown when set + onDetachAlliance provided). */
  allianceId?: number | null;
}

interface EditForm { name: string; description: string; active: boolean; }

interface Props {
  allOrganizations: OrgItem[];
  searchOrg: string;
  pendingSearch: string;
  editingOrgId: number | null;
  editOrgForm: EditForm;
  onPendingSearchChange: (v: string) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onEditOrgFormChange: (form: EditForm) => void;
  onStartEdit: (org: OrgItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (orgId: number) => void;
  onDelete: (orgId: number, orgName: string) => void;
  /** Optional: enter per-workspace management (sets org context + opens the real pages).
   *  When omitted (e.g. a context where it doesn't apply) no Manage button renders. */
  onManage?: (org: OrgItem) => void;
  /** Optional: detach a workspace from its alliance (global-admin, Platform console). The
   *  action renders only on rows whose `allianceId` is set. When omitted, no such action shows. */
  onDetachAlliance?: (org: OrgItem) => void;
  /** Optional alliance id → name, so each in-an-alliance workspace shows WHICH alliance it
   *  belongs to (matters once there is more than one). Falls back to "Alliance #id". */
  allianceNameById?: Map<number, string>;
  /** Total across ALL pages (this list is server-paginated). When omitted, the header falls
   *  back to the current page's length — which undercounts once there's more than one page. */
  total?: number;
}

function deploymentBadgeClass(type: string) {
  if (type === 'shared') return 'bg-muted text-muted-foreground';
  if (type === 'dedicated') return 'bg-blue-500/10 text-blue-600';
  return 'bg-purple-500/10 text-purple-600';
}

function EditRowForm({ form, onChange, onSave, onCancel, isMobile }: {
  form: EditForm;
  onChange: (f: EditForm) => void;
  onSave: () => void; onCancel: () => void; isMobile: boolean;
}) {
  return (
    <div className="space-y-3">
      <Input
        label="Name"
        type="text"
        value={form.name}
        onChange={(event) => onChange({ ...form, name: event.target.value })}
      />
      <Input
        label="Description"
        type="text"
        value={form.description}
        onChange={(event) => onChange({ ...form, description: event.target.value })}
      />
      <Toggle
        checked={form.active}
        onChange={(next) => onChange({ ...form, active: next })}
        label="Active"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} className={isMobile ? 'flex-1' : ''}><Save className="mr-2 w-4 h-4" />Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel} className={isMobile ? 'flex-1' : ''}><X className="mr-2 w-4 h-4" />Cancel</Button>
      </div>
    </div>
  );
}

export function OrgAdminTable({ allOrganizations, searchOrg, pendingSearch, editingOrgId, editOrgForm, onPendingSearchChange, onSearch, onSearchBlur, onEditOrgFormChange, onStartEdit, onCancelEdit, onSaveEdit, onDelete, onManage, onDetachAlliance, allianceNameById, total }: Props) {
  const allianceLabel = (org: OrgItem) =>
    typeof org.allianceId === 'number'
      ? (allianceNameById?.get(org.allianceId) ?? `Alliance #${org.allianceId}`)
      : null;
  const workspaceCount = total ?? allOrganizations.length;
  return (
    <Card className="flex overflow-hidden flex-col flex-1 min-h-0">
      <CardHeader className="flex-shrink-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <CardTitle>All Workspaces</CardTitle>
            <CardDescription>{workspaceCount} workspace{workspaceCount !== 1 ? 's' : ''} in the system</CardDescription>
          </div>
          <SearchInput key="org-search" value={pendingSearch} onChange={onPendingSearchChange} onSearch={onSearch} onBlur={onSearchBlur} showSearchButton={true} placeholder="Search by ID, name, slug, description..." className="w-full sm:w-auto sm:min-w-[300px]" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 p-0 min-h-0">
        {allOrganizations.length === 0 ? (
          <div className="flex flex-1 justify-center items-center p-8 min-h-0 text-center"><p className="text-sm text-muted-foreground">{searchOrg ? 'No workspaces found matching your search' : 'No workspaces available'}</p></div>
        ) : (
          <>
            {/* Mobile/Tablet */}
            <div className="overflow-auto flex-1 min-h-0 xl:hidden divide-y divide-gray-200">
              {allOrganizations.map((org) => editingOrgId === org.id ? (
                <div key={org.id} className="p-3 bg-blue-500/10 dark:bg-blue-500/10">
                  <EditRowForm form={editOrgForm} onChange={onEditOrgFormChange} onSave={() => onSaveEdit(org.id)} onCancel={onCancelEdit} isMobile={true} />
                </div>
              ) : (
                <div key={org.id} className="p-3 transition-colors hover:bg-accent">
                  <div className="space-y-3">
                    <div className="flex gap-2 justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold">{org.name}</h3>
                        {org.description && <p className="mt-1 text-sm text-muted-foreground">{org.description}</p>}
                        {allianceLabel(org) && <div className="mt-1"><Badge variant="secondary"><Network className="mr-1 w-3 h-3" />{allianceLabel(org)}</Badge></div>}
                      </div>
                      <div className="flex flex-shrink-0 gap-1">
                        {onManage && <Button size="sm" onClick={() => onManage(org)}><Settings2 className="mr-1 w-4 h-4" />Manage</Button>}
                        {onDetachAlliance && typeof org.allianceId === 'number' && <Tooltip content="Detach from alliance"><Button variant="outline" size="sm" onClick={() => onDetachAlliance(org)} aria-label={`Detach ${org.name} from alliance`}><Unlink className="w-4 h-4" /></Button></Tooltip>}
                        <Tooltip content={`Edit ${org.name}`}><Button variant="outline" size="sm" onClick={() => onStartEdit(org)} aria-label={`Edit ${org.name}`}><Edit2 className="w-4 h-4" /></Button></Tooltip>
                        <Tooltip content={`Delete ${org.name}`}><Button variant="outline" size="sm" onClick={() => onDelete(org.id, org.name)} aria-label={`Delete ${org.name}`} className="text-red-600 hover:text-red-700 hover:border-red-300"><Trash2 className="w-4 h-4" /></Button></Tooltip>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                      <Badge variant={org.active ? 'default' : 'secondary'}>{org.active ? 'Active' : 'Inactive'}</Badge>
                      {org.tenantDb && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${deploymentBadgeClass(org.tenantDb.deploymentType)}`}>{org.tenantDb.deploymentType}</span>}
                      <code className="px-2 py-1 rounded text-muted-foreground bg-muted">{org.slug}</code>
                      <span className="text-muted-foreground">{formatDate(org.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop Table */}
            <div className="hidden flex-col flex-1 min-h-0 xl:flex">
              <div className="overflow-auto flex-1 min-h-0">
                <table className="min-w-full">
                  <thead className="sticky top-0 z-10 border-b bg-muted">
                    <tr>
                      {['Name','Slug','Status','Created','Actions'].map((header) => (
                        <th key={header} className="px-6 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-card divide-border">
                    {allOrganizations.map((org) => editingOrgId === org.id ? (
                      <tr key={org.id} className="bg-blue-500/10 dark:bg-blue-500/10">
                        <td colSpan={5} className="px-6 py-2.5">
                          <EditRowForm form={editOrgForm} onChange={onEditOrgFormChange} onSave={() => onSaveEdit(org.id)} onCancel={onCancelEdit} isMobile={false} />
                        </td>
                      </tr>
                    ) : (
                      <tr key={org.id} className="transition-colors hover:bg-accent">
                        <td className="px-6 py-2.5 whitespace-nowrap">
                          <div className="text-sm font-medium">{org.name}</div>
                          {org.description && <div className="overflow-hidden text-sm whitespace-pre-wrap break-words text-muted-foreground">{org.description}</div>}
                          {allianceLabel(org) && <div className="mt-1"><Badge variant="secondary"><Network className="mr-1 w-3 h-3" />{allianceLabel(org)}</Badge></div>}
                        </td>
                        <td className="px-6 py-2.5 whitespace-nowrap"><code className="text-sm text-muted-foreground">{org.slug}</code></td>
                        <td className="px-6 py-2.5 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <Badge variant={org.active ? 'default' : 'secondary'}>{org.active ? 'Active' : 'Inactive'}</Badge>
                            {org.tenantDb && <span className={`px-2 py-0.5 rounded-full text-xs font-medium w-fit ${deploymentBadgeClass(org.tenantDb.deploymentType)}`}>{org.tenantDb.deploymentType}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-2.5 text-sm whitespace-nowrap text-muted-foreground">{formatDate(org.createdAt)}</td>
                        <td className="px-6 py-2.5 text-sm font-medium text-right whitespace-nowrap">
                          <div className="flex gap-2 justify-end">
                            {onManage && <Button size="sm" onClick={() => onManage(org)}><Settings2 className="mr-1 w-4 h-4" />Manage</Button>}
                        {onDetachAlliance && typeof org.allianceId === 'number' && <Tooltip content="Detach from alliance"><Button variant="outline" size="sm" onClick={() => onDetachAlliance(org)} aria-label={`Detach ${org.name} from alliance`}><Unlink className="w-4 h-4" /></Button></Tooltip>}
                            <Tooltip content={`Edit ${org.name}`}><Button variant="outline" size="sm" onClick={() => onStartEdit(org)} aria-label={`Edit ${org.name}`}><Edit2 className="w-4 h-4" /></Button></Tooltip>
                            <Tooltip content={`Delete ${org.name}`}><Button variant="outline" size="sm" onClick={() => onDelete(org.id, org.name)} aria-label={`Delete ${org.name}`} className="text-red-600 hover:text-red-700 hover:border-red-300"><Trash2 className="w-4 h-4" /></Button></Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
