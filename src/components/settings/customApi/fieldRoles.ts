import type { FieldPick } from '@/services/customApi.service';

/**
 * D35/D37: what a picked field IS to us, beyond how it renders — CA-5 Task 4.
 *
 * ⛔ ASKED IN THE CLIENT'S WORDS. The backend calls these `identifier`, `date`, `status`, `total`,
 * `currency`; an admin configuring their shop has never heard any of them. Six separate path
 * columns used to hold these, which meant typing `order_id` in three places and letting the
 * copies disagree — the tag on the field is the single place now.
 *
 * ⛔ TAGGING IS OPTIONAL AND THE PANEL WORKS WITHOUT IT. Fields alone already show data; roles
 * unlock the stored summary and the ownership check. An admin must be able to reach a working
 * lookup without meeting a concept they do not need yet.
 */

export type FieldRole = FieldPick['role'];

interface RoleOption {
  value: FieldRole;
  /** What the admin reads in the picker. */
  label: string;
  /**
   * ⛔ What the tag BUYS, in one sentence. Without this the admin sees what to do and never why,
   * so the most important privacy control in the product gets configured by accident or not at
   * all. Empty for `none`, which buys nothing and needs no explanation.
   */
  buys: string;
}

export const ROLE_OPTIONS: RoleOption[] = [
  { value: 'none', label: 'Just show it', buys: '' },
  {
    value: 'identifier',
    label: 'The number the customer quotes',
    buys: 'Lets Odly check that a record really belongs to the customer who wrote in, and lets an agent look one up by number.',
  },
  {
    value: 'date',
    label: 'When it happened',
    buys: 'Lets Odly show the most recent record first.',
  },
  {
    value: 'status',
    label: 'Where it has got to',
    buys: 'Shown to the agent as the headline answer, so they can reply without reading the whole record.',
  },
  {
    value: 'total',
    label: 'How much it was',
    buys: 'Shown as the amount, with its currency.',
  },
  {
    value: 'currency',
    label: 'Which currency',
    buys: 'Used to price the amount above, per record.',
  },
  /**
   * D45. ⛔ THIS ONE IS A PRIVACY CONTROL, and the copy has to earn the tag without overclaiming.
   *
   * Untagged, Odly compares the customer's address against EVERY email-shaped value in the record,
   * because nothing tells it which one is the customer. That guesses wrong in both directions:
   * a record carrying your shop's own address and not the buyer's gets flagged as "not this
   * customer's" (support-service #786), and a system that echoes back the address it was asked
   * about gets accepted as proof (support-service #789). Tagging the field ends the guessing.
   */
  {
    value: 'customer_email',
    label: "The customer's own email address",
    buys: "Odly checks this field — and only this field — to confirm the record belongs to the customer who wrote in. Without it, Odly has to guess from any address in the record, which can flag a genuine record or accept someone else's.",
  },
];

export const roleOption = (role: FieldRole): RoleOption =>
  ROLE_OPTIONS.find((option) => option.value === role) ?? ROLE_OPTIONS[0];

/**
 * Give one field a role, taking it off whichever field held it before.
 *
 * ⛔ AT MOST ONE FIELD PER ROLE. The backend reads a role with `find()`, so two fields tagged
 * `identifier` means the ownership check silently depends on ARRAY ORDER — it would work, and
 * then stop working when the admin re-ordered their picks. Moving the tag is also what an admin
 * means: they are saying "this one is the order number", not "this one as well".
 *
 * `none` is exempt: any number of fields can be untagged.
 */
export const applyRole = (fields: FieldPick[], path: string, role: FieldRole): FieldPick[] =>
  fields.map((field) => {
    if (field.path === path) return { ...field, role };
    if (role !== 'none' && field.role === role) return { ...field, role: 'none' };
    return field;
  });

/** The field currently holding a role, if any. */
export const fieldWithRole = (fields: FieldPick[], role: FieldRole): FieldPick | undefined =>
  role === 'none' ? undefined : fields.find((field) => field.role === role);
