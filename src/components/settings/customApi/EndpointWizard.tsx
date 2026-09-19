import { useState } from 'react';
import { ROLE_OPTIONS, applyRole, roleOption } from './fieldRoles';
import { OwnershipStep } from './OwnershipStep';
import { RecordFormatStep } from './RecordFormatStep';
import type { RecordFormat } from './recordFormat';
import { ResponseTree } from './ResponseTree';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import {
  customApiService,
  type CustomApiConnection,
  type CustomApiEndpoint,
  type EndpointTestResult,
  type FieldPick,
} from '@/services/customApi.service';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';

/**
 * Add or edit a LOOKUP, and pick what an agent sees — CA-5 Task 3.
 *
 * ⛔ A 24-FIELD FORM IS NOT SELF-SERVE EITHER. `endpointBaseSchema` has 24 fields and eight of
 * them are paths. Reaching a WORKING lookup here means a name, a path, and ticking fields out of
 * the tree; roles, chaining, formats and ownership are later steps that unlock more, and an admin
 * who never opens them still has something that works.
 */

interface Props {
  connection: CustomApiConnection;
  endpoint?: CustomApiEndpoint;
  onClose: () => void;
  onSaved: () => void;
}

/** The token the executor substitutes the looked-up value into. */
export const VALUE_PLACEHOLDER = '{value}';

/**
 * A label an agent will actually read. ⛔ RED: default to the raw path and agents get a column
 * headed `currency_code`, which is our data model leaking onto their screen.
 */
