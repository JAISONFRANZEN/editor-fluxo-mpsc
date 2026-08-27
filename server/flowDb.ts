import { and, count, desc, eq, inArray } from "drizzle-orm";
import { flowCommentAttachments, flowComments, flowVersions, protocolFlows, users } from "../drizzle/schema";
import type { FlowModel } from "../shared/flowModel";
import { canSaveStatus, rolePermissions, type FlowStatus, type InstitutionalRole } from "../shared/flowAccess";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { MAX_COMMENT_ATTACHMENT_BYTES, MAX_COMMENT_ATTACHMENT_TOTAL_BYTES, sanitizeAttachmentFilename, validateCommentAttachment } from "../shared/attachmentPolicy";

export type { FlowStatus } from "../shared/flowAccess";
export type FlowActor = { id: number; role: InstitutionalRole };
export type CommentAttachmentInput = { filename: string; mimeType: string; size: number; contentBase64: string };

function canAccessAll(actor: FlowActor) {
  return actor.role === "admin" || actor.role === "revisor" || actor.role === "aprovador";
}

function requirePermission(actor: FlowActor, permission: "comment" | "edit" | "approve" | "manageUsers") {
  if (!rolePermissions[actor.role][permission]) throw new Error("Seu perfil institucional não possui permissão para esta ação.");
}

export async function getLatestFlow(actor: FlowActor) {
  const db = await getDb();
  if (!db) return undefined;
  const query = db.select().from(protocolFlows);
  const result = canAccessAll(actor)
    ? await query.orderBy(desc(protocolFlows.updatedAt)).limit(1)
    : await query.where(eq(protocolFlows.ownerId, actor.id)).orderBy(desc(protocolFlows.updatedAt)).limit(1);
  return result[0];
}

export async function getAccessibleFlow(flowId: number, actor: FlowActor) {
  const db = await getDb();
  if (!db) return undefined;
  const result = canAccessAll(actor)
    ? await db.select().from(protocolFlows).where(eq(protocolFlows.id, flowId)).limit(1)
    : await db.select().from(protocolFlows).where(and(eq(protocolFlows.id, flowId), eq(protocolFlows.ownerId, actor.id))).limit(1);
  return result[0];
}

export async function createFlow(ownerId: number, title: string, model: FlowModel) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const inserted = await db.insert(protocolFlows).values({ ownerId, title, modelJson: model, status: "draft", currentVersion: 1 });
  const flowId = Number(inserted[0].insertId);
  await db.insert(flowVersions).values({ flowId, versionNumber: 1, status: "draft", changeSummary: "Versão inicial do fluxo.", snapshot: model, authorId: ownerId });
  return getAccessibleFlow(flowId, { id: ownerId, role: "admin" });
}

export async function saveFlowVersion(input: { flowId: number; actor: FlowActor; model: FlowModel; status: FlowStatus; summary: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const permission = input.status === "approved" || input.status === "archived" ? "approve" : "edit";
  requirePermission(input.actor, permission);
  if (!canSaveStatus(input.actor.role, input.status)) throw new Error("Seu perfil não pode registrar este status de versão.");
  const current = await getAccessibleFlow(input.flowId, input.actor);
  if (!current) throw new Error("Fluxo não encontrado.");
  const nextVersion = current.currentVersion + 1;
  await db.update(protocolFlows).set({ modelJson: input.model, status: input.status, currentVersion: nextVersion, updatedAt: new Date() }).where(eq(protocolFlows.id, input.flowId));
  await db.insert(flowVersions).values({ flowId: input.flowId, versionNumber: nextVersion, status: input.status, changeSummary: input.summary || "Atualização do fluxo.", snapshot: input.model, authorId: input.actor.id });
  return getAccessibleFlow(input.flowId, input.actor);
}

export async function listVersions(flowId: number, actor: FlowActor) {
  const db = await getDb();
  if (!db) return [];
  const flow = await getAccessibleFlow(flowId, actor);
  if (!flow) return [];
  return db.select().from(flowVersions).where(eq(flowVersions.flowId, flowId)).orderBy(desc(flowVersions.versionNumber));
}

export async function restoreVersion(flowId: number, versionId: number, actor: FlowActor) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  requirePermission(actor, "edit");
  const flow = await getAccessibleFlow(flowId, actor);
  if (!flow) throw new Error("Fluxo não encontrado.");
  const found = await db.select().from(flowVersions).where(and(eq(flowVersions.id, versionId), eq(flowVersions.flowId, flowId))).limit(1);
  const version = found[0];
  if (!version) throw new Error("Versão não encontrada.");
  return saveFlowVersion({ flowId, actor, model: version.snapshot as FlowModel, status: "draft", summary: `Restauração da versão ${version.versionNumber}.` });
}

