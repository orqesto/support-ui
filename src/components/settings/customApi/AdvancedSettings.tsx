import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Textarea } from '@/components/ui/Textarea';
import {
  describeFailureSettings,
  describeRequestSettings,
  MAX_PAGES,
  type FailureSettings,
  type RequestSettings,
} from './requestSettings';
import type { RequestSettingsState } from './useRequestSettings';

/**
 * ⛔ COLLAPSED BY DEFAULT (owner, 2026-09-29): the common vendor needs none of this, and the form
 * must look as it did. When anything differs from the defaults the closed header says WHAT, so an
 * admin reopening a lookup is never surprised by a setting they cannot see.
 */
const Disclosure = ({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string[];
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border">
      <Button
        variant="ghost"
        className="flex justify-between items-center px-3 py-2 w-full h-auto text-sm font-medium text-left hover:bg-transparent"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="flex flex-col gap-0.5">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {summary.length > 0 ? summary.join(' · ') : 'Standard — nothing changed'}
          </span>
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0" />
        )}
      </Button>
      {open && <div className="p-3 space-y-3 border-t">{children}</div>}
    </div>
  );
};

/** Lookup-level: how the request is shaped and how much of a list is read. */
export const RequestAdvancedSettings = ({
  settings,
  onChange,
  resultShape,
}: {
  settings: RequestSettings;
  onChange: (next: RequestSettings) => void;
  resultShape: 'one' | 'many';
}) => {
  const set = <K extends keyof RequestSettings>(key: K, value: RequestSettings[K]) =>
    onChange({ ...settings, [key]: value });
  const many = resultShape === 'many';
  const mode = settings.paginationMode;

  return (
    <Disclosure
      title="Advanced request settings"
      summary={describeRequestSettings(settings, resultShape)}
    >
      <div className="space-y-1">
        <Label htmlFor="ca-method">How we ask</Label>
        <Select
          id="ca-method"
          value={settings.method}
          options={[
            { value: 'GET', label: 'GET — the value goes in the address' },
            { value: 'POST', label: 'POST — the value goes in a request body' },
          ]}
          onChange={(value) => set('method', value as RequestSettings['method'])}
        />
      </div>

      {settings.method === 'POST' && (
        <>
          <div className="space-y-1">
            <Label htmlFor="ca-body-format">Body format</Label>
            <Select
              id="ca-body-format"
              value={settings.bodyFormat}
              options={[
                { value: 'json', label: 'JSON' },
                { value: 'form', label: 'Form (name=value&…)' },
              ]}
              onChange={(value) => set('bodyFormat', value as RequestSettings['bodyFormat'])}
            />
          </div>
          <Textarea
            id="ca-body-template"
            label="Request body"
            rows={4}
            value={settings.requestBodyTemplate}
            onChange={(event) => set('requestBodyTemplate', event.target.value)}
            placeholder={settings.bodyFormat === 'json' ? '{"email": "{value}"}' : 'email={value}'}
          />
          <p className="text-xs text-muted-foreground">
            {'{value}'} is replaced with what is looked up (in JSON, keep it inside quotes). For a
            list that pages through the body, {'"{page}"'} is replaced with the page, offset or
            cursor.
          </p>
        </>
      )}

      <div className="space-y-1">
        <Label htmlFor="ca-not-found">When the system answers 404 (not found)</Label>
        <Select
          id="ca-not-found"
          value={settings.notFoundMeans}
          options={[
            { value: 'no_match', label: 'It has nothing for this value' },
            { value: 'failed', label: 'Something is wrong with the lookup (for example the path)' },
          ]}
          onChange={(value) => set('notFoundMeans', value as RequestSettings['notFoundMeans'])}
        />
      </div>

      {many && (
        <>
          <Input
            label="Parameter the row limit is sent as (leave empty to send none)"
            value={settings.limitParam}
            onChange={(event) => set('limitParam', event.target.value)}
            placeholder="limit"
          />
          <div className="space-y-1">
            <Label htmlFor="ca-pagination">More than one page</Label>
            <Select
              id="ca-pagination"
              value={mode}
              options={[
                { value: 'none', label: 'Read the first page only' },
                { value: 'page', label: 'Page numbers (page=1, 2, 3…)' },
                { value: 'offset', label: 'Offsets (skip the rows already read)' },
                { value: 'cursor', label: 'A cursor or next-page link in the response' },
                { value: 'link', label: 'A “Link: rel=next” response header' },
              ]}
              onChange={(value) =>
                set('paginationMode', value as RequestSettings['paginationMode'])
              }
            />
          </div>
          {(mode === 'page' || mode === 'offset' || mode === 'cursor') && (
            <Input
              label={
                mode === 'page'
                  ? 'Page parameter'
                  : mode === 'offset'
                    ? 'Offset parameter'
                    : 'Cursor parameter (not needed when the response gives a link)'
              }
              value={settings.paginationParam}
              onChange={(event) => set('paginationParam', event.target.value)}
              placeholder={mode === 'page' ? 'page' : mode === 'offset' ? 'offset' : 'cursor'}
            />
          )}
          {mode === 'page' && (
            <Input
              label="First page number"
              type="number"
              min={0}
              value={String(settings.paginationStart)}
              onChange={(event) =>
                set('paginationStart', Math.max(0, Number(event.target.value) || 0))
              }
            />
          )}
          {mode === 'cursor' && (
            <Input
              label="Where the next cursor or link is in the response"
              value={settings.paginationNextPath}
              onChange={(event) => set('paginationNextPath', event.target.value)}
              placeholder="meta.next_cursor"
            />
          )}
          {mode !== 'none' && (
            <Input
              label={`Most pages to read (1–${MAX_PAGES})`}
              type="number"
              min={1}
              max={MAX_PAGES}
              value={String(settings.paginationMaxPages)}
              onChange={(event) =>
                set(
                  'paginationMaxPages',
                  Math.min(MAX_PAGES, Math.max(1, Number(event.target.value) || 1))
                )
              }
            />
          )}
        </>
      )}
    </Disclosure>
  );
};

