import { Construction } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getButtonClasses } from '@/components/ui/Button/button.styles';
import { Card, CardContent } from '@/components/ui/Card';

type FeatureUnavailableProps = {
  /** What the user was trying to reach, e.g. "Billing Intelligence". */
  title?: string;
  /** Optional extra sentence for a surface that needs one. */
  description?: string;
};

/**
 * Shown when someone reaches a surface that is switched off because it is not finished.
 *
 * A hidden nav item is enough for people browsing the app, but not for a bookmark, a
 * shared link, or a browser that restores the last session — those land on the URL
 * directly. Rendering this beats the alternatives: a redirect silently swallows the
 * request and looks like a bug, and a 404 claims the page does not exist when it will.
 *
 * Deliberately says nothing about WHY or WHEN. Anything more specific becomes a promise
 * about a date, and this component has no way to know one.
 */
export const FeatureUnavailable = ({ title, description }: FeatureUnavailableProps) => (
  <div className="flex min-h-[60vh] items-center justify-center p-6">
    <Card className="max-w-md text-center">
      <CardContent className="flex flex-col items-center gap-4 py-10">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"
          aria-hidden="true"
        >
          <Construction className="h-6 w-6 text-gray-500 dark:text-gray-400" />
        </span>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title ? `${title} isn’t available yet` : 'This page isn’t available yet'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {description ?? 'We’re still building this. It’ll show up here once it’s ready.'}
          </p>
        </div>
        <Link to="/dashboard" className={getButtonClasses('secondary', 'md')}>
          Back to dashboard
        </Link>
      </CardContent>
    </Card>
  </div>
);
