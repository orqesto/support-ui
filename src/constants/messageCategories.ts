export const MESSAGE_CATEGORIES = {
  ALL: '',
  SPAM: 'spam',
  SCAM: 'scam',
  PHISHING: 'phishing',
  SUSPICIOUS: 'suspicious',
  PROMOTIONAL: 'promotional',
  TRANSACTIONAL: 'transactional',
  INVALID: 'invalid',
  UNSUBSCRIBE: 'unsubscribe',
  LEGITIMATE: 'legitimate',
} as const;

export type MessageCategory =
  (typeof MESSAGE_CATEGORIES)[keyof typeof MESSAGE_CATEGORIES];

export const MESSAGE_CATEGORY_LABELS: Record<MessageCategory, string> = {
  '': 'All',
  spam: 'Spam',
  scam: 'Scam',
  phishing: 'Phishing',
  suspicious: 'Suspicious',
  promotional: 'Promotional',
  transactional: 'Transactional',
  invalid: 'Invalid Response',
  unsubscribe: 'Unsubscribe',
  legitimate: 'Legitimate',
};

export const MESSAGE_CATEGORY_FILTER_OPTIONS = [
  { value: MESSAGE_CATEGORIES.ALL, label: 'All' },
  { value: MESSAGE_CATEGORIES.SPAM, label: 'Spam' },
  { value: MESSAGE_CATEGORIES.PROMOTIONAL, label: 'Promotional' },
  { value: MESSAGE_CATEGORIES.SUSPICIOUS, label: 'Suspicious' },
  { value: MESSAGE_CATEGORIES.PHISHING, label: 'Phishing' },
];