export async function listComments(flowId: number, actor: FlowActor) {
  const db = await getDb();
  if (!db) return [];
  const flow = await getAccessibleFlow(flowId, actor);
  if (!flow) return [];
  const comments = await db.select().from(flowComments).where(eq(flowComments.flowId, flowId)).orderBy(desc(flowComments.createdAt));
  if (comments.length === 0) return [];
  const attachments = await db.select().from(flowCommentAttachments).where(inArray(flowCommentAttachments.commentId, comments.map(comment => comment.id)));
  return comments.map(comment => ({ ...comment, attachments: attachments.filter(attachment => attachment.commentId === comment.id) }));
}

export async function addComment(input: { flowId: number; actor: FlowActor; elementId?: string; content: string; attachments: CommentAttachmentInput[] }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  requirePermission(input.actor, "comment");
  const flow = await getAccessibleFlow(input.flowId, input.actor);
  if (!flow) throw new Error("Fluxo não encontrado.");
  const preparedAttachments = input.attachments.map(attachment => {
    const validationError = validateCommentAttachment(attachment);
    if (validationError) throw new Error(validationError);
    const bytes = Buffer.from(attachment.contentBase64, "base64");
    if (bytes.length !== attachment.size || bytes.length > MAX_COMMENT_ATTACHMENT_BYTES) throw new Error("O tamanho real do anexo não confere com o tamanho informado.");
    return { attachment, bytes, cleanName: sanitizeAttachmentFilename(attachment.filename) };
  });
  const totalSize = preparedAttachments.reduce((total, item) => total + item.bytes.length, 0);
  if (totalSize > MAX_COMMENT_ATTACHMENT_TOTAL_BYTES) throw new Error("O conjunto de anexos deve ter no máximo 10 MB por comentário.");
  const inserted = await db.insert(flowComments).values({ flowId: input.flowId, elementId: input.elementId, content: input.content, authorId: input.actor.id });
  const commentId = Number(inserted[0].insertId);
  for (const { attachment, bytes, cleanName } of preparedAttachments) {
    const stored = await storagePut(`protocolos/${input.flowId}/comentarios/${commentId}/${Date.now()}-${cleanName}`, bytes, attachment.mimeType);
    await db.insert(flowCommentAttachments).values({ commentId, storageKey: stored.key, url: stored.url, filename: attachment.filename.slice(0, 255), mimeType: attachment.mimeType, size: attachment.size, authorId: input.actor.id });
  }
  return listComments(input.flowId, input.actor);
}

export async function resolveComment(commentId: number, actor: FlowActor) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  requirePermission(actor, "comment");
  const comment = await db.select().from(flowComments).where(eq(flowComments.id, commentId)).limit(1);
  if (!comment[0]) throw new Error("Comentário não encontrado.");
  const flow = await getAccessibleFlow(comment[0].flowId, actor);
  if (!flow) throw new Error("Comentário não encontrado.");
  await db.update(flowComments).set({ status: "resolved", resolvedAt: new Date() }).where(eq(flowComments.id, commentId));
  return listComments(flow.id, actor);
}

export async function listInstitutionalUsers(actor: FlowActor) {
  const db = await getDb();
  if (!db) return [];
  requirePermission(actor, "manageUsers");
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).orderBy(users.name);
}

export async function updateInstitutionalRole(actor: FlowActor, userId: number, role: InstitutionalRole) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  requirePermission(actor, "manageUsers");
  if (actor.id === userId) throw new Error("Não é permitido alterar o próprio perfil institucional.");
  const target = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target[0]) throw new Error("Usuário institucional não encontrado.");
  if (target[0].role === "admin" && role !== "admin") {
    const admins = await db.select({ total: count() }).from(users).where(eq(users.role, "admin"));
    if ((admins[0]?.total ?? 0) <= 1) throw new Error("Não é permitido remover o último administrador do editor.");
  }
  await db.update(users).set({ role }).where(eq(users.id, userId));
  return listInstitutionalUsers(actor);
}
