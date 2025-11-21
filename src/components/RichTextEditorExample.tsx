import { useState } from 'react';
import RichTextEditor from './RichTextEditor';
import { Button } from './ui/Button';

/**
 * Example component demonstrating RichTextEditor usage
 *
 * Usage in your components:
 *
 * // For Message Replies:
 * const [replyContent, setReplyContent] = useState('');
 * <RichTextEditor
 *   content={replyContent}
 *   onChange={setReplyContent}
 *   placeholder="Write your reply..."
 * />
 *
 * // For Comments:
 * const [comment, setComment] = useState('');
 * <RichTextEditor
 *   content={comment}
 *   onChange={setComment}
 *   placeholder="Add a comment..."
 *   minHeight="100px"
 * />
 *
 * // Read-only Display:
 * <RichTextEditor
 *   content={message.content}
 *   editable={false}
 * />
 */
const RichTextEditorExample = () => {
  const [content, setContent] = useState('<p>Try editing this text!</p>');
  const [showHTML, setShowHTML] = useState(false);

  const handleSave = () => {
    console.log('Saving content:', content);
    // Send to API: apiClient.post('/messages/reply', { content })
  };

  return (
    <div className="p-6 mx-auto space-y-4 max-w-4xl">
      <h2 className="text-2xl font-bold">Rich Text Editor Example</h2>

      <div className="space-y-2">
        <label htmlFor="replyContent" className="text-sm font-medium">
          Message Reply
        </label>
        <RichTextEditor
          content={content}
          onChange={setContent}
          placeholder="Write your reply here..."
          minHeight="200px"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave}>Save Reply</Button>
        <Button variant="outline" onClick={() => setShowHTML(!showHTML)}>
          {showHTML ? 'Hide' : 'Show'} HTML
        </Button>
      </div>

      {showHTML && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="mb-2 text-sm font-medium">Generated HTML:</p>
          <pre className="overflow-auto text-xs">{content}</pre>
        </div>
      )}

      <div className="pt-4 mt-6 border-t">
        <h3 className="mb-2 text-lg font-semibold">Read-only Preview</h3>
        <RichTextEditor content={content} editable={false} className="bg-gray-50" />
      </div>
    </div>
  );
};

export default RichTextEditorExample;