export const labelFromPath = (path: string): string => {
  const last = path.split('.').pop() ?? path;
  const words = last.replace(/\[\]$/, '').replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const EndpointWizard = ({ connection, endpoint, onClose, onSaved }: Props) => {
  const [label, setLabel] = useState(endpoint?.label ?? '');
  const [path, setPath] = useState(endpoint?.path ?? '');
  const [endpointId, setEndpointId] = useState<number | null>(endpoint?.id ?? null);
  const [picked, setPicked] = useState<FieldPick[]>(endpoint?.fieldPaths ?? []);
  const [paths, setPaths] = useState<string[]>([]);
  /**
   * ⛔ D19, AND THE REASON THIS IS INFERRED RATHER THAN ASKED (audit pass 7). The executor sends
   * the row cap as the VENDOR'S OWN `limit` only when a lookup is marked `many` — and that
   * vendor's default page size is 20 / 100000 / config_limit_admin / 1 depending on the route,
   * so "don't send it" is never safe. Every lookup this wizard created defaulted to `one`,
   * because `resultShape` is one of the 24 fields it deliberately hides — so a list lookup
   * over-fetched the WHOLE list on every agent lookup until the 2 MB cap truncated it.
   *
   * Inferred from what the vendor actually returned, which is the same principle as the Send
   * test itself: the shape it DOES, not the shape it claims. ⚠️ Honest limit: a list endpoint
   * tested against a customer with exactly one record still reads as `one`. The vendor's
   * `x-total-count` is consulted too, which covers the common case of a paged list.
   * ⛔ Upgrade only — never silently downgrade a lookup an admin or an earlier test made `many`.
   */
  const [resultShape, setResultShape] = useState<'one' | 'many'>(
    (endpoint?.resultShape as 'one' | 'many') ?? 'one'
  );
  /**
   * ⛔ THE SAME CLASS AS `resultShape` (audit pass 8, enumerating what pass 7 found one of).
   * `parameterSource` defaults to `manual`, and the wizard never set it — so every lookup made
   * here required an agent to TYPE the customer's email on every thread, when the lookup service
   * resolves it from the contact for free (`parameterSource === 'identity'` → identity.email).
   * That is the difference between the phase's acceptance — an agent presses Look up and reads
   * the answer — and an agent retyping an address that is already on screen.
   * Identity is the default because it is the common case; "the agent types it" stays available
   * for a parcel number, which is not a person.
   */
  const [fromIdentity, setFromIdentity] = useState(
    (endpoint?.parameterSource ?? 'identity') === 'identity'
  );
  /**
   * D35 (Task 5). Only meaningful for a lookup an agent types a NUMBER into — an identity lookup
   * already resolves from the contact, so the record is the customer's by construction.
   */
  const [ownershipSourceEndpointId, setOwnershipSourceEndpointId] = useState<number | null>(
    endpoint?.ownershipSourceEndpointId ?? null
  );
  /** D36 (Task 6). Like ownership, only meaningful for a lookup an agent types a number into. */
  const [recordFormat, setRecordFormat] = useState<RecordFormat | null>(
    endpoint?.recordFormatLength
      ? {
          prefix: endpoint.recordFormatPrefix ?? '',
          length: endpoint.recordFormatLength,
          charset: (endpoint.recordFormatCharset ?? 'digits') as RecordFormat['charset'],
        }
      : null
  );
  const [parameter, setParameter] = useState('');
  const [sample, setSample] = useState('');
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  /**
   * ⛔ A FAILED TEST IS NOT AN EMPTY TREE. Each outcome says something different, and collapsing
   * them into "nothing came back" makes an admin retune a working integration.
   */
  const explain = (status: string, reason?: string): string => {
    if (status === 'no_match')
      return 'Your system answered, but had nothing for that value. Try one you know exists.';
    if (status === 'shape_changed')
      return 'Your system answered, but not with the fields this lookup expects any more.';
    return reason ?? 'Your system did not answer.';
  };

  /**
   * Keep picks that still exist, and NAME the ones that vanished rather than dropping them.
   *
   * ⛔ Typed from the SERVICE, not a hand-written copy — a narrower local shape is how a field
   * the API really sends (`rows`, `total`) becomes invisible to the code that needs it.
   */
  const applyResult = (result: EndpointTestResult) => {
    if (result.outcome.status === 'ok') {
      setPaths(result.paths);
      setOutcome(null);
      const rowCount = result.outcome.rows?.length ?? 0;
      const vendorTotal = result.outcome.total ?? 0;
      if (rowCount > 1 || vendorTotal > 1) setResultShape('many');
      // ⛔ `picked` is NOT replaced by the new paths: an admin who pressed Test just to check the
      // lookup was alive must not lose every field they had chosen. What vanished is DERIVED
      // below rather than stored.
    } else {
      /**
       * ⛔ KEEP THE TREE. A no-match or a failure carries no paths, and replacing the tree with
       * that emptiness throws away the shape the admin was picking fields from — for something
       * as ordinary as testing a value this customer happens not to have. The backend already
       * refuses to overwrite the stored skeleton on a non-ok outcome; this is the same rule on
       * the screen. Found auditing this diff.
       */
      setOutcome(explain(result.outcome.status, result.outcome.reason));
    }
  };

  /**
   * ⛔ `identityField` travels WITH `identity`: the create schema refines that an identity
   * parameter needs one, so sending the source without it is a 400.
   */
  /**
   * ⛔ KEEPS AN EXISTING `identityField` (audit pass 2 — the class pass 1 found one of). The
   * contract allows `email`, `phone` and `displayName`; this wizard only offers "the customer's
   * email address", so hardcoding `email` here would SILENTLY RETARGET a lookup someone had
   * configured to match on phone — the next time an admin opened it and pressed Save, for a
   * field the screen never showed them. Email is the default for a NEW lookup, not an overwrite
   * of an old one.
   */
  const parameterFields = fromIdentity
    ? {
        parameterSource: 'identity' as const,
        identityField: endpoint?.identityField ?? ('email' as const),
      }
    : { parameterSource: 'manual' as const, identityField: null };

  /**
   * ⛔ THE PLACEHOLDER THE ADMIN HAS NEVER HEARD OF. The executor substitutes the value at
   * `{value}` in the path, and refuses the call when a value has nowhere to go — with a message
   * naming a token nothing in this UI had ever shown them. Audit pass 8.
   */
  const missingPlaceholder = path.trim().length > 0 && !path.includes(VALUE_PLACEHOLDER);

  /** The lookup must exist before it can be tested — both routes are per-lookup. */
  const ensureSaved = async (): Promise<number> => {
    if (endpointId) {
      await customApiService.updateEndpoint(connection.id, endpointId, {
        label: label.trim(),
        path: path.trim(),
        resultShape,
        ...parameterFields,
      });
      return endpointId;
    }
    const knownIds = new Set(connection.endpoints.map((one) => one.id));
    const updated = await customApiService.createEndpoint(connection.id, {
      label: label.trim(),
      path: path.trim(),
      resultShape,
      ...parameterFields,
    });
    /**
     * ⛔ THE ONE THAT IS NEW, never "the last one in the array". The endpoints query had no
     * ORDER BY, and Send test REWRITES a row every time it runs (it saves the response skeleton)
     * — so a rewritten row comes back last on a heap scan and "the last one" is a lookup the
     * admin edited ten minutes ago. Found by auditing this diff; the backend now orders by id
     * too, and this does not depend on that, because a deployed frontend can meet an older API.
     */
    const created =
      updated.endpoints.find((one) => !knownIds.has(one.id)) ??
      updated.endpoints.reduce(
        (best, one) => (best && best.id > one.id ? best : one),
        updated.endpoints[0]
      );
    if (!created) throw new Error('The lookup was created but the server did not return it.');
    setEndpointId(created.id);
    return created.id;
  };

  const run = async (how: 'test' | 'paste') => {
    setBusy(true);
    setError(null);
    try {
      const id = await ensureSaved();
      const result =
        how === 'test'
          ? await customApiService.sendTest(connection.id, id, parameter || undefined)
          : await customApiService.shapeSample(connection.id, id, sample);
      applyResult(result);
    } catch (err) {
      /**
       * ⛔ FE/BE SKEW, which this repo ships by design: a push to `main` deploys this frontend
       * while the backend goes out on a tag, so this code WILL meet a backend that predates the
       * paste route. That backend answers 404 for `/shape`, and "Could not reach your system"
       * would blame the admin's vendor for our own deploy order — sending them to look at a
       * tunnel that is working perfectly. Audit pass 6.
       */
      if (how === 'paste' && getErrorStatus(err) === 404) {
        setError(
          'Pasting a response is not available on this workspace yet — it needs the latest ' +
            'version of Odly. Use Test for now, or ask us to update you.'
        );
      } else {
        setError(getApiErrorMessage(err) ?? 'Could not reach your system.');
      }
    } finally {
      setBusy(false);
    }
  };

  const toggle = (fieldPath: string, next: boolean) => {
    setPicked((current) =>
      next
        ? [
            ...current,
            { path: fieldPath, label: labelFromPath(fieldPath), kind: 'plain', role: 'none' },
          ]
        : current.filter((field) => field.path !== fieldPath)
    );
  };

  const editPick = (fieldPath: string, patch: Partial<FieldPick>) => {
    setPicked((current) =>
      current.map((field) => (field.path === fieldPath ? { ...field, ...patch } : field))
    );
  };

  /**
   * D23: ⛔ MONEY WITHOUT A CURRENCY IS REFUSED. The verified vendor pre-multiplies most amounts
   * and leaves two raw, one of them in the live store currency — so the same number means
   * different things per endpoint, and an agent reading a bare figure quotes the wrong one.
   */
  /**
   * ⛔ DERIVED, NEVER STORED (audit pass 4). This was a `useState` set at test time, and the
   * Remove control added in pass 2 deleted a pick WITHOUT pruning it — so the warning went on
   * naming a field the admin had just removed, and the "that is every field" sentence could fire
   * off a stale count. A fix commit breaking the fix before it is the pattern this repo keeps
   * paying for; deriving it removes the state that could disagree.
   */
  const missing = paths.length
    ? picked.map((field) => field.path).filter((one) => !paths.includes(one))
    : [];

  /**
   * ⛔ A BLANK LABEL IS A 400 (audit pass 10). `fieldPathSchema` requires `label` min(1), and an
   * admin who clears one to retype it and saves first gets `{"error":"Validation error"}` — the
   * zod message never reaches them (pass 4). Caught here, where it can say which field.
   */
  const unlabelled = picked.filter((field) => !field.label.trim());

  const unpricedMoney = picked.filter(
    (field) => field.kind === 'money' && !field.currencyPath && !field.currencyLiteral
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      /**
       * ⛔ ONE WRITE, not two. This used to call `ensureSaved()` (which PATCHes the label and
       * path) and then PATCH again with the fields — so a failure between them left the lookup
       * renamed with its fields unsaved, and the admin with no way to tell which half landed.
       * (Audit pass 2.)
       */
      const id = endpointId ?? (await ensureSaved());
      await customApiService.updateEndpoint(connection.id, id, {
        label: label.trim(),
        path: path.trim(),
        fieldPaths: picked,
        resultShape,
        // ⛔ Sent as `null` when the admin chose "we can't check" — that is a DECISION, and the
        // three-valued rule elsewhere in this API means absent would read as "leave it alone".
        /**
         * ⛔ OMITTED, NOT NULLED, when the step was not shown (audit pass 1). These two questions
         * are asked only for a MANUAL lookup, so sending `null` for an identity one would destroy
         * whatever an admin had configured the moment they flipped the parameter source — data
         * they can no longer see, and so cannot know they lost. Worse, `ownershipSourceEndpointId`
         * is read whenever an agent supplies a recordRef, so nulling it could REMOVE a check that
         * would otherwise run. Absent means keep, which is this API's rule everywhere else.
         *
         * ⛔ The three format values travel TOGETHER (D36): a length without a charset is a
         * format that matches nothing, and all-null is how an admin says "do not pre-fill".
         */
        ...(fromIdentity
          ? {}
          : {
              ownershipSourceEndpointId,
              recordFormatPrefix: recordFormat?.prefix ?? null,
              recordFormatLength: recordFormat?.length ?? null,
              recordFormatCharset: recordFormat?.charset ?? null,
            }),
        ...parameterFields,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err) ?? 'Could not save this lookup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} dismissOnOverlayClick={false}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{endpoint ? `Edit ${endpoint.label}` : 'Add a lookup'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <Input
            label="What should agents call this?"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="This customer's orders"
          />
          <Input
            label="Address in your system"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder={`/index.php?route=rest/order_admin/userorders&email=${VALUE_PLACEHOLDER}`}
          />
          <p className="text-xs text-muted-foreground -mt-2">
            Put <code>{VALUE_PLACEHOLDER}</code> where the email or the number belongs — that is
            where we put it when an agent looks someone up.
          </p>

          <div className="space-y-1">
            <Label htmlFor="ca-param-source">What do we look up by?</Label>
            <Select
              id="ca-param-source"
              value={fromIdentity ? 'identity' : 'manual'}
              onChange={(event) => setFromIdentity(event.target.value === 'identity')}
            >
              <option value="identity">
                The customer’s email address — filled in for the agent
              </option>
              <option value="manual">Something the agent types, like an order number</option>
            </Select>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium text-foreground">
              Let’s see what your system returns
            </p>
            {!pasting ? (
              <>
                <Input
                  label="A value to try (an email or an order number you know exists)"
                  value={parameter}
                  onChange={(event) => setParameter(event.target.value)}
                />
                <div className="flex gap-2 items-center">
                  <Button
                    size="sm"
                    onClick={() => void run('test')}
                    disabled={busy || !path.trim()}
                  >
                    Test
                  </Button>
                  {/*
                   * ⛔ D39: the second route to the same tree. An admin whose system is behind a
                   * VPN, IP-allowlisted, or on a tunnel that has died can still get there — and
                   * DeusPower is reached through tunnels that die. Making the live call the only
                   * way blocks them with nothing to do but call us.
                   */}
                  <Button size="sm" variant="ghost" onClick={() => setPasting(true)}>
                    We can’t reach it — paste a response instead
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Label htmlFor="ca-sample">Paste what your system returns</Label>
                <Textarea
                  id="ca-sample"
                  rows={5}
                  value={sample}
                  onChange={(event) => setSample(event.target.value)}
                  placeholder='{"success":1,"data":[{"order_id":"137416"}]}'
                />
                <p className="text-xs text-muted-foreground">
                  {/* True, and load-bearing: the backend parses, shapes and drops it. */}
                  We only keep the shape — the field names, never the values.
                </p>
                <div className="flex gap-2 items-center">
                  <Button
                    size="sm"
                    onClick={() => void run('paste')}
                    disabled={busy || !sample.trim() || !path.trim()}
                  >
                    Use this
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPasting(false)}>
                    Back to testing
                  </Button>
                </div>
              </>
            )}
            {missingPlaceholder && (
              /*
               * ⛔ SAID BEFORE THE CALL, not after it. Without the placeholder the executor
               * refuses with "a configured value with nowhere to go" — a sentence about a token
               * the admin has never seen, arriving only once they have pressed Test.
               */
              <Alert variant="warning">
                <AlertDescription>
                  This address has no <code>{VALUE_PLACEHOLDER}</code> in it, so we have nowhere to
                  put the value we look up by. Add it where the email or number belongs.
                </AlertDescription>
              </Alert>
            )}
            {busy && <Spinner />}
            {outcome && (
              <Alert variant="warning">
                <AlertDescription>{outcome}</AlertDescription>
              </Alert>
            )}
          </div>

          {/*
           * ⛔ D35, and ONLY for a manual lookup. An identity lookup resolves its parameter from
           * the contact, so the record it returns is that customer's by construction — asking
           * would be a question with one possible answer.
           */}
          {!fromIdentity && <RecordFormatStep value={recordFormat} onChange={setRecordFormat} />}

          {!fromIdentity && (
            <OwnershipStep
              siblings={connection.endpoints.filter((one) => one.id !== endpointId)}
              value={ownershipSourceEndpointId}
              onChange={setOwnershipSourceEndpointId}
            />
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">What should agents see?</p>
            <ResponseTree paths={paths} picked={picked} onToggle={toggle} missing={missing} />
          </div>

          {picked.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-foreground">How should each one look?</p>
              {picked.map((field) => (
                <div key={field.path} className="space-y-1 rounded-md border border-border p-2">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      {/*
                       * ⛔ The label is "what agents see", not the raw path (audit pass 10). The
                       * path was the accessible NAME of this input while also being the label of
                       * its tick box in the tree — two different controls answering to the same
                       * name, for a screen reader and for a test alike. The path is still shown,
                       * as context rather than as the control's identity.
                       */}
                      <Input
                        label={`What agents see for ${field.path}`}
                        value={field.label}
                        onChange={(event) => editPick(field.path, { label: event.target.value })}
                      />
                    </div>
                    {/*
                     * ⛔ A FIELD THAT VANISHED FROM THE RESPONSE HAS NO TICK BOX — it is not in
                     * the tree any more — so without this the admin could not remove it at all.
                     * Keeping a pick they cannot delete is a dead end, and it is exactly the
                     * field they are most likely to want gone. (Audit pass 2.)
                     */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggle(field.path, false)}
                      aria-label={`Remove ${field.label}`}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      {/*
                       * D35/D37 (Task 4). ⛔ OPTIONAL: every field starts at "Just show it" and a
                       * lookup saves and works with nothing tagged. Roles unlock the stored
                       * summary and the ownership check; an admin must be able to reach a
                       * working lookup without meeting a concept they do not need yet.
                       */}
                      {/*
                       * ⛔ NAMED PER FIELD (audit pass 4). Every role select said "What is
                       * this?", so a lookup with five picked fields had five different controls
                       * answering to one accessible name — the identical defect fixed for the
                       * label input in the previous audit, recurring in new code. The class, not
                       * the file.
                       */}
                      <Label htmlFor={`role-${field.path}`}>What is {field.path}?</Label>
                      <Select
                        id={`role-${field.path}`}
                        value={field.role}
                        onChange={(event) =>
                          setPicked((current) =>
                            applyRole(current, field.path, event.target.value as FieldPick['role'])
                          )
                        }
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`kind-${field.path}`}>How to show {field.path}</Label>
                      <Select
                        id={`kind-${field.path}`}
                        value={field.kind}
                        onChange={(event) => {
                          const kind = event.target.value as FieldPick['kind'];
                          /**
                           * ⛔ A VALUE ALREADY SET (audit pass 5). Switching money → plain used
                           * to leave `currencyPath`/`currencyLiteral` behind: the backend's
                           * refine only looks at them for money, so the row saved cleanly and
                           * carried a currency for a field that is not an amount. Switching back
                           * then silently reinstated a currency the admin never re-chose.
                           */
                          editPick(field.path, {
                            kind,
                            ...(kind === 'money'
                              ? {}
                              : { currencyPath: undefined, currencyLiteral: undefined }),
                          });
                        }}
                      >
                        <option value="plain">Just show it</option>
                        <option value="money">It’s an amount of money</option>
                      </Select>
                    </div>
                    {field.kind === 'money' && (
                      <div className="flex-1">
                        <Label htmlFor={`cur-${field.path}`}>Currency for {field.path}</Label>
                        <Select
                          id={`cur-${field.path}`}
                          value={field.currencyPath ?? (field.currencyLiteral ? '__fixed' : '')}
                          onChange={(event) => {
                            const value = event.target.value;
                            editPick(field.path, {
                              currencyPath: value && value !== '__fixed' ? value : undefined,
                              currencyLiteral: value === '__fixed' ? 'EUR' : undefined,
                            });
                          }}
                        >
                          <option value="">Choose…</option>
                          {/*
                           * ⛔ Not the field ITSELF (audit pass 5): an amount priced in its own
                           * value renders "348.50 348.50" to an agent, and it is one keystroke
                           * away in an alphabetical list.
                           */}
                          {paths
                            .filter((candidate) => candidate !== field.path)
                            .map((candidate) => (
                              <option key={candidate} value={candidate}>
                                From {candidate}
                              </option>
                            ))}
                          <option value="__fixed">Always the same currency</option>
                        </Select>
                      </div>
                    )}
                  </div>
                  {/*
                   * ⛔ WHAT THE TAG BUYS, not just what it is. Without this the admin sees what to
                   * do and never why — and the ownership check is the single most important
                   * privacy control in the product to configure by accident.
                   */}
                  {roleOption(field.role).buys && (
                    <p className="text-xs text-muted-foreground">{roleOption(field.role).buys}</p>
                  )}
                  {field.kind === 'money' && field.currencyLiteral !== undefined && (
                    <Input
                      label="Which currency?"
                      value={field.currencyLiteral}
                      onChange={(event) =>
                        editPick(field.path, { currencyLiteral: event.target.value })
                      }
                      placeholder="EUR"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div role="status" aria-live="polite">
            {unlabelled.length > 0 && (
              <Alert variant="warning">
                <AlertDescription>
                  Give {unlabelled.length === 1 ? 'this field' : 'these fields'} a name agents will
                  read: {unlabelled.map((field) => field.path).join(', ')}.
                </AlertDescription>
              </Alert>
            )}
            {unpricedMoney.length > 0 && (
              <Alert variant="warning">
                <AlertDescription>
                  Tell us where the currency comes from for{' '}
                  {unpricedMoney.map((field) => field.label).join(', ')}. The same number can mean
                  different currencies on different lookups, so agents need to be told which.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="danger">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={
              busy ||
              !label.trim() ||
              !path.trim() ||
              unpricedMoney.length > 0 ||
              unlabelled.length > 0
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
