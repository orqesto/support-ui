import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * The catch-all route used to render two bare centred lines of text: no logo, no nav,
 * no link out. The only way back was the browser's own back button, which is not
 * available as an affordance on a fresh tab or a shared link. A dead end on a mistyped
 * URL reads as a broken product rather than a wrong address.
 *
 * It deliberately does NOT render the app shell — an unauthenticated visitor hitting a
 * bad URL must not be shown navigation they cannot use.
 */
const NotFoundPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex flex-col justify-center items-center px-6 py-16 min-h-screen bg-background">
      <Link to="/" className="mb-10">
        <img
          src="/odly_blue_logo.png"
          alt="odly"
          width={120}
          height={32}
          className="object-contain w-auto h-8"
        />
      </Link>

      <p className="text-sm font-medium tracking-wide uppercase text-muted-foreground">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold text-center text-foreground">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 max-w-md text-center text-muted-foreground">
        There is nothing at{' '}
        <span className="font-mono text-sm break-all text-foreground">{location.pathname}</span>. It
        may have been moved, or the link may be mistyped.
      </p>

      <div className="flex flex-wrap gap-3 justify-center mt-8">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 w-4 h-4" />
          Go back
        </Button>
        <Button onClick={() => navigate('/dashboard')}>
          <Home className="mr-2 w-4 h-4" />
          Go to dashboard
        </Button>
      </div>

      <Link
        to="/messages"
        className="inline-flex gap-1.5 items-center mt-8 text-sm text-muted-foreground hover:text-foreground"
      >
        <LifeBuoy className="w-4 h-4" />
        Open the inbox instead
      </Link>
    </div>
  );
};

export default NotFoundPage;
