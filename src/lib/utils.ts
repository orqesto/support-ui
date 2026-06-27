import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const safeCssColor = (color: string): string =>
  /^#[0-9a-fA-F]{3,8}$|^rgb\(|^rgba\(/.test(color.trim()) ? color.trim() : '#64748b';

export const formatDate = (date: string | Date) => new Date(date).toLocaleString();

export const formatAge = (date: string | Date): string => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks <= 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days < 7) return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  if (days < 30) return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
  const months = Math.floor(days / 30);
  const remainingWeeks = Math.floor((days % 30) / 7);
  return remainingWeeks > 0 ? `${months}mo ${remainingWeeks}w` : `${months}mo`;
};

export const getInitials = (name: string) =>
  name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

// Deterministic avatar background color from any stable key (email/name).
const AVATAR_PALETTE = [
  '#2563eb',
  '#7c3aed',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#db2777',
  '#4f46e5',
  '#0d9488',
  '#9333ea',
];

export const avatarColor = (key: string): string => {
  let sum = 0;
  for (const ch of String(key)) sum += ch.charCodeAt(0);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
};

// Initials that fall back to the email handle when there's no display name
// (the contacts list only carries an email, so getInitials' space-split is not
// enough — "maria@x.com" → "MA", not "M").
export const contactInitials = (name: string | null | undefined, email: string): string => {
  if (name?.trim()) {
    const parts = name
      .replace(/[^\p{L}\s.]/gu, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  return (email || '?').replace(/^@/, '').slice(0, 2).toUpperCase();
};
