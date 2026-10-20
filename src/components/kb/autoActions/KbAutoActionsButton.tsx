import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

/** The Knowledge base page's way into Automatic actions (shown to KB managers only). */
export const KbAutoActionsButton = () => {
  const navigate = useNavigate();
  return (
    <Button variant="outline" size="sm" onClick={() => navigate('/knowledge-base/automatic')}>
      Automatic actions
    </Button>
  );
};
