import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ADMINISTRATION_LANE_ID, createDefaultFlowModel, validateFlowModel } from "../shared/flowModel";
import { compareFlowModels } from "../shared/flowDiff";
import { buildBpmnXml } from "../shared/bpmnExport";
import { popFlowHistory, pushFlowHistory } from "../shared/flowHistory";
import { importMarkdownToFlow } from "../shared/markdownImporter";

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

  it("converte instrução Markdown em visão BPMN e preserva a Administração Superior", () => {
    const imported = importMarkdownToFlow("# Fluxo\n\n## Fluxo Básico\n\n#### Baia 1 — ADMINISTRAÇÃO SUPERIOR\n\n#### Baia 2 — PROMOTOR DE JUSTIÇA — ATUAÇÃO NATURAL\n\n- **Promotor identifica risco, alerta relevante, emergência ou crise**\n- **Comunicar a CISI pelo canal institucional definido [A VALIDAR]**", "fluxo.md");
    expect(imported.model.lanes[0]?.id).toBe(ADMINISTRATION_LANE_ID);
    expect(imported.model.sourceFileName).toBe("fluxo.md");
    expect(imported.model.nodes.find(node => node.label.includes("Comunicar a CISI"))?.requiresValidation).toBe(true);
    expect(validateFlowModel(imported.model).filter(issue => issue.severity === "error")).toHaveLength(0);
  });

  it("desfaz alteração local preservando a primeira baia da Administração Superior", () => {
    const original = createDefaultFlowModel();
    const edited = createDefaultFlowModel();
    edited.nodes[0].label = "Identifica alerta climático";
    const history = pushFlowHistory([], original);
    const result = popFlowHistory(history);
    expect(result?.model.nodes[0]?.label).toBe("Identifica risco, alerta relevante, emergência ou crise");
    expect(result?.model.lanes[0]?.id).toBe(ADMINISTRATION_LANE_ID);
  });

  it("interpreta o Markdown institucional fornecido como visão de trabalho editável", () => {
    const source = readFileSync("/home/ubuntu/upload/PromptdeComando—ImagemA1doFluxoBásicodeAcionamento.md", "utf8");
    const imported = importMarkdownToFlow(source, "PromptdeComando—ImagemA1doFluxoBásicodeAcionamento.md");
    expect(imported.model.lanes[0]?.id).toBe(ADMINISTRATION_LANE_ID);
    expect(imported.model.nodes.length).toBeGreaterThan(30);
    expect(imported.model.nodes.some(node => node.label.startsWith("N0"))).toBe(true);
    expect(imported.model.nodes.some(node => node.label.startsWith("N3"))).toBe(true);
    expect(imported.model.nodes.some(node => node.laneId === "externo-resposta")).toBe(true);
    expect(imported.summary.validationFields).toBeGreaterThan(0);
  });

  it("exporta o fluxo em BPMN 2.0 com participantes, baias e waypoints corretos", () => {
    const xml = buildBpmnXml(createDefaultFlowModel());
    expect(xml).toContain('xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"');
    expect(xml).toContain('xmlns:di="http://www.omg.org/spec/DD/20100524/DI"');
    expect(xml).toContain('<bpmn:participant id="Participant_mpsc"');
    expect(xml).toContain(`<bpmn:lane id="${ADMINISTRATION_LANE_ID}"`);
    expect(xml).toContain("<bpmndi:BPMNEdge");
    expect(xml).toContain("<di:waypoint");
  });
});
