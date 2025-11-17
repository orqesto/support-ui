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
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">Rich Text Editor Example</h2>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Message Reply</label>
        <RichTextEditor
          content={content}
          onChange={setContent}
          placeholder="Write your reply here..."
          minHeight="200px"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave}>
          Save Reply
        </Button>
        <Button 
          variant="outline" 
          onClick={() => setShowHTML(!showHTML)}
        >
          {showHTML ? 'Hide' : 'Show'} HTML
        </Button>
      </div>

      {showHTML && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium mb-2">Generated HTML:</p>
          <pre className="text-xs overflow-auto">
            {content}
          </pre>
        </div>
      )}

      <div className="border-t pt-4 mt-6">
        <h3 className="text-lg font-semibold mb-2">Read-only Preview</h3>
        <RichTextEditor
          content={content}
          editable={false}
          className="bg-gray-50"
        />
      </div>
    </div>
  );
};

export default RichTextEditorExample;
