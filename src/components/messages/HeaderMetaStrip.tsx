import { useRef } from 'react';
import { Check, X, Tag, Plus } from 'lucide-react';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import { ReactSelect } from '@/components/ui/ReactSelect';
import type { Message, Category } from '@/types';
import type { Label } from '@/services/settings.service';
import { MONO } from './messageDetailConstants';

type Props = {
  message: Message;
  categories: Category[];
  messageLabels: Label[];
  allLabels: Label[];
  hasManageLabels: boolean;
  showLabelPicker: boolean;
  updatingCategory: boolean;
  onAssign?: () => void;
  onSetCategory: (categoryId: number | null) => void;
  onToggleLabel: (label: Label) => void;
  onToggleLabelPicker: () => void;
  onCloseLabelPicker: () => void;
};

export function HeaderMetaStrip({
  message,
  categories,
  messageLabels,
  allLabels,
  hasManageLabels,
  showLabelPicker,
  updatingCategory,
  onAssign,
  onSetCategory,
  onToggleLabel,
  onToggleLabelPicker,
  onCloseLabelPicker,
}: Props) {
  const labelPickerRef = useRef<HTMLDivElement>(null);

  const threadItemId = message.subject
    ? `subj::${message.subject.replace(/^((re(\[\d+\])?|fwd|fw)\s*:\s*)*/gi, '').trim().toLowerCase()}::${message.sender < (message.recipient ?? '') ? message.sender : (message.recipient ?? '')}::${message.sender > (message.recipient ?? '') ? message.sender : (message.recipient ?? '')}`
    : message.id;

  return (
    <div className="flex flex-col gap-2 px-4 pt-2 pb-3 border-t border-border/40">
      {/* Assignee */}
      <div className="flex gap-2 items-center">
        <span className={`flex-shrink-0 w-16 ${MONO} text-muted-foreground`}>ASSIGNED</span>
        <div className="flex-1 min-w-0">
          <AssignmentSelect
            type={message.subject ? 'thread' : 'message'}
            itemId={threadItemId}
            currentAssigneeId={message.assigneeId}
            onAssign={onAssign}
            className="w-full"
          />
        </div>
      </div>

      {/* Category */}
      {categories.length > 0 && (
        <div className="flex gap-2 items-center">
          <span className={`flex-shrink-0 w-16 ${MONO} text-muted-foreground`}>CATEGORY</span>
          <ReactSelect
            value={message.categoryId !== null && message.categoryId !== undefined ? String(message.categoryId) : ''}
            onChange={(val) => onSetCategory(val ? Number(val) : null)}
            options={[{ value: '', label: 'No category' }, ...categories.map((cat) => ({ value: String(cat.id), label: cat.name }))]}
            isDisabled={updatingCategory}
            className="flex-1 min-w-0"
          />
        </div>
      )}

      {/* Labels */}
      {allLabels.length > 0 && (
        <div className="flex gap-2 items-center">
          <span className={`flex-shrink-0 w-16 ${MONO} text-muted-foreground`}>LABELS</span>
          <div className="flex flex-wrap flex-1 gap-1 items-center min-w-0">
            {messageLabels.map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white"
                style={{ backgroundColor: label.color }}
              >
                {label.name}
                {hasManageLabels && (
                  <button onClick={() => onToggleLabel(label)} className="opacity-70 hover:opacity-100">
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            ))}
            {hasManageLabels && (
              <div className="relative" ref={labelPickerRef}>
                <button
                  onClick={onToggleLabelPicker}
                  className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-accent border border-dashed border-border transition-colors"
                >
                  <Tag className="w-2.5 h-2.5" />
                  <Plus className="w-2.5 h-2.5" />
                </button>
                {showLabelPicker && (
                  <div data-label-picker className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-lg border border-border bg-card shadow-md p-1">
                    {allLabels.map((label) => {
                      const assigned = messageLabels.some((lbl) => lbl.id === label.id);
                      return (
                        <button
                          key={label.id}
                          onClick={() => { onToggleLabel(label); onCloseLabelPicker(); }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left"
                        >
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                          <span className="flex-1">{label.name}</span>
                          {assigned && <Check className="w-2.5 h-2.5 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
