import { describe, expect, it, vi } from "vitest";
import { protocolFlows } from "../drizzle/schema";
import { createDefaultFlowModel } from "../shared/flowModel";

const insertValues = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({ limit: async () => table === protocolFlows ? [{ id: 7, ownerId: 1, currentVersion: 3, status: "draft", modelJson: createDefaultFlowModel() }] : [] }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => [{ affectedRows: 0 }] }) }),
    insert: () => ({ values: insertValues }),
  })),
}));

import { saveFlowVersion } from "./flowDb";

describe("concorrência de versões", () => {
  it("interrompe o salvamento quando a versão vigente mudou antes da atualização", async () => {
    await expect(saveFlowVersion({ flowId: 7, actor: { id: 1, role: "admin" }, model: createDefaultFlowModel(), status: "draft", summary: "Alteração concorrente" })).rejects.toThrow("outra atualização");
    expect(insertValues).not.toHaveBeenCalled();
  });
});
