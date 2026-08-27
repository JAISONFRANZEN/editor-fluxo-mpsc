import { z } from "zod";
import { createDefaultFlowModel, validateFlowModel, type FlowModel } from "../../shared/flowModel";
import { addComment, assignFlowMember, createFlow, getAccessibleFlow, getLatestFlow, listComments, listFlowAuditEvents, listFlowMembers, listInstitutionalUsers, listVersions, removeFlowMember, resolveComment, restoreVersion, saveFlowVersion, updateInstitutionalRole, type FlowActor, type FlowStatus } from "../flowDb";
import { rolePermissions, type InstitutionalRole } from "../../shared/flowAccess";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { MAX_COMMENT_ATTACHMENT_TOTAL_BYTES } from "../../shared/attachmentPolicy";

const idSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_.-]+$/, "Identificador inválido.");
const boundedText = (max: number) => z.string().max(max);
const nodeTypeSchema = z.enum(["start", "intermediate", "end", "task", "decision", "subprocess", "gateway", "parallelGateway", "inclusiveGateway", "eventGateway", "data", "dataStore", "annotation"]);
const flowModelSchema = z.object({
  pools: z.array(z.object({ id: idSchema, label: boundedText(255), order: z.number().int().min(0).max(99) }).strict()).min(1).max(8),
  lanes: z.array(z.object({ id: idSchema, poolId: idSchema, label: boundedText(255), order: z.number().int().min(0).max(99), locked: z.boolean().optional() }).strict()).min(1).max(50),
  nodes: z.array(z.object({ id: idSchema, laneId: idSchema, label: boundedText(1_000), nodeType: nodeTypeSchema, x: z.number().finite().min(0).max(20_000), y: z.number().finite().min(0).max(20_000), responsible: boundedText(500), notes: boundedText(4_000), gatewayCondition: boundedText(500), level: z.enum(["N0", "N1", "N2", "N3"]).nullable(), requiresValidation: z.boolean() }).strict()).max(600),
  edges: z.array(z.object({ id: idSchema, sourceId: idSchema, targetId: idSchema, type: z.enum(["sequence", "message", "association"]), label: boundedText(500), order: z.number().int().min(0).max(5_000).optional() }).strict()).max(1_200),
  sourceMarkdown: z.string().max(2_000_000).optional(),
  sourceFileName: boundedText(255).optional(),
  sourceTitle: boundedText(255).optional(),
  importWarnings: z.array(boundedText(1_000)).max(100).optional(),
  milestones: z.array(z.object({ id: idSchema, label: boundedText(255), x: z.number().finite().min(0).max(20_000), width: z.number().finite().min(100).max(20_000) }).strict()).max(20).optional(),
}).strict().superRefine((model, context) => {
  if (new Set(model.pools.map(pool => pool.id)).size !== model.pools.length) context.addIssue({ code: "custom", message: "Há Pools com identificador duplicado." });
  if (new Set(model.lanes.map(lane => lane.id)).size !== model.lanes.length) context.addIssue({ code: "custom", message: "Há baias com identificador duplicado." });
  if (new Set(model.nodes.map(node => node.id)).size !== model.nodes.length) context.addIssue({ code: "custom", message: "Há elementos com identificador duplicado." });
  if (new Set(model.edges.map(edge => edge.id)).size !== model.edges.length) context.addIssue({ code: "custom", message: "Há conectores com identificador duplicado." });
  if (JSON.stringify(model).length > 3_000_000) context.addIssue({ code: "custom", message: "O modelo excede o limite máximo de armazenamento." });
});
const statusSchema = z.enum(["draft", "under_review", "approved", "archived"]);
const actorFrom = (user: { id: number; role: string }): FlowActor => ({ id: user.id, role: user.role as InstitutionalRole });
const attachmentSchema = z.object({ filename: z.string().min(1).max(255), mimeType: z.string().min(1).max(120), size: z.number().int().positive().max(5 * 1024 * 1024), contentBase64: z.string().min(1).max(7_100_000) });
const estimatedBase64Bytes = (value: string) => Math.max(0, Math.floor((value.length * 3) / 4) - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0));
const attachmentsSchema = z.array(attachmentSchema).max(5).superRefine((attachments, context) => {
  const declaredTotal = attachments.reduce((total, attachment) => total + attachment.size, 0);
  const encodedTotal = attachments.reduce((total, attachment) => total + estimatedBase64Bytes(attachment.contentBase64), 0);
  if (declaredTotal > MAX_COMMENT_ATTACHMENT_TOTAL_BYTES || encodedTotal > MAX_COMMENT_ATTACHMENT_TOTAL_BYTES) {
    context.addIssue({ code: "custom", message: "O conjunto de anexos deve ter no máximo 10 MB por comentário." });
  }
});

