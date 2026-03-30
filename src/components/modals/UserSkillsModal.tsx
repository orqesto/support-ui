/* eslint-disable no-console */
import { useState, useEffect } from 'react';
import { X, Plus, Tag } from 'lucide-react';
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

  useEffect(() => {
    if (!isOpen || !user) return;

    const load = async () => {
      setLoading(true);
      try {
        const [keys, values] = await Promise.all([
          organizationService.getRoutingKeys(),
          userService.getSkillValues(user.id),
        ]);
        setRoutingKeys(keys);
        setSkills(values);
        setInputs({});
      } catch (err) {
        console.error('Failed to load skills:', err);
      } finally {
        setLoading(false);
      }
    };
    load().catch(console.error);
  }, [isOpen, user]);

  const handleAddValue = async (key: string) => {
    const val = (inputs[key] ?? '').trim().toLowerCase();
    if (!val || !user) return;
    const existing = skills[key] ?? [];
    if (existing.includes(val)) return;
    const updated = [...existing, val];
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await userService.setSkillValues(user.id, key, updated);
      setSkills((s) => ({ ...s, [key]: updated }));
      setInputs((i) => ({ ...i, [key]: '' }));
    } catch (err) {
      console.error('Failed to add skill value:', err);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const handleRemoveValue = async (key: string, value: string) => {
    if (!user) return;
    const updated = (skills[key] ?? []).filter((v) => v !== value);
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await userService.setSkillValues(user.id, key, updated);
      setSkills((s) => ({ ...s, [key]: updated }));
    } catch (err) {
      console.error('Failed to remove skill value:', err);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
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
                        onClick={() => handleRemoveValue(key, val).catch(console.error)}
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
                    onChange={(e) => setInputs((i) => ({ ...i, [key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddValue(key).catch(console.error);
                    }}
                    disabled={saving[key]}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => handleAddValue(key).catch(console.error)}
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
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
