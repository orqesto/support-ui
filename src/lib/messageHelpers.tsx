import { Mail, MessageSquare, Send } from 'lucide-react';
import { MESSAGE_CATEGORY_LABELS, type MessageCategory } from '@/constants/messageCategories';

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

export const hasMessageAttachments = (message: { attachmentCount?: number }) =>
  (message.attachmentCount ?? 0) > 0;

// Spam Check helpers
type SpamCheckData = {
  isSpam?: boolean;
  category?: string;
  confidence?: number;
  reason?: string;
  redFlags?: string[];
  greenFlags?: string[];
};

export const getSpamCheck = (message: {
  metadata?: Record<string, unknown> | null;
}): SpamCheckData | undefined => message.metadata?.spamCheck as SpamCheckData | undefined;

export const getFilteredCategoryLabel = (category?: string): string =>
  MESSAGE_CATEGORY_LABELS[category as MessageCategory] ?? 'Filtered';
