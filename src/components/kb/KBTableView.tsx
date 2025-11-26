import { CheckCircle, Eye, EyeOff, FileText, Maximize2, MessageSquare, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { KBEntry } from '@/services/kb.service';

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'qa_pair':
      return <MessageSquare className="w-4 h-4 text-blue-500" />;
    case 'document':
      return <FileText className="w-4 h-4 text-green-500" />;
    default:
      return <FileText className="w-4 h-4 text-gray-500" />;
  }
};

const getQualityColor = (score: number) => {
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
};

type KBTableViewProps = {
  entries: KBEntry[];
  loading: boolean;
  onView: (entry: KBEntry) => void;
  onApprove: (id: number) => void;
  onHide: (id: number) => void;
  onDelete: (entry: KBEntry) => void;
};

export const KBTableView = ({
  entries,
  loading,
  onView,
  onApprove,
  onHide,
  onDelete,
}: KBTableViewProps) => (
  <div className="hidden md:block rounded-lg border">
    <table className="w-full table-fixed ">
      <thead className="bg-muted/50">
        <tr className="border-b">
          <th className="px-2 py-3 text-sm font-medium text-left">Type</th>
          <th className="px-3 py-3 text-sm font-medium text-left">Title</th>
          <th className="hidden px-3 py-3 text-sm font-medium text-center md:table-cell">Source</th>
          <th className="hidden px-3 py-3 text-sm font-medium text-left lg:table-cell">Category</th>
          <th className="hidden px-3 py-3 text-sm font-medium text-left xl:table-cell">
            Department
          </th>
          <th className="hidden px-3 py-3 text-sm font-medium text-center sm:table-cell">
            Quality
          </th>
          <th className="hidden px-3 py-3 text-sm font-medium text-center lg:table-cell">Usage</th>
          <th className="px-3 py-3 text-sm font-medium text-center">Status</th>
          <th className="px-2 py-3 text-sm font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={9} className="px-4 py-8 text-center">
              Loading...
            </td>
          </tr>
        ) : entries.length === 0 ? (
          <tr>
            <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
              No entries found
            </td>
          </tr>
        ) : (
          entries.map((entry) => (
            <tr key={entry.id} className="border-b hover:bg-muted/50">
              <td className="px-2 py-3">{getTypeIcon(entry.type)}</td>
              <td className="px-3 py-3">
              <div className="font-medium truncate whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px]">
                {entry.title}
              </div>
              <div className="text-sm text-muted-foreground truncate whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px]">
                {entry.content}
              </div>

              </td>
              <td className="hidden px-3 py-3 text-center md:table-cell">
                {entry.metadata && typeof entry.metadata.sourceMessageId === 'number' ? (
                  <a
                    href={`/messages?id=${entry.metadata.sourceMessageId}`}
                    className="font-mono text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    #{entry.metadata.sourceMessageId}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </td>
              <td className="hidden px-3 py-3 lg:table-cell">
                <Badge className="max-w-full truncate">{entry.category}</Badge>
              </td>
              <td className="hidden px-3 py-3 xl:table-cell">
                <Badge className="max-w-full truncate">{entry.departmentRole}</Badge>
              </td>
              <td className="hidden px-3 py-3 text-center sm:table-cell">
                <span className={`font-medium ${getQualityColor(entry.qualityScore)}`}>
                  {(entry.qualityScore * 100).toFixed(0)}%
                </span>
              </td>
              <td className="hidden px-3 py-3 text-center lg:table-cell">{entry.usageCount}</td>
              <td className="px-3 py-3 text-center">
                {entry.hidden ? (
                  <Badge className="text-muted-foreground">Hidden</Badge>
                ) : entry.approved ? (
                  <Badge className="bg-green-600">Approved</Badge>
                ) : (
                  <Badge>Pending</Badge>
                )}
              </td>
              <td className="px-2 py-3 text-right">
                <div className="flex gap-1 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onView(entry)}
                    title="View details"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                  {!entry.approved && !entry.hidden && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onApprove(entry.id)}
                      title="Approve"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                  )}
                  {!entry.hidden ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onHide(entry.id)}
                      title="Hide"
                    >
                      <EyeOff className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onApprove(entry.id)}
                      title="Unhide"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDelete(entry)}
                    title="Delete"
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);
