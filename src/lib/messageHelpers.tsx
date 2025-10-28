import { Mail, MessageSquare, Send } from 'lucide-react';

export const getChannelIcon = (channel: string) => {
  switch (channel) {
    case 'email':
      return <Mail className="w-4 h-4" />;
    case 'slack':
    case 'telegram':
      return <MessageSquare className="w-4 h-4" />;
    default:
      return <Send className="w-4 h-4" />;
  }
};

export const getCategoryDisplay = (suggestedCat?: string) => {
  if (!suggestedCat) {
    return null;
  }
  // If it's a numeric ID, just show "Category #X", otherwise show the name
  if (/^\d+$/.test(suggestedCat)) {
    return `Category #${suggestedCat}`;
  }
  // If it contains letters, it's likely a name - show it directly
  return suggestedCat;
};

export const hasMessageAttachments = (rawData?: { attachments?: unknown[] }) =>
  rawData?.attachments && Array.isArray(rawData.attachments) && rawData.attachments.length > 0;
