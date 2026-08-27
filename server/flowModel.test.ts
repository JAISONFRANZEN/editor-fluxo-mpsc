import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ADMINISTRATION_LANE_ID, createDefaultFlowModel, validateFlowModel } from "../shared/flowModel";
import { compareFlowModels } from "../shared/flowDiff";
import { buildBpmnXml } from "../shared/bpmnExport";
import { calculateCanvasDropX, snapCanvasX } from "../shared/canvasGeometry";
import { popFlowHistory, pushFlowHistory, redoFlowChange, undoFlowChange } from "../shared/flowHistory";
import { importMarkdownToFlow } from "../shared/markdownImporter";
import { sanitizeAttachmentFilename, validateCommentAttachment } from "../shared/attachmentPolicy";
import { canSaveStatus, rolePermissions } from "../shared/flowAccess";
import { inferConnectionType } from "../shared/edgeRules";
import { buildInstitutionalInfographicPrompt } from "../shared/infographicPrompt";
import { filterFlowNodes, listFlowResponsibles } from "../shared/flowFilters";

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

  it("infere fluxo de mensagem ao ligar elementos de Pools distintos", () => {
    const model = createDefaultFlowModel();
    expect(inferConnectionType(model, "seguranca", "resposta-externa")).toBe("message");
    expect(inferConnectionType(model, "seguranca", "perigo")).toBe("sequence");
    expect(inferConnectionType(model, "seguranca", "seguranca")).toBeNull();
  });

  it("exige condição nas saídas de gateway", () => {
    const model = createDefaultFlowModel();
    const edge = model.edges.find(item => item.id === "e3");
    if (edge) edge.label = "";
    expect(validateFlowModel(model).some(issue => issue.message.includes("rótulo de condição"))).toBe(true);
  });

  it("detecta condições repetidas em um gateway", () => {
    const model = createDefaultFlowModel();
    const gatewayEdges = model.edges.filter(item => item.sourceId === "perigo");
    gatewayEdges.forEach(edge => { edge.label = "SIM"; });
    expect(validateFlowModel(model).some(issue => issue.message.includes("rótulos de saída repetidos"))).toBe(true);
  });

  it("impede conectores entrando em início, saindo de fim e mensagens sem rótulo", () => {
    const model = createDefaultFlowModel();
    const existingMessage = model.edges.find(edge => edge.id === "e5");
    if (existingMessage) existingMessage.label = "";
    model.edges.push(
      { id: "inicio-invalido", sourceId: "seguranca", targetId: "inicio", type: "sequence", label: "" },
      { id: "fim-invalido", sourceId: "fim", targetId: "monitorar", type: "sequence", label: "" },
    );
    const messages = validateFlowModel(model).map(issue => issue.message);
    expect(messages).toContain("Evento de início não pode receber conector de entrada.");
    expect(messages).toContain("Evento de fim não pode possuir conector de saída.");
    expect(messages).toContain("Fluxo de mensagem deve ter rótulo identificável para fins de revisão.");
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

  it("refaz uma alteração desfeita sem alterar a hierarquia institucional", () => {
    const original = createDefaultFlowModel();
    const edited = createDefaultFlowModel();
    edited.nodes[0].label = "Identifica alerta climático";
    const undone = undoFlowChange(edited, pushFlowHistory([], original), []);
    const redone = undone ? redoFlowChange(undone.model, undone.undoStack, undone.redoStack) : null;
    expect(undone?.model.nodes[0]?.label).toBe("Identifica risco, alerta relevante, emergência ou crise");
    expect(redone?.model.nodes[0]?.label).toBe("Identifica alerta climático");
    expect(redone?.model.lanes[0]?.id).toBe(ADMINISTRATION_LANE_ID);
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

  it("gera prompt de infográfico claro e preserva os avisos institucionais pendentes", () => {
    const prompt = buildInstitutionalInfographicPrompt(createDefaultFlowModel());
    expect(prompt).toContain("INFOGRÁFICO INSTITUCIONAL");
    expect(prompt).toContain("CISI — ponto focal técnico-operacional interno");
    expect(prompt).toContain("[A VALIDAR]");
    expect(prompt).toContain("Não inventar telefones");
  });

  it("filtra o canvas por nível e responsável sem alterar o modelo original", () => {
    const model = createDefaultFlowModel();
    const selected = filterFlowNodes(model.nodes, { level: "N3", responsible: "all" });
    expect(selected.map(node => node.id)).toContain("n3");
    expect(selected.every(node => node.level === "N3")).toBe(true);
    expect(filterFlowNodes(model.nodes, { level: "all", responsible: "Promotor de Justiça" }).length).toBeGreaterThan(1);
    expect(listFlowResponsibles(model)).toContain("CISI");
    expect(model.nodes).toHaveLength(19);
  });

  it("exporta os elementos avançados da legenda BPMN", () => {
    const model = createDefaultFlowModel();
    model.nodes.push(
      { id: "decisao", laneId: "mpsc-admin-superior", label: "Deliberar sobre escalonamento", nodeType: "decision", x: 90, y: 0, responsible: "Administração Superior", notes: "", gatewayCondition: "", level: null, requiresValidation: false },
      { id: "paralelo", laneId: "mpsc-cisi", label: "Providências simultâneas", nodeType: "parallelGateway", x: 320, y: 0, responsible: "CISI", notes: "", gatewayCondition: "", level: null, requiresValidation: false },
      { id: "nota", laneId: "mpsc-cisi", label: "Validar canal de acionamento", nodeType: "annotation", x: 560, y: 0, responsible: "CISI", notes: "", gatewayCondition: "", level: null, requiresValidation: true },
      { id: "intermediario", laneId: "mpsc-cisi", label: "Aguardar atualização oficial", nodeType: "intermediate", x: 800, y: 0, responsible: "CISI", notes: "", gatewayCondition: "", level: null, requiresValidation: false },
      { id: "subprocesso", laneId: "mpsc-cisi", label: "Executar plano de continuidade", nodeType: "subprocess", x: 1040, y: 0, responsible: "CISI", notes: "", gatewayCondition: "", level: null, requiresValidation: false },
      { id: "inclusivo", laneId: "mpsc-cisi", label: "Condições aplicáveis", nodeType: "inclusiveGateway", x: 1280, y: 0, responsible: "CISI", notes: "", gatewayCondition: "A / B", level: null, requiresValidation: false },
      { id: "evento", laneId: "mpsc-cisi", label: "Evento prioritário", nodeType: "eventGateway", x: 1520, y: 0, responsible: "CISI", notes: "", gatewayCondition: "Primeiro evento", level: null, requiresValidation: false },
      { id: "repositorio", laneId: "mpsc-cisi", label: "Repositório de ocorrências", nodeType: "dataStore", x: 1760, y: 0, responsible: "CISI", notes: "", gatewayCondition: "", level: null, requiresValidation: false },
    );
    model.edges.push({ id: "associacao", sourceId: "paralelo", targetId: "nota", type: "association", label: "Observação" });
    const xml = buildBpmnXml(model);
    expect(xml).toContain('<bpmn:parallelGateway id="paralelo"');
    expect(xml).toContain('<bpmn:textAnnotation id="nota">');
    expect(xml).toContain('<bpmn:association id="associacao"');
    expect(xml).toContain('<bpmn:intermediateCatchEvent id="intermediario"');
    expect(xml).toContain('<bpmn:subProcess id="subprocesso"');
    expect(xml).toContain('<bpmn:inclusiveGateway id="inclusivo"');
    expect(xml).toContain('<bpmn:eventBasedGateway id="evento"');
    expect(xml).toContain('<bpmn:dataStoreReference id="repositorio"');
  });

  it("preserva a posição de soltura do elemento com zoom e rolagem", () => {
    expect(calculateCanvasDropX({ clientX: 510, canvasLeft: 110, scrollLeft: 200, zoomPercent: 100 })).toBe(505);
    expect(calculateCanvasDropX({ clientX: 510, canvasLeft: 110, scrollLeft: 200, zoomPercent: 200 })).toBe(205);
  });

  it("impede a criação de elemento antes da margem mínima do canvas", () => {
    expect(calculateCanvasDropX({ clientX: 10, canvasLeft: 110, scrollLeft: 0, zoomPercent: 100 })).toBe(30);
  });

  it("aplica encaixe opcional de 20 px à posição de elementos", () => {
    expect(snapCanvasX(511)).toBe(520);
    expect(snapCanvasX(505)).toBe(500);
    expect(snapCanvasX(14)).toBe(30);
    expect(snapCanvasX(511, false)).toBe(511);
  });

  it("aplica as permissões institucionais de revisor e aprovador", () => {
    expect(rolePermissions.revisor.edit).toBe(true);
    expect(rolePermissions.revisor.approve).toBe(false);
    expect(rolePermissions.aprovador.edit).toBe(false);
    expect(rolePermissions.aprovador.approve).toBe(true);
    expect(canSaveStatus("revisor", "under_review")).toBe(true);
    expect(canSaveStatus("revisor", "approved")).toBe(false);
    expect(canSaveStatus("aprovador", "approved")).toBe(true);
  });

  it("valida metadados e nome seguro de anexo de comentário", () => {
    expect(validateCommentAttachment({ filename: "risco.pdf", mimeType: "application/pdf", size: 2048 })).toBeNull();
    expect(validateCommentAttachment({ filename: "risco.exe", mimeType: "application/x-msdownload", size: 2048 })).toContain("não permitido");
    expect(validateCommentAttachment({ filename: "grande.pdf", mimeType: "application/pdf", size: 6 * 1024 * 1024 })).toContain("5 MB");
    expect(sanitizeAttachmentFilename("Parecer Técnico nº 1.pdf")).toBe("Parecer_T_cnico_n__1.pdf");
  });
});
