import { useState } from 'react';
import { Send, X, Paperclip, File } from 'lucide-react';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { Button } from '@/components/ui/Button';

type MessageReplyFormProps = {
  onSend: (content: string, files: File[]) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
};

export const MessageReplyForm = ({ onSend, onCancel, submitting }: MessageReplyFormProps) => {
  const [replyContent, setReplyContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleSend = async () => {
    if (!replyContent.trim()) {
      return;
    }
    await onSend(replyContent, selectedFiles);
    setReplyContent('');
    setSelectedFiles([]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((files) => files.filter((_, i) => i !== index));
  };

  return (
    <div className="p-4 space-y-3 rounded-lg border bg-muted/50">
      <RichTextEditor
        content={replyContent}
        onChange={setReplyContent}
        placeholder="Type your reply..."
      />

      {/* File Attachments */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Attachments:</p>
          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div
                key={file.name}
                className="flex gap-2 items-center px-3 py-1.5 text-sm rounded-md border bg-background"
              >
                <File className="w-3 h-3" />
                <span className="max-w-[200px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={submitting}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-between">
        <label className="cursor-pointer">
          <input
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            disabled={submitting}
          />
          <Button type="button" variant="outline" size="sm" disabled={submitting}>
            <Paperclip className="mr-2 w-4 h-4" />
            Attach Files
          </Button>
        </label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!replyContent.trim() || submitting}
            isLoading={submitting}
          >
            <Send className="mr-2 w-4 h-4" />
            Send Reply
          </Button>
        </div>
      </div>
    </div>
  );
};
