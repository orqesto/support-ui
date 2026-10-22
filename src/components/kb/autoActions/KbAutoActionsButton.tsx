import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAutoActionsAvailable } from '@/hooks/useAutoActionsAvailable';
import { AUTO_ACTIONS_HREF } from './kbAutoActionCopy';

/**
 * The Knowledge base page's way into Automatic actions (shown to KB managers only), which lives in
 * Settings › AI. Drawn only when the backend has the routes: on an older one that section is hidden,
 * so the button would land somewhere else.
 */
export const KbAutoActionsButton = () => {
  const navigate = useNavigate();
  const available = useAutoActionsAvailable(true);
  if (!available) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => navigate(AUTO_ACTIONS_HREF)}>
      Automatic actions
    </Button>
  );
};
