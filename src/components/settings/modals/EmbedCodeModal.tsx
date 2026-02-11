import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import type { ChatWidget } from '@/services/chatWidget.service';
import { Button } from '@/components/ui/Button';

interface EmbedCodeModalProps {
  widget: ChatWidget | null;
  onClose: () => void;
}

export const EmbedCodeModal = ({ widget, onClose }: EmbedCodeModalProps) => {
  const [copied, setCopied] = useState(false);

  if (!widget) return null;

  const handleCopy = async () => {
    if (widget.embedCode) {
      try {
        await navigator.clipboard.writeText(widget.embedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Embed Code</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add this code to your website before the closing <code className="rounded bg-muted px-1">&lt;/body&gt;</code> tag:
          </p>

          <div className="relative">
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
              <code>{widget.embedCode}</code>
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Code
                </>
              )}
            </Button>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="mb-2 font-semibold">Configuration:</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex">
                <dt className="w-32 text-muted-foreground">Widget Key:</dt>
                <dd className="font-mono">{widget.widgetKey}</dd>
              </div>
              <div className="flex">
                <dt className="w-32 text-muted-foreground">Department:</dt>
                <dd className="capitalize">{widget.departmentRole}</dd>
              </div>
              <div className="flex">
                <dt className="w-32 text-muted-foreground">Position:</dt>
                <dd className="capitalize">{widget.position.replace('-', ' ')}</dd>
              </div>
              <div className="flex">
                <dt className="w-32 text-muted-foreground">Primary Color:</dt>
                <dd className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded border"
                    style={{ backgroundColor: widget.primaryColor }}
                  />
                  <span className="font-mono">{widget.primaryColor}</span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
