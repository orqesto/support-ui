/** Where a platform setting's value came from: the console (db), the environment, or the default. */
export type FieldSource = 'db' | 'env' | 'default';
export type ResolvedField<T> = { value: T | null; source: FieldSource };