export const flowRouter = router({
  getOrCreate: protectedProcedure.query(async ({ ctx }) => {
    const actor = actorFrom(ctx.user);
    const existing = await getLatestFlow(actor);
    const flow = existing ?? await createFlow(ctx.user.id, "Fluxo Básico de Acionamento — Nível Promotoria", createDefaultFlowModel());
    return flow ? { ...flow, access: { role: actor.role, permissions: rolePermissions[actor.role] } } : flow;
  }),
  save: protectedProcedure.input(z.object({ flowId: z.number().int().positive(), model: flowModelSchema, status: statusSchema, summary: z.string().max(1000) })).mutation(async ({ ctx, input }) => {
    const issues = validateFlowModel(input.model as FlowModel);
    const errors = issues.filter(issue => issue.severity === "error");
    if (errors.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: `O fluxo contém ${errors.length} erro(s) crítico(s) e não pode ser registrado.` });
    return saveFlowVersion({ flowId: input.flowId, actor: actorFrom(ctx.user), model: input.model as FlowModel, status: input.status as FlowStatus, summary: input.summary });
  }),
  versions: protectedProcedure.input(z.object({ flowId: z.number() })).query(async ({ ctx, input }) => listVersions(input.flowId, actorFrom(ctx.user))),
  audit: protectedProcedure.input(z.object({ flowId: z.number().int().positive() })).query(async ({ ctx, input }) => listFlowAuditEvents(input.flowId, actorFrom(ctx.user))),
  restore: protectedProcedure.input(z.object({ flowId: z.number(), versionId: z.number() })).mutation(async ({ ctx, input }) => restoreVersion(input.flowId, input.versionId, actorFrom(ctx.user))),
  comments: protectedProcedure.input(z.object({ flowId: z.number() })).query(async ({ ctx, input }) => listComments(input.flowId, actorFrom(ctx.user))),
  addComment: protectedProcedure.input(z.object({ flowId: z.number().int().positive(), elementId: idSchema.optional(), content: z.string().min(2).max(4000), attachments: attachmentsSchema.default([]) })).mutation(async ({ ctx, input }) =>
    addComment({ flowId: input.flowId, actor: actorFrom(ctx.user), elementId: input.elementId, content: input.content, attachments: input.attachments }),
  ),
  resolveComment: protectedProcedure.input(z.object({ commentId: z.number() })).mutation(async ({ ctx, input }) => resolveComment(input.commentId, actorFrom(ctx.user))),
  get: protectedProcedure.input(z.object({ flowId: z.number() })).query(async ({ ctx, input }) => getAccessibleFlow(input.flowId, actorFrom(ctx.user))),
  users: protectedProcedure.query(async ({ ctx }) => listInstitutionalUsers(actorFrom(ctx.user))),
  members: protectedProcedure.input(z.object({ flowId: z.number().int().positive() })).query(async ({ ctx, input }) => listFlowMembers(input.flowId, actorFrom(ctx.user))),
  assignMember: protectedProcedure.input(z.object({ flowId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => assignFlowMember(input.flowId, input.userId, actorFrom(ctx.user))),
  removeMember: protectedProcedure.input(z.object({ flowId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => removeFlowMember(input.flowId, input.userId, actorFrom(ctx.user))),
  updateUserRole: protectedProcedure.input(z.object({ userId: z.number(), role: z.enum(["user", "revisor", "aprovador", "admin"]) })).mutation(async ({ ctx, input }) => updateInstitutionalRole(actorFrom(ctx.user), input.userId, input.role as InstitutionalRole)),
});
