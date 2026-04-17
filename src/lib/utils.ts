import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

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
