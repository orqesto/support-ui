import { Navigate } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { useMyAlliances } from '@/hooks/useAllianceAdmin';

/**
 * `/console` entry resolver. The "Manage" nav link points here (the target
 * alliance is dynamic, so the nav can't hard-code an id); this resolves the
 * caller's first administered alliance and redirects into its shell. A user with
 * no alliances is bounced back to the app.
 */
export const ConsolePage = () => {
  const { data: alliances = [], isLoading, isError } = useMyAlliances();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <Spinner size={24} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <Alert variant="danger">Couldn&apos;t load your alliances. Please try again.</Alert>
      </div>
    );
  }

  if (alliances.length === 0) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to={`/console/alliance/${alliances[0].id}`} replace />;
};
