import { z } from "zod";
import { createDefaultFlowModel, type FlowModel } from "../../shared/flowModel";
import { addComment, createFlow, getLatestFlow, getOwnedFlow, listComments, listVersions, resolveComment, restoreVersion, saveFlowVersion, type FlowStatus } from "../flowDb";
import { protectedProcedure, router } from "../_core/trpc";

const modelSchema = z.object({ pools: z.array(z.any()), lanes: z.array(z.any()), nodes: z.array(z.any()), edges: z.array(z.any()) });
const statusSchema = z.enum(["draft", "under_review", "approved", "archived"]);

export const flowRouter = router({
  getOrCreate: protectedProcedure.query(async ({ ctx }) => {
    const existing = await getLatestFlow(ctx.user.id);
    if (existing) return existing;
    return createFlow(ctx.user.id, "Fluxo Básico de Acionamento — Nível Promotoria", createDefaultFlowModel());
  }),
  save: protectedProcedure.input(z.object({ flowId: z.number(), model: modelSchema, status: statusSchema, summary: z.string().max(1000) })).mutation(async ({ ctx, input }) =>
    saveFlowVersion({ flowId: input.flowId, ownerId: ctx.user.id, model: input.model as FlowModel, status: input.status as FlowStatus, summary: input.summary }),
  ),
  versions: protectedProcedure.input(z.object({ flowId: z.number() })).query(async ({ ctx, input }) => listVersions(input.flowId, ctx.user.id)),
  restore: protectedProcedure.input(z.object({ flowId: z.number(), versionId: z.number() })).mutation(async ({ ctx, input }) => restoreVersion(input.flowId, input.versionId, ctx.user.id)),
  comments: protectedProcedure.input(z.object({ flowId: z.number() })).query(async ({ ctx, input }) => listComments(input.flowId, ctx.user.id)),
  addComment: protectedProcedure.input(z.object({ flowId: z.number(), elementId: z.string().optional(), content: z.string().min(2).max(4000) })).mutation(async ({ ctx, input }) =>
    addComment({ flowId: input.flowId, ownerId: ctx.user.id, elementId: input.elementId, content: input.content }),
  ),
  resolveComment: protectedProcedure.input(z.object({ commentId: z.number() })).mutation(async ({ ctx, input }) => resolveComment(input.commentId, ctx.user.id)),
  get: protectedProcedure.input(z.object({ flowId: z.number() })).query(async ({ ctx, input }) => getOwnedFlow(input.flowId, ctx.user.id)),
});
