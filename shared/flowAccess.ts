export type InstitutionalRole = "user" | "revisor" | "aprovador" | "admin";
export type FlowStatus = "draft" | "under_review" | "approved" | "archived";

export const roleLabels: Record<InstitutionalRole, string> = {
  user: "Editor",
  revisor: "Revisor",
  aprovador: "Aprovador",
  admin: "Administrador",
};

export const rolePermissions: Record<InstitutionalRole, { comment: boolean; edit: boolean; approve: boolean; manageUsers: boolean }> = {
  user: { comment: true, edit: true, approve: false, manageUsers: false },
  revisor: { comment: true, edit: true, approve: false, manageUsers: false },
  aprovador: { comment: true, edit: false, approve: true, manageUsers: false },
  admin: { comment: true, edit: true, approve: true, manageUsers: true },
};

export function canSaveStatus(role: InstitutionalRole, status: FlowStatus) {
  if (role === "admin") return true;
  if (role === "aprovador") return status === "approved" || status === "archived";
  return status === "draft" || status === "under_review";
}
