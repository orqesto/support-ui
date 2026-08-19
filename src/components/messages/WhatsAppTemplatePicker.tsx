import { useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import {
  emptyParameters,
  renderTemplatePreview,
  templateReadyToSend,
  type WhatsAppTemplate,
} from './whatsappTemplates';

export type WhatsAppTemplatePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: WhatsAppTemplate[];
  loading: boolean;
  sending: boolean;
  /** Server-side refusal from the last attempt, shown in place rather than as a toast. */
  error: string | null;
  onSend: (templateId: number, parameters: string[]) => void;
};

/**
 * Choose an approved WhatsApp template and fill its parameters.
 *
 * Reached only when the 24-hour window has closed, where a template is the sole thing
 * Meta will still deliver. Two things drive the design:
 *
 * 1. **The preview is the point.** A template is approved copy the agent did not write
 *    and cannot edit, so the only way they can take responsibility for what the customer
 *    receives is to read it rendered, with their own parameters in place.
 * 2. **The cost is stated before the send, not after.** Unlike every other reply in this
 *    product, a template send is billed per message. An agent should never spend a
 *    tenant's money without having been told they were about to.
 */
export function WhatsAppTemplatePicker({
  open,
  onOpenChange,
  templates,
  loading,
  sending,
  error,
  onSend,
}: WhatsAppTemplatePickerProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [parameters, setParameters] = useState<string[]>([]);

  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? null,
    [templates, selectedId]
  );

  // Reset on close so reopening never shows the previous conversation's choice — the
  // parameters are customer-specific and carrying them over would be a data leak between
  // threads, not merely a stale form.
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setParameters([]);
    }
  }, [open]);

  const handleSelect = (template: WhatsAppTemplate) => {
    setSelectedId(template.id);
    setParameters(emptyParameters(template));
  };

  const handleParameterChange = (index: number, value: string) => {
    setParameters((current) => current.map((existing, idx) => (idx === index ? value : existing)));
  };

  const ready = templateReadyToSend(selected, parameters);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Continue with an approved template</DialogTitle>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          The 24-hour reply window has closed, so WhatsApp will only deliver a template
          your business already had approved. Each one is charged per message.
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : templates.length === 0 ? (
          // Distinct from "loading": an empty list is almost always an unsynced number
          // rather than a business with no templates, and the fix is an admin action.
          <p className="py-6 text-sm text-center text-muted-foreground">
            No approved templates are available for this WhatsApp number. An admin can sync
            them from Meta in the channel&rsquo;s integration settings.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-y-auto space-y-1 max-h-56">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleSelect(template)}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                    template.id === selectedId
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex gap-2 justify-between items-baseline">
                    <span className="font-mono text-xs font-semibold">{template.name}</span>
                    <span className="text-[10px] uppercase text-muted-foreground">
                      {template.language}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs line-clamp-2 text-muted-foreground">
                    {template.bodyText}
                  </p>
                  <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">
                    {template.cost}
                  </p>
                </button>
              ))}
            </div>

            {selected && selected.variableCount > 0 && (
              <div className="space-y-2">
                {parameters.map((value, index) => (
                  // The index IS the identity here: Meta addresses these positionally as
                  // {{1}}, {{2}}…, the list never reorders, and its length is fixed by the
                  // approved template.
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={index} className="flex gap-2 items-center">
                    <span className="font-mono text-xs w-9 text-muted-foreground">
                      {`{{${index + 1}}}`}
                    </span>
                    <Input
                      value={value}
                      onChange={(event) => handleParameterChange(index, event.target.value)}
                      placeholder={`Value for {{${index + 1}}}`}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            )}

            {selected && (
              <div>
                <p className="mb-1 text-[10px] font-semibold tracking-wide uppercase text-muted-foreground">
                  What the customer will receive
                </p>
                <div className="px-3 py-2 text-sm whitespace-pre-wrap rounded border border-border bg-muted/40">
                  {renderTemplatePreview(selected.bodyText, parameters)}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!ready || sending}
            onClick={() => selected && onSend(selected.id, parameters)}
            title={
              ready
                ? selected?.cost
                : 'Choose a template and fill every value before sending'
            }
            className="flex gap-1.5 items-center"
          >
            <Send className="w-3 h-3" />
            {sending ? 'SENDING…' : 'SEND TEMPLATE'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
