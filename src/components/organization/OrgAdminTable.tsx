import { Edit2, Save, X, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { formatDate } from '@/lib/utils';

interface OrgItem {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  active: boolean;
  createdAt: string;
  tenantDb?: { deploymentType: string } | null;
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
}

function deploymentBadgeClass(type: string) {
  if (type === 'shared') return 'bg-muted text-muted-foreground';
  if (type === 'dedicated') return 'bg-blue-500/10 text-blue-600';
  return 'bg-purple-500/10 text-purple-600';
}

function EditRowForm({ org, form, onChange, onSave, onCancel, isMobile }: {
  org: OrgItem; form: EditForm;
  onChange: (f: EditForm) => void;
  onSave: () => void; onCancel: () => void; isMobile: boolean;
}) {
  const inputCls = "px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary";
  return (
    <div className="space-y-3">
      <div><label htmlFor="name" className="block mb-1 text-sm font-medium">Name</label>
        <input type="text" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} className={inputCls} /></div>
      <div><label htmlFor="description" className="block mb-1 text-sm font-medium">Description</label>
        <input type="text" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} className={inputCls} /></div>
      <div className="flex gap-2 items-center">
        <input type="checkbox" id={`active-${isMobile ? 'mobile-' : ''}${org.id}`} checked={form.active} onChange={(e) => onChange({ ...form, active: e.target.checked })} className="rounded" />
        <label htmlFor={`active-${isMobile ? 'mobile-' : ''}${org.id}`} className="text-sm font-medium">Active</label>
      </div>
      <div className={`flex gap-2 ${isMobile ? '' : ''}`}>
        <Button size="sm" onClick={onSave} className={isMobile ? 'flex-1' : ''}><Save className="mr-2 w-4 h-4" />Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel} className={isMobile ? 'flex-1' : ''}><X className="mr-2 w-4 h-4" />Cancel</Button>
      </div>
    </div>
  );
}

export function OrgAdminTable({ allOrganizations, searchOrg, pendingSearch, editingOrgId, editOrgForm, onPendingSearchChange, onSearch, onSearchBlur, onEditOrgFormChange, onStartEdit, onCancelEdit, onSaveEdit, onDelete }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <CardTitle>All Organizations</CardTitle>
            <CardDescription>{allOrganizations.length} organization{allOrganizations.length !== 1 ? 's' : ''} in the system</CardDescription>
          </div>
          <SearchInput key="org-search" value={pendingSearch} onChange={onPendingSearchChange} onSearch={onSearch} onBlur={onSearchBlur} showSearchButton={true} placeholder="Search by ID, name, slug, description..." className="w-full sm:w-auto sm:min-w-[300px]" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {allOrganizations.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm text-muted-foreground">{searchOrg ? 'No organizations found matching your search' : 'No organizations available'}</p></div>
        ) : (
          <>
            {/* Mobile/Tablet */}
            <div className="xl:hidden divide-y divide-gray-200 overflow-auto max-h-[600px]">
              {allOrganizations.map((org) => editingOrgId === org.id ? (
                <div key={org.id} className="p-4 bg-blue-500/10 dark:bg-blue-500/10">
                  <EditRowForm org={org} form={editOrgForm} onChange={onEditOrgFormChange} onSave={() => onSaveEdit(org.id)} onCancel={onCancelEdit} isMobile={true} />
                </div>
              ) : (
                <div key={org.id} className="p-4 transition-colors hover:bg-accent">
                  <div className="space-y-3">
                    <div className="flex gap-2 justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold">{org.name}</h3>
                        {org.description && <p className="mt-1 text-sm text-muted-foreground">{org.description}</p>}
                      </div>
                      <div className="flex flex-shrink-0 gap-1">
                        <Button variant="outline" size="sm" onClick={() => onStartEdit(org)}><Edit2 className="w-4 h-4" /></Button>
                        <Button variant="outline" size="sm" onClick={() => onDelete(org.id, org.name)} className="text-red-600 hover:text-red-700 hover:border-red-300"><Trash2 className="w-4 h-4" /></Button>
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
            <div className="hidden xl:block">
              <div className="overflow-auto max-h-[600px]">
                <table className="min-w-full">
                  <thead className="sticky top-0 z-10 border-b bg-muted">
                    <tr>
                      {['Name','Slug','Status','Created','Actions'].map((h) => (
                        <th key={h} className="px-6 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-card divide-border">
                    {allOrganizations.map((org) => editingOrgId === org.id ? (
                      <tr key={org.id} className="bg-blue-500/10 dark:bg-blue-500/10">
                        <td colSpan={5} className="px-6 py-4">
                          <EditRowForm org={org} form={editOrgForm} onChange={onEditOrgFormChange} onSave={() => onSaveEdit(org.id)} onCancel={onCancelEdit} isMobile={false} />
                        </td>
                      </tr>
                    ) : (
                      <tr key={org.id} className="transition-colors hover:bg-accent">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium">{org.name}</div>
                          {org.description && <div className="overflow-hidden text-sm whitespace-pre-wrap break-words text-muted-foreground">{org.description}</div>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap"><code className="text-sm text-muted-foreground">{org.slug}</code></td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <Badge variant={org.active ? 'default' : 'secondary'}>{org.active ? 'Active' : 'Inactive'}</Badge>
                            {org.tenantDb && <span className={`px-2 py-0.5 rounded-full text-xs font-medium w-fit ${deploymentBadgeClass(org.tenantDb.deploymentType)}`}>{org.tenantDb.deploymentType}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm whitespace-nowrap text-muted-foreground">{formatDate(org.createdAt)}</td>
                        <td className="px-6 py-4 text-sm font-medium text-right whitespace-nowrap">
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={() => onStartEdit(org)}><Edit2 className="w-4 h-4" /></Button>
                            <Button variant="outline" size="sm" onClick={() => onDelete(org.id, org.name)} className="text-red-600 hover:text-red-700 hover:border-red-300"><Trash2 className="w-4 h-4" /></Button>
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
