import { Check, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  GROUP_ORDER,
  filterValue,
  visibleDefs,
  type FilterDef,
  type FilterGroup,
  type FilterKey,
  type FilterOption,
} from './filterSchema';
import { tokenText, type Suggestion } from './filterTokens';
import type { FilterState } from '@/stores/messagesStore';

/**
 * The menu under the token bar. Three states, one component:
 *
 *  - **panel** — one filter's values, reached by clicking a token or a browse row.
 *  - **suggestions** — what you typed, matched against filter names AND values.
 *  - **browse** — the whole filter set, grouped. This is the state that replaces the
 *    old always-open panel: when you do not know what you want, you can still read it.
 */

const HEADING = 'px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/80';
const ROW = 'w-full flex items-center gap-2 text-left px-2.5 py-2 h-auto rounded justify-start text-[13px] font-normal';

/** Status and Priority are what agents reach for constantly, so they are a visible
 *  segmented track rather than another row that has to be opened first. */
const COMMON_KEYS = (isKanban: boolean): FilterKey[] => [
  isKanban ? 'threadStatus' : 'lifecycle',
  'priority',
];

const OptionRow = ({
  option,
  selected,
  onPick,
}: {
  option: FilterOption;
  selected: boolean;
  onPick: () => void;
}) => (
  <Button
    variant="ghost"
    onClick={onPick}
    className={`${ROW} ${selected ? 'bg-accent/60' : ''}`}
  >
    {option.dot && (
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: option.dot }} />
    )}
    <span className={`flex-1 truncate ${selected ? 'font-semibold' : ''}`}>{option.label}</span>
    {selected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
  </Button>
);

