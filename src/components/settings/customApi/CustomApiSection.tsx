import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomApiSettings } from './CustomApiSettings';
import { CustomApiVendorForm } from './CustomApiVendorForm';
import { customApiLookupPath, customApiTemplatePath } from './lookupPaths';
import type { CustomApiConnection } from '@/services/customApi.service';

/**
 * Settings → Integrations → Custom APIs — the section, and everything it can open
 * (CA-5 Tasks 2 and 3).
 *
 * This is the mounting that CA-5 Task 1 was missing: `CustomApiSettings` existed and NOTHING
 * rendered it, which made it code rather than a screen. It owns the two vendor dialogs that list
 * can open — add a vendor, edit a vendor — and sends the lookup buttons to the lookup editor PAGE
 * (a dialog until 2026-09-29), so every button on the card has somewhere to go.
 *
 * ⛔ The two halves of D40 are wired differently ON PURPOSE and the difference is the point: the
 * vendor dialogs are handed over only to a viewer who may own a vendor, while the lookup wizard
 * goes to anyone who can see the section. The backend enforces both; this decides what to offer.
 */

interface Props {
  /** D40: may this viewer own a VENDOR? An `org_admin` may; a moderator manages lookups only. */
  canManageVendors: boolean;
}

export const CustomApiSection = ({ canManageVendors }: Props) => {
  const navigate = useNavigate();
  const [editing, setEditing] = useState<CustomApiConnection | null>(null);
  const [adding, setAdding] = useState(false);
  /**
   * Bumped after a save so the list re-reads from the API rather than being patched locally.
   * The API computes `effectivelyEnabled` and `chainBroken` across the whole connection, and a
   * locally merged row would disagree with it the moment anything cascades.
   */
  const [reloadKey, setReloadKey] = useState(0);
  const close = () => {
    setAdding(false);
    setEditing(null);
  };

  return (
    <>
      <CustomApiSettings
        key={reloadKey}
        canManageVendors={canManageVendors}
        onAddVendor={canManageVendors ? () => setAdding(true) : undefined}
        // ⛔ Only an org_admin gets an edit dialog — the vendor routes are `requireOrgAdmin`, so
        // handing a moderator this form would show them a screen whose save is a 403.
        onOpenVendor={canManageVendors ? (connection) => setEditing(connection) : undefined}
        // ⛔ Lookups are NOT admin-gated (D40): a moderator owns them, and the backend keeps the
        // endpoint routes on MANAGE_INTEGRATIONS for exactly that reason.
        onAddLookup={(connection) => navigate(customApiLookupPath(connection.id, 'new'))}
        // Same gate as onAddLookup: a template only pre-fills that same lookup form.
        onStartFromTemplate={(connection) => navigate(customApiTemplatePath(connection.id))}
        onEditLookup={(connection, endpoint) =>
          navigate(customApiLookupPath(connection.id, endpoint.id))
        }
      />

      {(adding || editing) && (
        <CustomApiVendorForm
          open
          // A fresh form per vendor: `useState` initialisers run once per mount, so reusing one
          // instance would keep the previous vendor's values when a different one is opened.
          key={editing?.id ?? 'new'}
          connection={editing ?? undefined}
          onClose={close}
          onSaved={() => setReloadKey((previous) => previous + 1)}
        />
      )}
    </>
  );
};
