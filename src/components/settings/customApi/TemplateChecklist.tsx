import { fieldWithRole } from './fieldRoles';
import type { FieldPick } from '@/services/customApi.service';
import type { TemplateChecklistItem } from '@/services/customApiTemplates.service';

/**
 * F3: the warning names the identifier in THIS template's words (its checklist item with role
 * `identifier`), not an order number — a template for bookings or parcels has none.
 */
export const identifierWarning = (checklist: TemplateChecklistItem[]): string => {
  const label = checklist.find((item) => item.role === 'identifier')?.label.trim();
  const noun = label ? label.toLowerCase() : 'record number';
  return `No field is tagged as the ${noun}, so the ownership check cannot work — every ${noun} lookup will read unverified.`;
};

/** What this template expects tagged, ticked off as the admin tags it. Never blocks Save. */
export const TemplateChecklist = ({
  checklist,
  picked,
  feedsOwnership,
}: {
  checklist: TemplateChecklistItem[];
  picked: FieldPick[];
  /** Another lookup of this template checks ownership against this one. */
  feedsOwnership: boolean;
}) => {
  const missingIdentifier = feedsOwnership && !fieldWithRole(picked, 'identifier');
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
      <p className="font-medium">This template expects</p>
      <ul className="space-y-1">
        {checklist.map((item) => {
          const done = Boolean(fieldWithRole(picked, item.role));
          return (
            <li
              key={item.role}
              data-testid={`check-${item.role}`}
              className="flex items-center gap-2"
            >
              <span aria-hidden className={done ? 'text-success' : 'text-muted-foreground'}>
                {done ? '✓' : '✗'}
              </span>
              <span>{item.label}</span>
              {!item.required && <span className="text-xs text-muted-foreground">optional</span>}
            </li>
          );
        })}
      </ul>
      {missingIdentifier && (
        <p role="alert" className="text-xs text-destructive">
          {identifierWarning(checklist)}
        </p>
      )}
    </div>
  );
};
