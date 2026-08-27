import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultFlowModel } from "../shared/flowModel";
import { flowAuditEvents, protocolFlows } from "../drizzle/schema";

const state = vi.hoisted(() => ({ auditRows: [] as Array<Record<string, unknown>>, currentVersion: 1 }));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => table === protocolFlows
          ? { limit: async () => [{ id: 7, ownerId: 1, currentVersion: state.currentVersion, status: "draft", modelJson: createDefaultFlowModel() }] }
          : { orderBy: () => ({ limit: async () => state.auditRows }) },
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: (table: unknown) => ({
      values: async (value: Record<string, unknown>) => {
        if (table === flowAuditEvents) state.auditRows.push({ id: state.auditRows.length + 1, createdAt: new Date("2026-08-27T17:00:00Z"), ...value });
        return [{ insertId: state.auditRows.length + 100 }];
      },
    }),
  })),
}));

import { listFlowAuditEvents, saveFlowVersion } from "./flowDb";

describe("trilha de auditoria do fluxo", () => {
  beforeEach(() => {
    state.auditRows.length = 0;
    state.currentVersion = 1;
  });

  it("registra um evento somente de acréscimo ao salvar uma versão e o retorna na listagem", async () => {
    await saveFlowVersion({
      flowId: 7,
      actor: { id: 1, role: "admin" },
      model: createDefaultFlowModel(),
      status: "draft",
      summary: "Revisão do fluxo de acionamento.",
    });

    const events = await listFlowAuditEvents(7, { id: 1, role: "admin" });
    expect(state.auditRows).toHaveLength(1);
    expect(state.auditRows[0]).toMatchObject({ flowId: 7, actorId: 1, action: "version_saved" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "version_saved" });
  });
});
