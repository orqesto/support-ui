import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Server } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Spinner } from '@/components/ui/Spinner';
import { platformService, type ApiCopiesState } from '@/services/platform.service';

const QUERY_KEY = ['platform', 'api-copies'] as const;
const CHOICES = ['1', '2', '3'] as const;
type Choice = (typeof CHOICES)[number];

const since = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

const RunningList = ({ state }: { state: ApiCopiesState }) =>
  state.running.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      No API copy has reported in the last 45 seconds.
    </p>
  ) : (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="font-normal py-1">Copy</th>
          <th className="font-normal py-1">Container</th>
          <th className="font-normal py-1">Started</th>
          <th className="font-normal py-1">Build</th>
        </tr>
      </thead>
      <tbody>
        {state.running.map((copy) => (
          <tr key={copy.copy} className="border-t border-border">
            <td className="py-1">{copy.copy}</td>
            <td className="py-1 font-mono text-xs">{copy.host}</td>
            <td className="py-1">{since(copy.startedAt)}</td>
            <td className="py-1 font-mono text-xs">{copy.gitSha.slice(0, 9)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

/**
 * Console → Platform → System: how many API copies the managed deploy runs (architecture M7 B1).
 * The app cannot start containers: the count saved here applies on the NEXT deploy, which also
 * rewrites the nginx upstream. More than one copy needs the worker split out and the one-time
 * nginx step (docs/runbooks/api-copies.md in the backend); without them the deploy refuses and
 * keeps the running stack.
 */
export const ApiCopiesCard = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: platformService.getApiCopies });
  const [choice, setChoice] = useState<Choice | null>(null);
  const save = useMutation({
    mutationFn: (copies: number) => platformService.setApiCopies(copies),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setChoice(null);
    },
  });

  const state = query.data;
  const saved = state ? (String(state.copies.value) as Choice) : null;
  const selected = choice ?? saved;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-4 w-4" aria-hidden />
          API copies
        </CardTitle>
        <CardDescription>
          How many API containers the deploy runs behind nginx. Off by default: one copy. More
          copies keep the site answering while one restarts and let a deploy without database
          changes replace them one at a time; on the same server they do not add CPU.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <Spinner />
        ) : query.isError || !state ? (
          <Alert variant="danger">
            The API copy count could not be read.{' '}
            <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : (
          <>
            {state.selfHosted && (
              <Alert variant="warning">
                This install is self-hosted: its own deploy runs one API copy, and this setting has
                no effect.
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">Copies at the next deploy</span>
              <SegmentedControl<Choice>
                ariaLabel="API copies at the next deploy"
                value={selected ?? '1'}
                onChange={setChoice}
                segments={CHOICES.map((value) => ({ value, label: value }))}
              />
              <Button
                size="sm"
                disabled={choice === null || choice === saved || save.isPending}
                onClick={() => choice && save.mutate(Number(choice))}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {state.copies.source === 'default' ? 'Default' : 'Saved'}
              </span>
            </div>
            {save.isError && <Alert variant="danger">The count was not saved. Try again.</Alert>}
            {Number(selected) > 1 && (
              <p className="text-xs text-muted-foreground">
                More than one copy needs the worker split out and the one-time nginx step on the
                server. Without them the deploy stops before it changes anything and keeps the
                running copies.
              </p>
            )}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Running now: {state.running.length}</h4>
              <RunningList state={state} />
              {state.appliesAtNextDeploy && !state.selfHosted && (
                <Alert variant="info">
                  {state.copies.value} {state.copies.value === 1 ? 'copy is' : 'copies are'} set and{' '}
                  {state.running.length} running: the next deploy applies the count.
                </Alert>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
