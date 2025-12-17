import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type Props = {
  open: boolean;
  onToggle: () => void;
};

export const AdvancedFiltersToggle = ({ open, onToggle }: Props) => (
  <div className="flex justify-center">
    <Button size="sm" variant="ghost" onClick={onToggle} className="text-xs gap-1">
      {open ? (
        <>
          <ChevronUp className="w-3 h-3" />
          Hide Advanced Filters
        </>
      ) : (
        <>
          <ChevronDown className="w-3 h-3" />
          Show Advanced Filters
        </>
      )}
    </Button>
  </div>
);