/** Vendor-level: how this system says a call FAILED inside a normal answer. */
export const FailureAdvancedSettings = ({
  settings,
  onChange,
}: {
  settings: FailureSettings;
  onChange: (next: FailureSettings) => void;
}) => {
  const set = <K extends keyof FailureSettings>(key: K, value: FailureSettings[K]) =>
    onChange({ ...settings, [key]: value });
  return (
    <Disclosure
      title="How this system reports a failed call"
      summary={describeFailureSettings(settings)}
    >
      <p className="text-xs text-muted-foreground">
        Some systems answer “OK” and put the failure inside the reply. Leave a field empty to switch
        that check off.
      </p>
      <Input
        label="Status field"
        value={settings.failureStatusPath}
        onChange={(event) => set('failureStatusPath', event.target.value)}
        placeholder="success"
      />
      <Input
        label="Values of that field that mean it failed (comma-separated)"
        value={settings.failureStatusValues}
        onChange={(event) => set('failureStatusValues', event.target.value)}
        placeholder="0, false"
      />
      <Input
        label="Error message field"
        value={settings.failureMessagePath}
        onChange={(event) => set('failureMessagePath', event.target.value)}
        placeholder="error"
      />
    </Disclosure>
  );
};

/** The lookup's Advanced section plus what blocks a save — nothing at all on an older backend. */
export const RequestSettingsBlock = ({
  request,
  resultShape,
}: {
  request: RequestSettingsState;
  resultShape: 'one' | 'many';
}) =>
  request.show ? (
    <>
      <RequestAdvancedSettings
        settings={request.settings}
        onChange={request.setSettings}
        resultShape={resultShape}
      />
      {request.problem && (
        <Alert variant="warning">
          <AlertDescription>{request.problem}</AlertDescription>
        </Alert>
      )}
    </>
  ) : null;
