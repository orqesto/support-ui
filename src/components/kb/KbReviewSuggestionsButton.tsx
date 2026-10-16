import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

/**
 * The nightly review's merges and quality fixes live in the Knowledge Base list under
 * "Suggested change". On the list itself `onPick` sets the filter; elsewhere it navigates there.
 */
export const KbReviewSuggestionsButton = ({ onPick }: { onPick?: () => void }) => {
  const navigate = useNavigate();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => (onPick ? onPick() : navigate('/knowledge-base?status=suggested_change'))}
    >
      Review suggestions
    </Button>
  );
};
