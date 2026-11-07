import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { RoutingKeyType } from '@/types/skillRouting';

/** Names the backend normalises to a language code (BE shared/routing/languageNormalise). */
const COMMON_LANGUAGES = [
  'english', 'spanish', 'german', 'french', 'italian', 'portuguese', 'russian', 'ukrainian',
  'polish', 'latvian', 'lithuanian', 'estonian', 'dutch', 'swedish', 'turkish', 'arabic', 'chinese',
];

/**
 * One-click values for an agent's skill: the values colleagues already hold (so the same skill is
 * spelt the same way and matches the same description), and for a Language key common languages.
 */
export const SkillValueSuggestions = ({
  keyType,
  existing,
  held,
  onPick,
  disabled = false,
}: {
  keyType: RoutingKeyType;
  existing: string[];
  held: string[];
  onPick: (value: string) => void;
  disabled?: boolean;
}) => {
  const offered = [...new Set([...existing, ...(keyType === 'language' ? COMMON_LANGUAGES : [])])].filter(
    (value) => !held.includes(value)
  );
  if (offered.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {offered.map((value) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs text-muted-foreground"
          aria-label={`Add ${value}`}
          disabled={disabled}
          onClick={() => onPick(value)}
        >
          <Plus className="mr-0.5 h-3 w-3" />
          {value}
        </Button>
      ))}
    </div>
  );
};
