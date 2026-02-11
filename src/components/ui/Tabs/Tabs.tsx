import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

export type Tab<T extends string = string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
  description?: string;
  badge?: string | number;
  disabled?: boolean;
};

type TabsProps<T extends string = string> = {
  tabs: Tab<T>[];
  activeTab: T;
  onTabChange: (tabId: T) => void;
  variant?: 'default' | 'simple';
  size?: 'sm' | 'md' | 'lg';
  showIcons?: boolean;
  showLabels?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
};

export const Tabs = <T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  variant = 'default',
  size = 'md',
  showIcons = true,
  showLabels = true,
  fullWidth = false,
  children,
}: TabsProps<T>) => {
  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-2 text-xs',
    md: 'px-1 py-2 sm:px-2 sm:py-3 md:px-4 md:py-4 text-[10px] sm:text-xs md:text-sm',
    lg: 'px-4 py-4 text-sm md:text-base',
  };

  const iconSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-5 h-5 sm:w-4 sm:h-4 md:w-5 md:h-5',
    lg: 'w-5 h-5 md:w-6 md:h-6',
  };

  // Simple variant (like Messages page tabs)
  if (variant === 'simple') {
    return (
      <div className="space-y-4">
        <div className="flex gap-1 border-b">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                onClick={() => !tab.disabled && onTabChange(tab.id)}
                disabled={tab.disabled}
                className={`px-2 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                } ${tab.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex gap-2 items-center">
                  {showIcons && Icon && <Icon className="w-4 h-4" />}
                  {showLabels && <span>{tab.label}</span>}
                  {tab.badge !== undefined && (
                    <span className="px-1.5 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                      {tab.badge}
                    </span>
                  )}
                </div>
              </Button>
            );
          })}
        </div>
        {children && <div>{children}</div>}
      </div>
    );
  }

  // Default variant (like Settings page tabs)
  return (
    <Card>
      <CardContent className="overflow-visible p-0">
        <div className="overflow-visible border-b">
          <div className="flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  onClick={() => !tab.disabled && onTabChange(tab.id)}
                  title={tab.description ?? tab.label}
                  disabled={tab.disabled}
                  className={`${fullWidth ? 'flex-1' : ''} h-auto rounded-none items-center justify-center gap-1 sm:gap-2 ${
                    sizeClasses[size]
                  } border-b-2 transition-colors min-w-0 ${
                    activeTab === tab.id
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  {showIcons && Icon && <Icon className={`${iconSizeClasses[size]} shrink-0`} />}
                  {showLabels && (
                    <span className="font-medium truncate hidden sm:block">{tab.label}</span>
                  )}
                  {tab.badge !== undefined && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-primary/10 text-primary">
                      {tab.badge}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        {children && (
          <div className="p-6" key={activeTab}>
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