/** One filter's values, plus the sub-choice when the parent has one. */
const ValuePanel = ({
  def,
  filters,
  onBack,
  onPick,
  onPickSub,
}: {
  def: FilterDef;
  filters: FilterState;
  onBack: () => void;
  onPick: (value: string) => void;
  onPickSub: (value: string) => void;
}) => {
  const current = filterValue(filters, def.key);
  const subCurrent = def.sub
    ? (filters as Record<string, unknown>)[def.sub.key]
    : undefined;

  return (
    <>
      <div className="flex gap-2 items-center px-3 py-2.5 border-b border-border">
        <Button
          variant="ghost"
          onClick={onBack}
          aria-label="Back to all filters"
          className="grid place-items-center p-0 w-6 h-6 rounded-md text-muted-foreground hover:bg-accent"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="flex-1 text-[13px] font-semibold">{def.label}</span>
      </div>

      {def.help && (
        <p className="px-3 py-2 border-b text-[11.5px] leading-relaxed text-muted-foreground border-border/60 bg-muted/40">
          {def.help}
        </p>
      )}

      <div className="overflow-y-auto p-1 max-h-[260px]">
        {(def.options ?? []).map((option, index) => {
          const priorSection = def.options?.[index - 1]?.section;
          const showSection = option.section && option.section !== priorSection;
          return (
            <div key={option.value}>
              {showSection && <div className={HEADING}>{option.section}</div>}
              <OptionRow
                option={option}
                selected={current === option.value}
                onPick={() => onPick(option.value)}
              />
            </div>
          );
        })}

        {def.sub && current && (
          <>
            <div className={HEADING}>{def.sub.label}</div>
            {def.sub.options.map((option) => (
              <OptionRow
                key={option.value}
                option={option}
                selected={subCurrent === option.value}
                onPick={() => onPickSub(option.value)}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
};

/** Segmented track — the whole option set visible and one click away. */
const CommonRow = ({
  def,
  filters,
  onPick,
}: {
  def: FilterDef;
  filters: FilterState;
  onPick: (value: string) => void;
}) => {
  const current = filterValue(filters, def.key);
  return (
    <div className="flex gap-2.5 items-center px-3 py-1">
      <span className="w-14 text-[11.5px] shrink-0 text-muted-foreground">{def.label}</span>
      {/* Dark mode makes the track a bordered well on --background instead of a raised
          --muted block: on a dark card, --muted reads as another button, not a groove. */}
      <div
        className="grid flex-1 gap-0.5 p-0.5 rounded-md bg-muted dark:bg-background dark:border dark:border-border/60 dark:p-px"
        style={{ gridTemplateColumns: `repeat(${def.options?.length ?? 1}, minmax(0, 1fr))` }}
      >
        {(def.options ?? []).map((option) => {
          const on = current === option.value;
          return (
            <Button
              key={option.value}
              variant="ghost"
              title={option.label}
              onClick={() => onPick(option.value)}
              className={`flex gap-1 justify-center items-center px-1 h-[26px] rounded text-[11px] min-w-0 ${
                on
                  ? 'bg-card text-foreground font-semibold shadow-sm ring-1 ring-border/70 dark:bg-accent dark:shadow-none dark:ring-0'
                  : 'font-medium text-muted-foreground hover:text-foreground dark:hover:bg-secondary'
              }`}
            >
              {option.dot && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: option.dot }}
                />
              )}
              <span className="truncate">{option.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};

const FlagsRow = ({
  defs,
  filters,
  onToggle,
}: {
  defs: FilterDef[];
  filters: FilterState;
  onToggle: (def: FilterDef) => void;
}) => (
  <div className="flex gap-2.5 items-center px-3 py-1">
    <span className="w-14 text-[11.5px] shrink-0 text-muted-foreground">Flags</span>
    <div className="flex flex-1 gap-1">
      {defs.map((def) => {
        const on = filterValue(filters, def.key) !== undefined;
        // Each tone carries its own dark pair — a single translucent fill that works on
        // white goes muddy on a dark card, so the dark side lifts both alpha and hue.
        const onTone =
          def.tone === 'red'
            ? 'bg-destructive/[0.12] text-red-600 dark:bg-destructive/[0.18] dark:text-red-400'
            : def.tone === 'amber'
              ? 'bg-warning/15 text-amber-600 dark:bg-warning/[0.18] dark:text-amber-400'
              : 'bg-primary/[0.12] text-primary dark:bg-primary/[0.22] dark:text-foreground';
        return (
          <Button
            key={def.key}
            variant="ghost"
            onClick={() => onToggle(def)}
            className={`h-[26px] px-2.5 rounded-md text-[11.5px] ${
              on
                ? `${onTone} font-semibold border border-transparent`
                : 'font-medium text-muted-foreground hover:text-foreground bg-muted border border-transparent dark:bg-background dark:border-border/60'
            }`}
          >
            {def.label}
          </Button>
        );
      })}
    </div>
  </div>
);

export const FilterMenu = ({
  defs,
  filters,
  isKanban,
  query,
  suggestions,
  highlighted,
  panelKey,
  onOpenPanel,
  onBack,
  onPick,
  onPickSub,
  onToggleFlag,
  onPickSuggestion,
}: {
  defs: FilterDef[];
  filters: FilterState;
  isKanban: boolean;
  query: string;
  suggestions: Suggestion[];
  highlighted: number;
  panelKey: FilterKey | null;
  onOpenPanel: (key: FilterKey) => void;
  onBack: () => void;
  onPick: (def: FilterDef, value: string) => void;
  onPickSub: (def: FilterDef, value: string) => void;
  onToggleFlag: (def: FilterDef) => void;
  onPickSuggestion: (index: number) => void;
}) => {
  const panelDef = panelKey ? defs.find((def) => def.key === panelKey) : undefined;

  if (panelDef) {
    return (
      <ValuePanel
        def={panelDef}
        filters={filters}
        onBack={onBack}
        onPick={(value) => onPick(panelDef, value)}
        onPickSub={(value) => onPickSub(panelDef, value)}
      />
    );
  }

  if (query.trim()) {
    if (suggestions.length === 0) {
      return (
        <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
          No filter matches &ldquo;{query.trim()}&rdquo;
        </p>
      );
    }
    return (
      <div className="overflow-y-auto p-1 max-h-[300px]">
        {suggestions.map((suggestion, index) => {
          const active = index === highlighted;
          const activeClass = active ? 'bg-accent' : '';
          if (suggestion.kind === 'free') {
            return (
              <Button
                key="free"
                variant="ghost"
                onClick={() => onPickSuggestion(index)}
                className={`${ROW} border-b !rounded-none border-border/60 ${activeClass}`}
              >
                <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate">
                  Search messages for <b className="font-semibold">{suggestion.query}</b>
                </span>
              </Button>
            );
          }
          if (suggestion.kind === 'value') {
            return (
              <Button
                key={`${suggestion.def.key}:${suggestion.option.value}`}
                variant="ghost"
                onClick={() => onPickSuggestion(index)}
                className={`${ROW} ${activeClass}`}
              >
                <span className="text-[12px] font-medium text-muted-foreground shrink-0">
                  {suggestion.def.label.toLowerCase()}
                </span>
                {suggestion.option.dot && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: suggestion.option.dot }}
                  />
                )}
                <span className="flex-1 font-semibold truncate">{suggestion.option.label}</span>
              </Button>
            );
          }
          return (
            <Button
              key={suggestion.def.key}
              variant="ghost"
              onClick={() => onPickSuggestion(index)}
              className={`${ROW} ${activeClass}`}
            >
              <span className="flex-1 truncate">{suggestion.def.label}</span>
              {filterValue(filters, suggestion.def.key) !== undefined && (
                <span className="text-[11px] font-semibold text-primary">on</span>
              )}
              {suggestion.kind === 'filter' && (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
            </Button>
          );
        })}
      </div>
    );
  }

  // ── browse ────────────────────────────────────────────────────────────────
  const usable = visibleDefs(defs, isKanban);
  const common = COMMON_KEYS(isKanban)
    .map((key) => usable.find((def) => def.key === key))
    .filter((def): def is FilterDef => Boolean(def));
  const flags = usable.filter((def) => def.kind === 'flag');
  const rest = usable.filter(
    (def) => def.kind === 'select' && !common.some((row) => row.key === def.key)
  );

  return (
    <div className="overflow-y-auto pb-1 max-h-[340px]">
      <div className={HEADING}>Common</div>
      {common.map((def) => (
        <CommonRow key={def.key} def={def} filters={filters} onPick={(value) => onPick(def, value)} />
      ))}
      {flags.length > 0 && <FlagsRow defs={flags} filters={filters} onToggle={onToggleFlag} />}
      <div className="h-1.5" />
      {GROUP_ORDER.map((group: FilterGroup) => {
        const inGroup = rest.filter((def) => def.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group}>
            <div className={HEADING}>{group}</div>
            {inGroup.map((def) => {
              const value = filterValue(filters, def.key);
              return (
                <Button
                  key={def.key}
                  variant="ghost"
                  onClick={() => onOpenPanel(def.key)}
                  className="flex gap-3 justify-between items-center px-3 w-full h-[34px] text-left rounded-none hover:bg-accent"
                >
                  <span className="text-[13px] font-normal shrink-0">{def.label}</span>
                  <span
                    className={`min-w-0 truncate text-[12.5px] ${
                      value ? 'text-primary font-semibold' : 'text-muted-foreground/70 font-normal'
                    }`}
                  >
                    {value ? tokenText(def, value, filters) : 'All'}
                  </span>
                </Button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
