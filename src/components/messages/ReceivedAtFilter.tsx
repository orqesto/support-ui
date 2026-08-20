import { AtSign } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
import { messageService } from '@/services/message.service';

/**
 * "Received at" — narrow the inbox to threads that arrived at one of our
 * addresses.
 *
 * This is the cut the source picker cannot make. One integration answers to
 * every alias pointed at its mailbox (`info@`, `sales@`, `support@`), and they
 * all share its `messageSourceId`.
 *
 * The options are derived from traffic rather than configuration, because
 * configuration does not know: a source stores one address, and nobody
 * registers the aliases with us. The only record that `info@` exists is that
 * mail arrived addressed to it.
 */

type ReceivedAtFilterProps = {
  value?: string;
  onChange: (value: string) => void;
  /** Renders the select inside the caller's grid cell. */
  renderCell: (label: string, icon: React.ReactNode, control: React.ReactNode) => React.ReactNode;
};

export const ReceivedAtFilter = ({ value, onChange, renderCell }: ReceivedAtFilterProps) => {
  const [options, setOptions] = useState<string[]>([]);
  // Reloaded on department change for the same reason the source list is: the
  // backend scopes the alias list by department, so a stale list would offer
  // addresses the current selection is not allowed to see.
  const selectedDeptKey = useDepartmentContextKey();

  useEffect(() => {
    void messageService.getReceivedAtOptions().then(setOptions);
  }, [selectedDeptKey]);

  // Hidden below two addresses: on a single-address mailbox this separates
  // nothing. An empty list also means the backend route isn't live yet (the
  // service swallows the 404), so the filter stays out of the way until it is.
  if (options.length < 2) return null;

  return (
    <>
      {renderCell(
        'Received at',
        <AtSign className="w-3 h-3 text-muted-foreground" />,
        <ReactSelect
          value={value ?? 'all'}
          onChange={onChange}
          options={[
            { value: 'all', label: 'Any address' },
            ...options.map((address) => ({ value: address, label: address })),
          ]}
          className="w-full"
        />
      )}
    </>
  );
};
