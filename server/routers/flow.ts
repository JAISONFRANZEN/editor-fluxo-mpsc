import { z } from "zod";
import { createDefaultFlowModel, type FlowModel } from "../../shared/flowModel";
import { addComment, createFlow, getAccessibleFlow, getLatestFlow, listComments, listInstitutionalUsers, listVersions, resolveComment, restoreVersion, saveFlowVersion, updateInstitutionalRole, type FlowActor, type FlowStatus } from "../flowDb";
import { rolePermissions, type InstitutionalRole } from "../../shared/flowAccess";
import { protectedProcedure, router } from "../_core/trpc";

const modelSchema = z.object({ pools: z.array(z.any()), lanes: z.array(z.any()), nodes: z.array(z.any()), edges: z.array(z.any()), sourceMarkdown: z.string().optional(), sourceFileName: z.string().optional(), sourceTitle: z.string().optional(), importWarnings: z.array(z.string()).optional() });
const statusSchema = z.enum(["draft", "under_review", "approved", "archived"]);
const actorFrom = (user: { id: number; role: string }): FlowActor => ({ id: user.id, role: user.role as InstitutionalRole });
const attachmentSchema = z.object({ filename: z.string().min(1).max(255), mimeType: z.string().min(1).max(120), size: z.number().int().positive().max(5 * 1024 * 1024), contentBase64: z.string().min(1).max(7_100_000) });

export const flowRouter = router({
  getOrCreate: protectedProcedure.query(async ({ ctx }) => {
    const actor = actorFrom(ctx.user);
    const existing = await getLatestFlow(actor);
    const flow = existing ?? await createFlow(ctx.user.id, "Fluxo Básico de Acionamento — Nível Promotoria", createDefaultFlowModel());
    return flow ? { ...flow, access: { role: actor.role, permissions: rolePermissions[actor.role] } } : flow;
  }),
  save: protectedProcedure.input(z.object({ flowId: z.number(), model: modelSchema, status: statusSchema, summary: z.string().max(1000) })).mutation(async ({ ctx, input }) =>
    saveFlowVersion({ flowId: input.flowId, actor: actorFrom(ctx.user), model: input.model as FlowModel, status: input.status as FlowStatus, summary: input.summary }),
  ),
  versions: protectedProcedure.input(z.object({ flowId: z.number() })).query(async ({ ctx, input }) => listVersions(input.flowId, actorFrom(ctx.user))),
  restore: protectedProcedure.input(z.object({ flowId: z.number(), versionId: z.number() })).mutation(async ({ ctx, input }) => restoreVersion(input.flowId, input.versionId, actorFrom(ctx.user))),
  comments: protectedProcedure.input(z.object({ flowId: z.number() })).query(async ({ ctx, input }) => listComments(input.flowId, actorFrom(ctx.user))),
  addComment: protectedProcedure.input(z.object({ flowId: z.number(), elementId: z.string().optional(), content: z.string().min(2).max(4000), attachments: z.array(attachmentSchema).max(5).default([]) })).mutation(async ({ ctx, input }) =>
    addComment({ flowId: input.flowId, actor: actorFrom(ctx.user), elementId: input.elementId, content: input.content, attachments: input.attachments }),
  ),
  resolveComment: protectedProcedure.input(z.object({ commentId: z.number() })).mutation(async ({ ctx, input }) => resolveComment(input.commentId, actorFrom(ctx.user))),
  get: protectedProcedure.input(z.object({ flowId: z.number() })).query(async ({ ctx, input }) => getAccessibleFlow(input.flowId, actorFrom(ctx.user))),
  users: protectedProcedure.query(async ({ ctx }) => listInstitutionalUsers(actorFrom(ctx.user))),
  updateUserRole: protectedProcedure.input(z.object({ userId: z.number(), role: z.enum(["user", "revisor", "aprovador", "admin"]) })).mutation(async ({ ctx, input }) => updateInstitutionalRole(actorFrom(ctx.user), input.userId, input.role as InstitutionalRole)),
});
