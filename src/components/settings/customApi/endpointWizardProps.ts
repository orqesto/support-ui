import type {
  CustomApiConnection,
  CustomApiEndpoint,
  FieldPick,
} from '@/services/customApi.service';
import type { CustomApiCategory } from './categories';

/** Starting values for a NEW lookup (a template). Ignored when `endpoint` is given (edit). */
export interface EndpointInitial {
  label?: string;
  category?: CustomApiCategory | null;
  parameterSource?: 'identity' | 'manual';
  resultShape?: 'one' | 'many';
  statusLabels?: Record<string, string>;
  ownershipSourceEndpointId?: number | null;
  /** Sent on CREATE only: the wizard has no UI for these. */
  createExtras?: { surface?: 'thread' | 'contact' | 'both'; templateKey?: string };
}

export interface EndpointWizardProps {
  connection: CustomApiConnection;
  endpoint?: CustomApiEndpoint;
  onClose: () => void;
  onSaved: () => void;
  /**
   * The first Test (or Save) of a NEW lookup creates it. The page moves its URL to the created
   * id, so a reload keeps editing that lookup instead of starting a duplicate from `new`.
   */
  onCreated?: (endpointId: number) => void;
  initial?: EndpointInitial;
  /** The picked fields as they change — the template checklist reads them. */
  onPickedChange?: (picked: FieldPick[]) => void;
}
