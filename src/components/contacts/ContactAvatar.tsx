import { avatarColor, contactInitials } from '@/lib/utils';

type ContactAvatarProps = {
  email: string;
  name?: string | null;
  size?: number;
  className?: string;
};

/**
 * Identity avatar — a deterministic colored circle with the contact's initials.
 * Shared by the contacts list rows, the profile header, and linked-contact rows
 * so the colour/initials are consistent for a given email everywhere.
 */
export function ContactAvatar({ email, name, size = 34, className = '' }: ContactAvatarProps) {
  return (
    <div
      className={`flex justify-center items-center font-semibold text-white rounded-full shrink-0 ${className}`}
      style={{ width: size, height: size, background: avatarColor(email), fontSize: size * 0.36 }}
      aria-hidden
    >
      {contactInitials(name, email)}
    </div>
  );
}
