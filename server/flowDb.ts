import { and, desc, eq } from "drizzle-orm";
import { flowComments, flowVersions, protocolFlows } from "../drizzle/schema";
import type { FlowModel } from "../shared/flowModel";
import { getDb } from "./db";

export type FlowStatus = "draft" | "under_review" | "approved" | "archived";

export async function getLatestFlow(ownerId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(protocolFlows).where(eq(protocolFlows.ownerId, ownerId)).orderBy(desc(protocolFlows.updatedAt)).limit(1);
  return result[0];
}

export async function getOwnedFlow(flowId: number, ownerId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(protocolFlows).where(and(eq(protocolFlows.id, flowId), eq(protocolFlows.ownerId, ownerId))).limit(1);
  return result[0];
}

export async function createFlow(ownerId: number, title: string, model: FlowModel) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const inserted = await db.insert(protocolFlows).values({ ownerId, title, modelJson: model, status: "draft", currentVersion: 1 });
  const flowId = Number(inserted[0].insertId);
  await db.insert(flowVersions).values({ flowId, versionNumber: 1, status: "draft", changeSummary: "Versão inicial do fluxo.", snapshot: model, authorId: ownerId });
  return getOwnedFlow(flowId, ownerId);
}

export async function saveFlowVersion(input: { flowId: number; ownerId: number; model: FlowModel; status: FlowStatus; summary: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const current = await getOwnedFlow(input.flowId, input.ownerId);
  if (!current) throw new Error("Fluxo não encontrado.");
  const nextVersion = current.currentVersion + 1;
  await db.update(protocolFlows).set({ modelJson: input.model, status: input.status, currentVersion: nextVersion, updatedAt: new Date() }).where(eq(protocolFlows.id, input.flowId));
  await db.insert(flowVersions).values({ flowId: input.flowId, versionNumber: nextVersion, status: input.status, changeSummary: input.summary || "Atualização do fluxo.", snapshot: input.model, authorId: input.ownerId });
  return getOwnedFlow(input.flowId, input.ownerId);
}

export async function listVersions(flowId: number, ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  const flow = await getOwnedFlow(flowId, ownerId);
  if (!flow) return [];
  return db.select().from(flowVersions).where(eq(flowVersions.flowId, flowId)).orderBy(desc(flowVersions.versionNumber));
}

export async function restoreVersion(flowId: number, versionId: number, ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const flow = await getOwnedFlow(flowId, ownerId);
  if (!flow) throw new Error("Fluxo não encontrado.");
  const found = await db.select().from(flowVersions).where(and(eq(flowVersions.id, versionId), eq(flowVersions.flowId, flowId))).limit(1);
  const version = found[0];
  if (!version) throw new Error("Versão não encontrada.");
  return saveFlowVersion({ flowId, ownerId, model: version.snapshot as FlowModel, status: "draft", summary: `Restauração da versão ${version.versionNumber}.` });
}

export async function listComments(flowId: number, ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  const flow = await getOwnedFlow(flowId, ownerId);
  if (!flow) return [];
  return db.select().from(flowComments).where(eq(flowComments.flowId, flowId)).orderBy(desc(flowComments.createdAt));
}

export async function addComment(input: { flowId: number; ownerId: number; elementId?: string; content: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const flow = await getOwnedFlow(input.flowId, input.ownerId);
  if (!flow) throw new Error("Fluxo não encontrado.");
  await db.insert(flowComments).values({ flowId: input.flowId, elementId: input.elementId, content: input.content, authorId: input.ownerId });
  return listComments(input.flowId, input.ownerId);
}

export async function resolveComment(commentId: number, ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const comment = await db.select().from(flowComments).where(eq(flowComments.id, commentId)).limit(1);
  if (!comment[0]) throw new Error("Comentário não encontrado.");
  const flow = await getOwnedFlow(comment[0].flowId, ownerId);
  if (!flow) throw new Error("Comentário não encontrado.");
  await db.update(flowComments).set({ status: "resolved", resolvedAt: new Date() }).where(eq(flowComments.id, commentId));
  return listComments(flow.id, ownerId);
}
