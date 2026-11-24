/**
 * The console user directory's per-workspace memberships (`GET /api/admin/platform/users`).
 */
/** One workspace a directory row belongs to, with what the person holds there. */
export type PlatformUserWorkspace = {
  organizationId: number;
  organizationName: string;
  role: string;
  /** The direct role an IdP take-over is shadowing, if any. */
  preAllianceRole: string | null;
  /** This membership is owned by an IdP — the role is not editable in-app here. */
  idpManaged: boolean;
  /**
   * A mentor in this workspace (1.1.330) — shown here, set in the workspace's Members page.
   * Always a boolean after the service: false on a backend that does not send it.
   */
  isMentor?: boolean;
};

/** Missing `isMentor` (an older backend) reads as false. */
export const normaliseWorkspaces = (rows: PlatformUserWorkspace[] | undefined): PlatformUserWorkspace[] =>
  (rows ?? []).map((workspace) => ({ ...workspace, isMentor: workspace.isMentor === true }));
