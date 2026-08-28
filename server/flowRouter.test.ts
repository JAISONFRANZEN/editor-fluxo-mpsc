import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { createBlankFlowModel, createDefaultFlowModel } from "../shared/flowModel";

const auditState = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));
const listFlowAuditEvents = vi.hoisted(() => vi.fn(async () => auditState.events));
const saveFlowVersion = vi.hoisted(() => vi.fn(async (input: { flowId: number; actor: { id: number }; model: unknown; status: string; summary: string }) => {
  auditState.events.push({ id: auditState.events.length + 1, flowId: input.flowId, actorId: input.actor.id, action: "version_saved", context: { status: input.status, summary: input.summary }, createdAt: new Date("2026-08-27T17:00:00Z") });
  return { id: input.flowId, modelJson: input.model };
}));
const createFlow = vi.hoisted(() => vi.fn(async (ownerId: number, title: string, model: unknown) => ({ id: 33, ownerId, title, status: "draft", currentVersion: 1, modelJson: model })));

vi.mock("./flowDb", () => ({
  addComment: vi.fn(),
  createFlow,
  getAccessibleFlow: vi.fn(),
  getLatestFlow: vi.fn(),
  listComments: vi.fn(),
  listFlowAuditEvents,
  listFlowMembers: vi.fn(),
  listInstitutionalUsers: vi.fn(),
  listVersions: vi.fn(),
  resolveComment: vi.fn(),
  restoreVersion: vi.fn(),
  assignFlowMember: vi.fn(),
  removeFlowMember: vi.fn(),
  saveFlowVersion,
  updateInstitutionalRole: vi.fn(),
}));

import { flowRouter } from "./routers/flow";

function createContext(): TrpcContext {
  return {
    user: {
      id: 17,
      openId: "usuario-auditoria",
      email: "auditoria@mpsc.mp.br",
      name: "Usuário de Auditoria",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("rota tRPC flow.audit", () => {
  beforeEach(() => {
    auditState.events.length = 0;
    listFlowAuditEvents.mockClear();
    saveFlowVersion.mockClear();
    createFlow.mockClear();
  });

  it("lista os eventos de auditoria do fluxo usando o ator autenticado", async () => {
    const events = [{ id: 1, flowId: 12, actorId: 17, action: "version_saved", context: { version: 2 }, createdAt: new Date("2026-08-27T17:00:00Z") }];
    listFlowAuditEvents.mockResolvedValue(events);

    const caller = flowRouter.createCaller(createContext());
    await expect(caller.audit({ flowId: 12 })).resolves.toEqual(events);
    expect(listFlowAuditEvents).toHaveBeenCalledWith(12, { id: 17, role: "admin" });
  });

  it("expõe via flow.audit o evento append-only gerado por flow.save", async () => {
    const caller = flowRouter.createCaller(createContext());
    const model = createDefaultFlowModel();

    await caller.save({ flowId: 12, model, status: "draft", summary: "Registro da revisão." });
    const events = await caller.audit({ flowId: 12 });

    expect(saveFlowVersion).toHaveBeenCalledWith(expect.objectContaining({ flowId: 12, actor: { id: 17, role: "admin" }, status: "draft" }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ flowId: 12, actorId: 17, action: "version_saved" });
  });

  it("rejeita conjunto de anexos declarado acima de 10 MB antes da persistência", async () => {
    const caller = flowRouter.createCaller(createContext());
    const oversized = Array.from({ length: 3 }, (_, index) => ({ filename: `evidencia-${index}.pdf`, mimeType: "application/pdf", size: 5 * 1024 * 1024, contentBase64: "AAAA" }));
    await expect(caller.addComment({ flowId: 12, content: "Evidências para revisão.", attachments: oversized })).rejects.toThrow("10 MB");
  });

  it("cria outro fluxo em branco sem reutilizar o modelo em edição", async () => {
    const caller = flowRouter.createCaller(createContext());
    const created = await caller.create({ title: "Plano de contingência local" });

    expect(createFlow).toHaveBeenCalledWith(17, "Plano de contingência local", createBlankFlowModel());
    expect(created).toMatchObject({ id: 33, title: "Plano de contingência local", status: "draft" });
    expect((created.modelJson as ReturnType<typeof createBlankFlowModel>).nodes).toEqual([]);
  });

});
