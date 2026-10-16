import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { KB_MERGES_REVIEW_PATH } from '@/components/layout/KbReviewSection';

/** The nightly review's merges and quality fixes — otherwise reachable only from a bell row. */
export const KbReviewSuggestionsButton = () => {
  const navigate = useNavigate();
  return (
    <Button variant="outline" size="sm" onClick={() => navigate(KB_MERGES_REVIEW_PATH)}>
      Review suggestions
    </Button>
  );
};
