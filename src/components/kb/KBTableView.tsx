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
    <table className="w-full l:table-fixed ">
      <thead className="bg-muted/50">
        <tr className="border-b">
          <th className="w-10 px-2 py-3 text-left text-sm font-medium">Type</th>
          <th className="px-3 py-3 text-sm font-medium text-left">Title</th>
          <th className="hidden md:table-cell w-20 px-3 py-3 text-sm font-medium text-center">
            Source
          </th>
          <th className="hidden lg:table-cell w-28 px-3 py-3 text-sm font-medium text-left">
            Category
          </th>
          <th className="hidden xl:table-cell w-28 px-3 py-3 text-sm font-medium text-left">
            Department
          </th>
          <th className="hidden sm:table-cell w-20 px-3 py-3 text-sm font-medium text-center">
            Quality
          </th>
          <th className="hidden lg:table-cell w-16 px-3 py-3 text-sm font-medium text-center">
            Usage
          </th>
          <th className="w-24 px-3 py-3 text-sm font-medium text-center">Status</th>
          <th className="w-32 px-2 py-3 text-sm font-medium text-right">Actions</th>
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
                <div className="font-medium truncate">{entry.title}</div>
                <div className="text-sm text-muted-foreground line-clamp-1">{entry.content}</div>
              </td>
              <td className="hidden md:table-cell px-3 py-3 text-center">
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
              <td className="hidden lg:table-cell px-3 py-3">
                <Badge className="truncate max-w-full">{entry.category}</Badge>
              </td>
              <td className="hidden xl:table-cell px-3 py-3">
                <Badge className="truncate max-w-full">{entry.departmentRole}</Badge>
              </td>
              <td className="hidden sm:table-cell px-3 py-3 text-center">
                <span className={`font-medium ${getQualityColor(entry.qualityScore)}`}>
                  {(entry.qualityScore * 100).toFixed(0)}%
                </span>
              </td>
              <td className="hidden lg:table-cell px-3 py-3 text-center">{entry.usageCount}</td>
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
