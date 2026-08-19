import { useEffect, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { organizationService } from '@/services/organization.service';
import { userService } from '@/services/user.service';

/**
 * Routing skill values for auto-assignment.
 *
 * Owns its own state and loading because it does not participate in the surrounding
 * form: every edit here writes through to the API immediately, and "Save Changes" has
 * never applied to it. Keeping it separate makes that boundary visible rather than
 * something you have to infer from where the service calls sit.
 */
export const UserRoutingSkillsCard = ({ userId }: { userId: number }) => {
  const [routingKeys, setRoutingKeys] = useState<
    Array<{ id: number; key: string; description: string | null }>
  >([]);
  const [skillValues, setSkillValues] = useState<Record<string, string[]>>({});
  const [skillInputs, setSkillInputs] = useState<Record<string, string>>({});
  const [canEditSkills, setCanEditSkills] = useState(false);

  useEffect(() => {
    void organizationService.getRoutingKeys().then(setRoutingKeys).catch(() => setRoutingKeys([]));
  }, []);

  useEffect(() => {
    void userService.getSkillValues(userId).then(setSkillValues).catch(() => setSkillValues({}));
    void userService
      .getCanEditSkills(userId)
      .then(setCanEditSkills)
      .catch(() => setCanEditSkills(false));
  }, [userId]);

  const handleAddValue = (key: string) => {
    const raw = skillInputs[key]?.trim() ?? '';
    if (!raw) return;
    const newVals = raw
      .split(',')
      .map((val) => val.trim().toLowerCase())
      .filter(Boolean);
    const merged = [...new Set([...(skillValues[key] ?? []), ...newVals])];
    setSkillValues((prev) => ({ ...prev, [key]: merged }));
    setSkillInputs((prev) => ({ ...prev, [key]: '' }));
    void userService.setSkillValues(userId, key, merged);
  };

  const handleRemoveValue = (key: string, value: string) => {
    const next = (skillValues[key] ?? []).filter((val) => val !== value);
    setSkillValues((prev) => ({ ...prev, [key]: next }));
    void userService.setSkillValues(userId, key, next);
  };

  const handleToggleCanEditSkills = (checked: boolean) => {
    setCanEditSkills(checked);
    void userService.setCanEditSkills(userId, checked);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-1 items-center">
          <Tag className="w-4 h-4" />
          Routing Skills
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <label className="flex gap-2 items-center cursor-pointer">
            <span className="text-xs text-muted-foreground">Allow self-edit</span>
            <Toggle checked={canEditSkills} onChange={handleToggleCanEditSkills} />
          </label>
        </div>
        {routingKeys.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No routing keys defined. Add routing keys in Workspace Settings.
          </p>
        ) : (
          <div className="space-y-3">
            {routingKeys.map(({ key, description }) => (
              <div key={key} className="p-3 rounded-md border border-border bg-muted/20">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                    {key}
                  </span>
                  {description && <span className="text-xs text-muted-foreground">{description}</span>}
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(skillValues[key] ?? []).map((val) => (
                    <span
                      key={val}
                      className="flex gap-1 items-center px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary"
                    >
                      {val}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveValue(key, val)}
                        className="p-0 w-auto h-auto hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </span>
                  ))}
                  {(skillValues[key] ?? []).length === 0 && (
                    <span className="text-xs italic text-muted-foreground">None set</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={skillInputs[key] ?? ''}
                    onChange={(event) =>
                      setSkillInputs((prev) => ({ ...prev, [key]: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddValue(key);
                      }
                    }}
                    placeholder="e.g. de, en (comma-separated)"
                    className="flex-1 px-2 py-1 text-xs rounded border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleAddValue(key)}
                    className="px-2 py-1 h-auto text-xs"
                  >
                    Add
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Skill values are matched against incoming message attributes for auto-assignment.
        </p>
      </CardContent>
    </Card>
  );
};
