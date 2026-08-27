import { describe, expect, it } from "vitest";
import { ADMINISTRATION_LANE_ID, createDefaultFlowModel, validateFlowModel } from "../shared/flowModel";
import { compareFlowModels } from "../shared/flowDiff";

describe("regras de validação do fluxo BPMN", () => {
  it("aceita o fluxo-base com a Administração Superior na primeira baia", () => {
    const issues = validateFlowModel(createDefaultFlowModel());
    expect(issues.filter(issue => issue.severity === "error")).toHaveLength(0);
    expect(createDefaultFlowModel().lanes[0]?.id).toBe(ADMINISTRATION_LANE_ID);
  });

  it("impede fluxo de sequência entre Pools distintos", () => {
    const model = createDefaultFlowModel();
    const edge = model.edges.find(item => item.id === "e5");
    if (edge) edge.type = "sequence";
    expect(validateFlowModel(model).some(issue => issue.message.includes("Pools distintos"))).toBe(true);
  });

  it("exige condição nas saídas de gateway", () => {
    const model = createDefaultFlowModel();
    const edge = model.edges.find(item => item.id === "e3");
    if (edge) edge.label = "";
    expect(validateFlowModel(model).some(issue => issue.message.includes("rótulo de condição"))).toBe(true);
  });

  it("impede que a CISI apareça como comando operacional externo", () => {
    const model = createDefaultFlowModel();
    const cisiNode = model.nodes.find(item => item.id === "registrar");
    if (cisiNode) cisiNode.label = "Comandar resgate externo";
    expect(validateFlowModel(model).some(issue => issue.message.includes("comando operacional externo"))).toBe(true);
  });

  it("identifica diferenças entre versões do fluxo", () => {
    const prior = createDefaultFlowModel();
    const current = createDefaultFlowModel();
    current.nodes[0].label = "Identifica alerta climático relevante";
    current.edges.pop();
    const diff = compareFlowModels(prior, current);
    expect(diff.changedNodes).toContain("Identifica alerta climático relevante");
    expect(diff.removedEdges).toHaveLength(1);
  });
});
