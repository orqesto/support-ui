import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsoleEmpty } from '@/components/console/ConsoleEmpty';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  customApiTemplateAdminService,
  type CustomApiTemplate,
  type TemplateDefinition,
} from '@/services/customApiTemplates.service';

/**
 * Custom API templates (spec CUSTOM-API-TEMPLATES 2026-10-09): platform-managed set-ups a workspace
 * applies when it adds lookups. The definition is edited as JSON; the backend validates it and
 * names each problem by its path, which is shown as is.
 */
type Draft = { id: number | null; key: string; name: string; description: string; json: string };
const KEY = ['platform', 'custom-api-templates'];

const draftOf = (tpl: CustomApiTemplate | null): Draft => ({
  id: tpl?.id ?? null,
  key: tpl?.key ?? '',
  name: tpl?.name ?? '',
  description: tpl?.description ?? '',
  json: JSON.stringify(tpl?.definition ?? { version: 1, lookups: [] }, null, 2),
});

export const PlatformCustomApiTemplates = () => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: KEY, queryFn: () => customApiTemplateAdminService.list() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const save = useMutation({
    mutationFn: async (next: Draft) => {
      let definition: TemplateDefinition;
      try {
        definition = JSON.parse(next.json) as TemplateDefinition;
      } catch {
        throw new Error('The definition is not valid JSON.');
      }
      return next.id === null
        ? customApiTemplateAdminService.create({
            key: next.key.trim(),
            name: next.name.trim(),
            description: next.description.trim(),
            status: 'draft',
            definition,
          })
        : customApiTemplateAdminService.update(next.id, {
            name: next.name.trim(),
            description: next.description.trim(),
            definition,
          });
    },
    onSuccess: () => {
      setDraft(null);
      setError(null);
      void refresh();
    },
    onError: (err) => setError(getApiErrorMessage(err) ?? err.message),
  });

  const locked = save.isPending;

  const publish = useMutation({
    mutationFn: (tpl: CustomApiTemplate) =>
      customApiTemplateAdminService.update(tpl.id, {
        status: tpl.status === 'published' ? 'draft' : 'published',
      }),
    onSuccess: () => void refresh(),
    onError: (err) => setError(getApiErrorMessage(err) ?? err.message),
  });

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Custom API templates"
        description="Ready-made lookup set-ups workspaces apply when they add a custom API. Only published templates are offered."
        actions={
          <Button
            disabled={locked}
            onClick={() => {
              setError(null);
              setDraft(draftOf(null));
            }}
          >
            New template
          </Button>
        }
      />
      {error && <Alert variant="danger">{error}</Alert>}
      {draft && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            {draft.id === null && (
              <Input
                label="Key"
                disabled={locked}
                value={draft.key}
                onChange={(event) => setDraft({ ...draft, key: event.target.value })}
              />
            )}
            <Input
              label="Name"
              disabled={locked}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <Input
              label="Description"
              disabled={locked}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            <label className="block text-sm font-medium" htmlFor="tpl-json">
              Definition (JSON)
            </label>
            <textarea
              id="tpl-json"
              disabled={locked}
              className="w-full min-h-[320px] rounded-md border border-border bg-card p-2 font-mono text-xs"
              value={draft.json}
              onChange={(event) => setDraft({ ...draft, json: event.target.value })}
            />
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setError(null);
                  save.mutate(draft);
                }}
                isLoading={save.isPending}
              >
                Save template
              </Button>
              <Button
                variant="ghost"
                disabled={locked}
                onClick={() => {
                  setError(null);
                  setDraft(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {query.isLoading ? (
        <ConsoleLoading />
      ) : query.isError ? (
        <Alert variant="danger">
          <div className="space-y-3">
            <p>Failed to load templates.</p>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : (query.data ?? []).length === 0 ? (
        <ConsoleEmpty message="No templates yet." />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <ul className="divide-y divide-border">
              {(query.data ?? []).map((tpl) => (
                <li key={tpl.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{tpl.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{tpl.key}</p>
                    {tpl.description && (
                      <p className="text-xs text-muted-foreground">{tpl.description}</p>
                    )}
                  </div>
                  <Badge variant={tpl.status === 'published' ? 'success' : 'secondary'}>
                    {tpl.status === 'published' ? 'Published' : 'Draft'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked}
                    onClick={() => {
                      setError(null);
                      setDraft(draftOf(tpl));
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={publish.isPending}
                    onClick={() => publish.mutate(tpl)}
                  >
                    {tpl.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
