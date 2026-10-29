import type { KbQuestion } from '@/services/kbEngine.types';

/** Real shop-policy conflicts; evidence counts and dates are invented. No customer data. F7 deletes this folder. */
export const kbMockPairs: KbQuestion[] = [
  {
    id: 'q1',
    question: 'What is the fee for sending an order again?',
    choices: [
      {
        key: 'a',
        text: 'Reshipping costs 22 €.',
        evidence: {
          threads: 14,
          customers: 11,
          countries: ['Germany', 'Austria'],
          firstSeen: '2026-07-02',
          lastSeen: '2026-10-21',
          usedInDraftsThisWeek: 9,
        },
      },
      {
        key: 'b',
        text: 'Reshipping costs 28 €.',
        evidence: {
          threads: 9,
          customers: 8,
          countries: ['France', 'Spain', 'Italy'],
          firstSeen: '2026-08-11',
          lastSeen: '2026-10-27',
          usedInDraftsThisWeek: 5,
        },
      },
    ],
    ruledOut: [
      'An 8 € figure seen in 2 threads (looks like the postage only)',
      'A one-off promotion in September',
    ],
    guess: 'It depends on the country',
    openDays: 3,
  },
  {
    id: 'q2',
    question: 'How many times do we reship a parcel that was lost?',
    choices: [
      {
        key: 'a',
        text: 'We reship a lost parcel once.',
        evidence: {
          threads: 16,
          customers: 14,
          countries: ['Germany', 'Netherlands'],
          firstSeen: '2026-06-15',
          lastSeen: '2026-10-25',
          usedInDraftsThisWeek: 8,
        },
      },
      {
        key: 'b',
        text: 'We reship a lost parcel twice.',
        evidence: {
          threads: 7,
          customers: 7,
          countries: ['Germany', 'Austria'],
          firstSeen: '2026-09-02',
          lastSeen: '2026-10-19',
          usedInDraftsThisWeek: 3,
        },
      },
    ],
    ruledOut: ['Parcels lost after a second reship (only 1 thread)'],
    openDays: 6,
  },
  {
    id: 'q3',
    question: 'Does a returned item get a refund or store credit?',
    choices: [
      {
        key: 'a',
        text: 'A returned item is refunded to the original payment method.',
        evidence: {
          threads: 22,
          customers: 20,
          countries: ['Germany', 'Spain', 'France'],
          firstSeen: '2026-05-20',
          lastSeen: '2026-10-28',
          usedInDraftsThisWeek: 12,
        },
      },
      {
        key: 'b',
        text: 'A returned item is given as store credit.',
        evidence: {
          threads: 6,
          customers: 6,
          countries: ['Italy'],
          firstSeen: '2026-08-30',
          lastSeen: '2026-10-12',
          usedInDraftsThisWeek: 2,
        },
      },
    ],
    ruledOut: ['Sale items (same answer in both)', 'Gift orders'],
    guess: 'It depends on the item',
    openDays: 1,
  },
  {
    id: 'q4',
    question: 'How many days does a customer have to claim compensation?',
    choices: [
      {
        key: 'a',
        text: 'Compensation can be claimed within 14 days.',
        evidence: {
          threads: 11,
          customers: 10,
          countries: ['Germany', 'Austria'],
          firstSeen: '2026-07-19',
          lastSeen: '2026-10-26',
          usedInDraftsThisWeek: 5,
        },
      },
      {
        key: 'b',
        text: 'Compensation can be claimed within 16 days.',
        evidence: {
          threads: 5,
          customers: 5,
          countries: ['Germany'],
          firstSeen: '2026-09-21',
          lastSeen: '2026-10-24',
          usedInDraftsThisWeek: 2,
        },
      },
    ],
    ruledOut: ['Weekend and holiday counting (the same number in both)'],
    openDays: 9,
  },
  {
    id: 'q5',
    question: 'Is there a minimum amount for paying by card?',
    choices: [
      {
        key: 'a',
        text: 'Card payments need a minimum of 150 €.',
        evidence: {
          threads: 8,
          customers: 8,
          countries: ['Germany', 'Switzerland'],
          firstSeen: '2026-05-04',
          lastSeen: '2026-10-28',
          usedInDraftsThisWeek: 4,
        },
      },
      {
        key: 'b',
        text: 'There is no minimum for card payments.',
        evidence: {
          threads: 13,
          customers: 12,
          countries: ['Germany', 'Austria', 'France'],
          firstSeen: '2026-07-21',
          lastSeen: '2026-10-27',
          usedInDraftsThisWeek: 7,
        },
      },
    ],
    ruledOut: ['An older minimum from last year (one entry, last used in June)'],
    guess: 'It depends on the payment provider',
    openDays: 2,
  },
];
