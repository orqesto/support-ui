import { useState, useEffect } from 'react';
import { X, Plus, Tag, ShieldCheck } from 'lucide-react';
import { organizationService } from '@/services/organization.service';
import { userService } from '@/services/user.service';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import type { User } from '@/types';
import { logger } from '@/lib/logger';

type RoutingKey = { id: number; key: string; description: string | null };

type UserSkillsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
};

export const UserSkillsModal = ({ isOpen, onClose, user }: UserSkillsModalProps) => {
  const [routingKeys, setRoutingKeys] = useState<RoutingKey[]>([]);
  const [skills, setSkills] = useState<Record<string, string[]>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [canEditSkills, setCanEditSkills] = useState(false);
  const [globalSelfEdit, setGlobalSelfEdit] = useState(false);
  const [togglingPermission, setTogglingPermission] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;

    const load = async () => {
      setLoading(true);
      try {
        const [keys, values, canEdit, selfEdit] = await Promise.all([
          organizationService.getRoutingKeys(),
          userService.getSkillValues(user.id),
          userService.getCanEditSkills(user.id),
          organizationService.getSelfEditSkills(),
        ]);
        setRoutingKeys(keys);
        setSkills(values);
        setInputs({});
        setCanEditSkills(canEdit);
        setGlobalSelfEdit(selfEdit.allowSelfEditSkills);
      } catch (err) {
        logger.error('Failed to load skills:', err);
      } finally {
        setLoading(false);
      }
    };
    load().catch((err) => { logger.error(err); });
  }, [isOpen, user]);

  const handleToggleCanEdit = async () => {
    if (!user) return;
    const next = !canEditSkills;
    setTogglingPermission(true);
    try {
      await userService.setCanEditSkills(user.id, next);
      setCanEditSkills(next);
    } catch (err) {
      logger.error('Failed to update permission:', err);
    } finally {
      setTogglingPermission(false);
    }
  };

  const handleAddValue = async (key: string) => {
    const val = (inputs[key] ?? '').trim().toLowerCase();
    if (!val || !user) return;
    const existing = skills[key] ?? [];
    if (existing.includes(val)) return;
    const updated = [...existing, val];
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      await userService.setSkillValues(user.id, key, updated);
      setSkills((prev) => ({ ...prev, [key]: updated }));
      setInputs((prev) => ({ ...prev, [key]: '' }));
    } catch (err) {
      logger.error('Failed to add skill value:', err);
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleRemoveValue = async (key: string, value: string) => {
    if (!user) return;
    const updated = (skills[key] ?? []).filter((val) => val !== value);
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      await userService.setSkillValues(user.id, key, updated);
      setSkills((prev) => ({ ...prev, [key]: updated }));
    } catch (err) {
      logger.error('Failed to remove skill value:', err);
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Tag className="w-4 h-4" />
          Skills — {user?.firstName} {user?.lastName}
        </DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogContent>
        <div className="space-y-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : routingKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No routing keys defined. Add keys in Organization Settings.
            </p>
          ) : (
            routingKeys.map(({ key, description }) => (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {key}
                  </span>
                  {description && (
                    <span className="text-xs text-muted-foreground">— {description}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 min-h-[24px]">
                  {(skills[key] ?? []).map((val) => (
                    <span
                      key={val}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                    >
                      {val}
                      <button
                        type="button"
                        onClick={() => handleRemoveValue(key, val).catch((err) => { logger.error(err); })}
                        disabled={saving[key]}
                        className="hover:text-red-600 disabled:opacity-40"
                        aria-label={`Remove ${val}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {(skills[key] ?? []).length === 0 && (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 h-7 px-2 text-xs border rounded bg-background border-input focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Add value..."
                    value={inputs[key] ?? ''}
                    onChange={(event) => setInputs((prev) => ({ ...prev, [key]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleAddValue(key).catch((err) => { logger.error(err); });
                    }}
                    disabled={saving[key]}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => handleAddValue(key).catch((err) => { logger.error(err); })}
                    disabled={saving[key] || !inputs[key]?.trim()}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
      <DialogFooter>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            {globalSelfEdit ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                Self-edit enabled org-wide
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={togglingPermission}
                  onClick={() => void handleToggleCanEdit()}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    canEditSkills ? 'bg-primary' : 'bg-muted-foreground/30'
                  } ${togglingPermission ? 'opacity-50' : ''}`}
                  role="switch"
                  aria-checked={canEditSkills}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      canEditSkills ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-xs text-muted-foreground">Allow self-edit</span>
              </div>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
};
