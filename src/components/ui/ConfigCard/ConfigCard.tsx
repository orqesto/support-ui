import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  STATUS_BADGE_VARIANT,
  STATUS_LABEL,
  getConfigActionsClasses,
  getConfigEmptyNoteClasses,
  getConfigSummaryClasses,
} from './configCard.styles';
import type { ConfigCardProps, ConfigSummaryRow } from './configCard.types';

const SummaryRows = ({ rows }: { rows: ConfigSummaryRow[] }) => (
  <dl className={getConfigSummaryClasses()}>
    {rows.map(({ label, value, source, placeholder }) => {
      const isEmpty = value === null || value === undefined || value === '';
      return (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className={cn('m-0 break-all', isEmpty && 'text-muted-foreground')}>
            {isEmpty ? (placeholder ?? 'Not set') : value}
            {source && !isEmpty && (
              <span className="ml-2 text-xs text-muted-foreground">{source}</span>
            )}
          </dd>
        </div>
      );
    })}
  </dl>
);

/**
 * The three-state shell every configuration form should sit in.
 *
 * `empty` says what happens WITHOUT a config and offers to create one. `stored` is
 * the default view and is READ-ONLY — what it renders came back from the server, so
 * it cannot show a draft. `editing` is the form, and is the only state that can.
 *
 * The important consequence is that a save returns the card to `stored`. The mode
 * change IS the confirmation, and it is a stronger one than a toast: the values on
 * screen afterwards are re-read, not the ones that were typed. That removes the
 * whole class of "it looked saved but wasn't" rather than patching an instance of it.
 *
 * A caller owns its draft state; this shell owns only which state is showing (see
 * `useConfigCardState`).
 */
export const ConfigCard = ({
  title,
  icon,
  description,
  state,
  summary,
  emptyNote,
  children,
  note,
  extraActions,
  onConfigure,
  onEdit,
  onCancel,
  onSave,
  saveDisabled = false,
  saving = false,
  configureLabel = 'Configure',
  editLabel = 'Edit',
  saveLabel = 'Save',
}: ConfigCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex gap-2 items-center text-xl">
        {icon}
        {title}
        <Badge variant={STATUS_BADGE_VARIANT[state]} size="sm">
          {STATUS_LABEL[state]}
        </Badge>
      </CardTitle>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </CardHeader>

    <CardContent className="space-y-5">
      {state === 'empty' && emptyNote && (
        <div className={getConfigEmptyNoteClasses()}>{emptyNote}</div>
      )}

      {state === 'stored' && summary && summary.length > 0 && <SummaryRows rows={summary} />}

      {state === 'editing' && children}

      {note}

      <div className={getConfigActionsClasses()}>
        {state === 'empty' && onConfigure && (
          <Button onClick={onConfigure}>{configureLabel}</Button>
        )}

        {state === 'stored' && onEdit && <Button onClick={onEdit}>{editLabel}</Button>}

        {state === 'editing' && onSave && (
          <Button onClick={onSave} isLoading={saving} disabled={saveDisabled}>
            {saveLabel}
          </Button>
        )}
        {state === 'editing' && onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}

        {extraActions}
      </div>
    </CardContent>
  </Card>
);
