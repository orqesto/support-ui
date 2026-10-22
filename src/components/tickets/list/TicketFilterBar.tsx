import { ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu';
import { SearchInput } from '@/components/ui/SearchInput';
import type { TicketFilters } from '@/stores/ticketsStore';
import { filterValue, withoutFilter, type TicketFilterKey } from './ticketFilterKeys';

type TicketFilterBarProps = {
  filters: TicketFilters;
  keys: TicketFilterKey[];
  search: string;
  onChange: (filters: TicketFilters) => void;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
};

const OptionItems = ({
  filterKey,
  filters,
  onChange,
}: {
  filterKey: TicketFilterKey;
  filters: TicketFilters;
  onChange: (filters: TicketFilters) => void;
}) => (
  <>
    {filterKey.options.map((option) => (
      <MenuItem
        key={option.value}
        checked={filterValue(filters, filterKey.field) === option.value}
        icon={
          option.dot ? (
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: option.dot }} />
          ) : undefined
        }
        onSelect={() => onChange({ ...filters, [filterKey.field]: option.value })}
      >
        {option.label}
      </MenuItem>
    ))}
  </>
);

/**
 * The tickets list's search field with its filters as chips, the Messages pattern: a chip's value
 * reopens that filter's options in place, its × removes just that filter, and Filter adds one
 * (Filter by → field → value).
 */
export const TicketFilterBar = ({
  filters,
  keys,
  search,
  onChange,
  onSearchChange,
  onSearch,
  onClear,
}: TicketFilterBarProps) => {
  const [picking, setPicking] = useState<TicketFilterKey | null>(null);
  const active = keys.filter((key) => filterValue(filters, key.field) !== undefined);
  const dirty = active.length > 0 || !!search.trim();

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="flex flex-wrap flex-1 gap-1.5 items-center min-w-0 basis-[380px]">
        {active.map((key) => {
          const value = filterValue(filters, key.field);
          const option = key.options.find((opt) => opt.value === value);
          return (
            <span
              key={key.field}
              className="flex overflow-hidden items-stretch h-7 rounded-md border shrink-0 max-w-full text-[12.5px] border-border bg-card dark:bg-accent"
            >
              <span className="flex items-center px-2 font-medium border-r text-muted-foreground border-border bg-muted dark:bg-input">
                {key.label}
              </span>
              <Menu
                ariaLabel={`${key.label} options`}
                width={260}
                trigger={({ toggle }) => (
                  <Button
                    variant="ghost"
                    onClick={toggle}
                    aria-label={`Change ${key.label}`}
                    className="flex gap-1.5 items-center px-2 h-auto font-semibold rounded-none hover:bg-accent max-w-[240px]"
                  >
                    {option?.dot && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: option.dot }}
                      />
                    )}
                    <span className="truncate">{option?.label ?? value}</span>
                  </Button>
                )}
              >
                <OptionItems filterKey={key} filters={filters} onChange={onChange} />
              </Menu>
              <Button
                variant="ghost"
                onClick={() => onChange(withoutFilter(filters, key.field))}
                aria-label={`Remove ${key.label} filter`}
                className="grid place-items-center px-1.5 h-auto rounded-none border-l text-muted-foreground border-border hover:text-destructive hover:bg-destructive/10"
              >
                <X className="w-2.5 h-2.5" />
              </Button>
            </span>
          );
        })}
        <span data-ticket-search className="flex flex-1 min-w-[160px]">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            onSearch={onSearch}
            placeholder={active.length ? 'Search…' : 'Search by ID, title or description'}
            className="flex-1"
          />
        </span>
      </div>
      <Menu
        ariaLabel="Filter tickets"
        width={280}
        trigger={({ toggle }) => (
          <Button
            variant="outline"
            onClick={() => {
              setPicking(null);
              toggle();
            }}
            aria-label="Filter"
          >
            <Filter className="mr-2 w-4 h-4" />
            Filter
          </Button>
        )}
      >
        {picking ? (
          <>
            <MenuItem
              keepOpen
              icon={<ChevronLeft className="w-3.5 h-3.5" />}
              onSelect={() => setPicking(null)}
            >
              <b>{picking.label}</b>
            </MenuItem>
            <MenuSeparator />
            <OptionItems filterKey={picking} filters={filters} onChange={onChange} />
          </>
        ) : (
          <>
            <MenuLabel>Filter by</MenuLabel>
            {keys.map((key) => {
              const value = filterValue(filters, key.field);
              return (
                <MenuItem
                  key={key.field}
                  keepOpen
                  hint={
                    <span className="flex gap-1 items-center">
                      {value && key.options.find((opt) => opt.value === value)?.label}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  }
                  onSelect={() => setPicking(key)}
                >
                  {key.label}
                </MenuItem>
              );
            })}
          </>
        )}
      </Menu>
      {dirty && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  );
};
