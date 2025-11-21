import { CheckCircle, Eye, EyeOff, Trash2 } from 'lucide-react';
import { FormattedKBContent } from '@/components/FormattedKBContent';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import type { KBEntry } from '@/services/kb.service';

type KBEntryDetailProps = {
  entry: KBEntry | null;
  onClose: () => void;
  onApprove: (id: number) => void;
  onHide: (id: number) => void;
  onDelete: (entry: KBEntry) => void;
};

export const KBEntryDetail = ({
  entry,
  onClose,
  onApprove,
  onHide,
  onDelete,
}: KBEntryDetailProps) => {
  if (!entry) return null;

  return (
    <Drawer open={!!entry} onClose={onClose} title="Entry Details">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex-none p-6 border-b">
          <div className="flex justify-between items-start gap-4 mb-4">
            <h2 className="text-2xl font-semibold">{entry.title}</h2>
            <div className="flex gap-2">
              {entry.hidden ? (
                <Badge className="text-muted-foreground">Hidden</Badge>
              ) : entry.approved ? (
                <Badge className="bg-green-600">Approved</Badge>
              ) : (
                <Badge>Pending Review</Badge>
              )}
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Category:</span>
              <div className="font-medium">{entry.category}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Department:</span>
              <div className="font-medium">{entry.departmentRole}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Quality Score:</span>
              <div className="font-medium">{(entry.qualityScore * 100).toFixed(0)}%</div>
            </div>
            <div>
              <span className="text-muted-foreground">Usage Count:</span>
              <div className="font-medium">{entry.usageCount}</div>
            </div>
            {entry.metadata && typeof entry.metadata.sourceMessageId === 'number' && (
              <div>
                <span className="text-muted-foreground">Source Message:</span>
                <div className="font-medium">
                  <a
                    href={`/messages?id=${entry.metadata.sourceMessageId}`}
                    className="text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    #{entry.metadata.sourceMessageId}
                  </a>
                </div>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Type:</span>
              <div className="font-medium capitalize">{entry.type.replace('_', ' ')}</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <h3 className="text-lg font-semibold mb-3">Content</h3>
          <FormattedKBContent content={entry.content} />
        </div>

        {/* Actions Footer */}
        <div className="flex-none p-6 border-t bg-muted/20">
          <div className="flex gap-3 justify-end">
            {!entry.approved && !entry.hidden && (
              <Button variant="primary" onClick={() => onApprove(entry.id)}>
                <CheckCircle className="mr-2 w-4 h-4" />
                Approve
              </Button>
            )}
            {!entry.hidden ? (
              <Button variant="outline" onClick={() => onHide(entry.id)}>
                <EyeOff className="mr-2 w-4 h-4" />
                Hide
              </Button>
            ) : (
              <Button variant="outline" onClick={() => onApprove(entry.id)}>
                <Eye className="mr-2 w-4 h-4" />
                Unhide
              </Button>
            )}
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => {
                onClose();
                onDelete(entry);
              }}
            >
              <Trash2 className="mr-2 w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
};
