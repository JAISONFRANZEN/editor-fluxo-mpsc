import { beforeEach, describe, expect, it, vi } from "vitest";
import { flowMembers, protocolFlows } from "../drizzle/schema";

const state = vi.hoisted(() => ({ assigned: false, protocolQueries: 0 }));
const flowRecord = { id: 7, ownerId: 1, title: "Fluxo institucional", status: "draft", currentVersion: 1, modelJson: {}, createdAt: new Date(), updatedAt: new Date() };

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === flowMembers) return state.assigned ? [{ id: 33 }] : [];
            if (table === protocolFlows) {
              state.protocolQueries += 1;
              return state.protocolQueries === 1 ? [] : [flowRecord];
            }
            return [];
          },
        }),
      }),
    }),
  })),
}));

import { getAccessibleFlow } from "./flowDb";

describe("escopo de acesso por fluxo", () => {
  beforeEach(() => {
    state.assigned = false;
    state.protocolQueries = 0;
  });

  it("nega acesso de revisor não atribuído e permite após atribuição explícita", async () => {
    await expect(getAccessibleFlow(7, { id: 2, role: "revisor" })).resolves.toBeUndefined();
    state.assigned = true;
    state.protocolQueries = 0;
    await expect(getAccessibleFlow(7, { id: 2, role: "revisor" })).resolves.toMatchObject({ id: 7, ownerId: 1 });
  });
});
