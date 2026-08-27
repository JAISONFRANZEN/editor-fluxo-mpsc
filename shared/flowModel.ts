export type FlowNodeType = "start" | "end" | "task" | "gateway" | "data";
export type FlowLevel = "N0" | "N1" | "N2" | "N3" | null;
export type FlowEdgeType = "sequence" | "message";

export type FlowPool = {
  id: string;
  label: string;
  order: number;
};

export type FlowLane = {
  id: string;
  poolId: string;
  label: string;
  order: number;
  locked?: boolean;
};

export type FlowNode = {
  id: string;
  laneId: string;
  label: string;
  nodeType: FlowNodeType;
  x: number;
  y: number;
  responsible: string;
  notes: string;
  gatewayCondition: string;
  level: FlowLevel;
  requiresValidation: boolean;
};

export type FlowEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: FlowEdgeType;
  label: string;
  order?: number;
};

export type FlowModel = {
  pools: FlowPool[];
  lanes: FlowLane[];
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type FlowIssue = {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export const ADMINISTRATION_LANE_ID = "mpsc-admin-superior";

export function createDefaultFlowModel(): FlowModel {
  return {
    pools: [
      { id: "mpsc", label: "MPSC — Governança e Resposta Institucional", order: 0 },
      { id: "externo", label: "Órgãos externos de resposta", order: 1 },
    ],
    lanes: [
      { id: ADMINISTRATION_LANE_ID, poolId: "mpsc", label: "Administração Superior", order: 0, locked: true },
      { id: "mpsc-promotor", poolId: "mpsc", label: "Promotor de Justiça — atuação natural", order: 1 },
      { id: "mpsc-apoio", poolId: "mpsc", label: "Apoio da Promotoria — registro e comunicação", order: 2 },
      { id: "mpsc-cisi", poolId: "mpsc", label: "CISI — ponto focal institucional", order: 3 },
      { id: "mpsc-salas", poolId: "mpsc", label: "Sala de Situação / Sala de Crise / GGC", order: 4 },
      { id: "mpsc-areas", poolId: "mpsc", label: "Áreas internas de apoio", order: 5 },
      { id: "externo-resposta", poolId: "externo", label: "Defesa Civil, CBMSC, PMSC, SAMU, Município e demais órgãos", order: 0 },
    ],
    nodes: [
      { id: "inicio", laneId: "mpsc-promotor", label: "Identifica risco, alerta relevante, emergência ou crise", nodeType: "start", x: 70, y: 190, responsible: "Promotor de Justiça", notes: "O primeiro registro pode ser preliminar.", gatewayCondition: "", level: null, requiresValidation: false },
      { id: "seguranca", laneId: "mpsc-promotor", label: "Preservar a própria segurança e a segurança das pessoas", nodeType: "task", x: 290, y: 180, responsible: "Promotor de Justiça", notes: "Não ingressar ou permanecer em área de risco.", gatewayCondition: "", level: null, requiresValidation: false },
      { id: "perigo", laneId: "mpsc-promotor", label: "Há perigo imediato à vida ou à integridade?", nodeType: "gateway", x: 550, y: 180, responsible: "Promotor de Justiça", notes: "Decisão imediata de segurança.", gatewayCondition: "SIM / NÃO", level: null, requiresValidation: false },
      { id: "acionar-externo", laneId: "mpsc-promotor", label: "Acionar serviço público competente", nodeType: "task", x: 735, y: 120, responsible: "Promotor de Justiça", notes: "193, 190, 192 ou 199, conforme a natureza.", gatewayCondition: "", level: "N2", requiresValidation: false },
      { id: "resposta-externa", laneId: "externo-resposta", label: "Receber, atender, orientar ou controlar a ocorrência", nodeType: "task", x: 930, y: 745, responsible: "Órgãos externos", notes: "Competência legal e operacional própria.", gatewayCondition: "", level: null, requiresValidation: false },
      { id: "informacao-inicial", laneId: "mpsc-apoio", label: "Organizar informação mínima da ocorrência", nodeType: "data", x: 730, y: 355, responsible: "Apoio da Promotoria", notes: "Quem, onde, quando, o quê, risco, danos, órgãos acionados e apoio necessário.", gatewayCondition: "", level: null, requiresValidation: false },
      { id: "comunicar-cisi", laneId: "mpsc-promotor", label: "Comunicar a CISI pelo canal institucional definido [A VALIDAR]", nodeType: "task", x: 1010, y: 185, responsible: "Promotor de Justiça", notes: "Usar canal alternativo se o primário estiver indisponível.", gatewayCondition: "", level: "N1", requiresValidation: true },
      { id: "registrar", laneId: "mpsc-cisi", label: "Receber, confirmar e registrar a ocorrência", nodeType: "task", x: 1010, y: 470, responsible: "CISI", notes: "Abrir ou vincular registro institucional.", gatewayCondition: "", level: null, requiresValidation: true },
      { id: "classificar", laneId: "mpsc-cisi", label: "Qual é a classificação preliminar?", nodeType: "gateway", x: 1250, y: 470, responsible: "CISI", notes: "N0 a N3 são níveis operacionais preliminares.", gatewayCondition: "N0 / N1 / N2 / N3", level: null, requiresValidation: false },
      { id: "n0", laneId: "mpsc-cisi", label: "N0 — Registrar e orientar monitoramento", nodeType: "task", x: 1460, y: 385, responsible: "CISI", notes: "Acompanhar fontes oficiais e mudança relevante.", gatewayCondition: "", level: "N0", requiresValidation: false },
      { id: "n1", laneId: "mpsc-cisi", label: "N1 — Orientar e acompanhar alerta relevante", nodeType: "task", x: 1460, y: 455, responsible: "CISI", notes: "Verificar necessidade de articulação local.", gatewayCondition: "", level: "N1", requiresValidation: false },
      { id: "n2", laneId: "mpsc-areas", label: "N2 — Mobilizar áreas internas conforme o impacto", nodeType: "task", x: 1460, y: 650, responsible: "CISI e áreas internas", notes: "Pessoas, instalações, tecnologia, continuidade e comunicação.", gatewayCondition: "", level: "N2", requiresValidation: false },
      { id: "n3", laneId: "mpsc-cisi", label: "N3 — Consolidar situação e síntese executiva", nodeType: "task", x: 1460, y: 525, responsible: "CISI", notes: "Recomendar escalonamento à autoridade competente.", gatewayCondition: "", level: "N3", requiresValidation: false },
      { id: "decidir-escalonamento", laneId: ADMINISTRATION_LANE_ID, label: "É necessário ativar estrutura superior de coordenação?", nodeType: "gateway", x: 1740, y: 75, responsible: "Administração Superior", notes: "A autoridade e o procedimento de ativação devem ser confirmados.", gatewayCondition: "SIM / NÃO", level: "N3", requiresValidation: true },
      { id: "salas", laneId: "mpsc-salas", label: "Monitorar cenário, integrar informações e apoiar decisões", nodeType: "task", x: 1980, y: 565, responsible: "Sala de Situação / Sala de Crise / GGC", notes: "Ativação condicionada à governança vigente.", gatewayCondition: "", level: "N3", requiresValidation: true },
      { id: "monitorar", laneId: "mpsc-cisi", label: "Atualizar, acompanhar evolução e verificar estabilização", nodeType: "task", x: 2260, y: 470, responsible: "CISI", notes: "Registrar danos, pendências, orientações e atualização do Promotor.", gatewayCondition: "", level: null, requiresValidation: false },
      { id: "controlado", laneId: "mpsc-cisi", label: "Risco controlado e providências essenciais encaminhadas?", nodeType: "gateway", x: 2520, y: 470, responsible: "CISI", notes: "Se não, manter ciclo de monitoramento.", gatewayCondition: "SIM / NÃO", level: null, requiresValidation: false },
      { id: "encerrar", laneId: "mpsc-cisi", label: "Confirmar estabilização, registrar resultados e lições aprendidas", nodeType: "task", x: 2710, y: 470, responsible: "CISI", notes: "Encerrar ou transferir para recuperação.", gatewayCondition: "", level: null, requiresValidation: false },
      { id: "fim", laneId: "mpsc-cisi", label: "Ocorrência encerrada ou transferida para recuperação", nodeType: "end", x: 3000, y: 480, responsible: "CISI", notes: "", gatewayCondition: "", level: null, requiresValidation: false },
    ],
    edges: [
      { id: "e1", sourceId: "inicio", targetId: "seguranca", type: "sequence", label: "" },
      { id: "e2", sourceId: "seguranca", targetId: "perigo", type: "sequence", label: "" },
      { id: "e3", sourceId: "perigo", targetId: "acionar-externo", type: "sequence", label: "SIM" },
      { id: "e4", sourceId: "perigo", targetId: "comunicar-cisi", type: "sequence", label: "NÃO" },
      { id: "e5", sourceId: "acionar-externo", targetId: "resposta-externa", type: "message", label: "Solicitação de atendimento" },
      { id: "e6", sourceId: "resposta-externa", targetId: "comunicar-cisi", type: "message", label: "Retorno / orientação" },
      { id: "e7", sourceId: "informacao-inicial", targetId: "comunicar-cisi", type: "sequence", label: "Dados mínimos" },
      { id: "e8", sourceId: "comunicar-cisi", targetId: "registrar", type: "sequence", label: "" },
      { id: "e9", sourceId: "registrar", targetId: "classificar", type: "sequence", label: "" },
      { id: "e10", sourceId: "classificar", targetId: "n0", type: "sequence", label: "N0" },
      { id: "e11", sourceId: "classificar", targetId: "n1", type: "sequence", label: "N1" },
      { id: "e12", sourceId: "classificar", targetId: "n2", type: "sequence", label: "N2" },
      { id: "e13", sourceId: "classificar", targetId: "n3", type: "sequence", label: "N3" },
      { id: "e14", sourceId: "n3", targetId: "decidir-escalonamento", type: "sequence", label: "Síntese executiva" },
      { id: "e15", sourceId: "decidir-escalonamento", targetId: "salas", type: "sequence", label: "SIM" },
      { id: "e16", sourceId: "decidir-escalonamento", targetId: "monitorar", type: "sequence", label: "NÃO" },
      { id: "e17", sourceId: "n0", targetId: "monitorar", type: "sequence", label: "" },
      { id: "e18", sourceId: "n1", targetId: "monitorar", type: "sequence", label: "" },
      { id: "e19", sourceId: "n2", targetId: "monitorar", type: "sequence", label: "" },
      { id: "e20", sourceId: "salas", targetId: "monitorar", type: "sequence", label: "Orientações" },
      { id: "e21", sourceId: "monitorar", targetId: "controlado", type: "sequence", label: "" },
      { id: "e22", sourceId: "controlado", targetId: "monitorar", type: "sequence", label: "NÃO" },
      { id: "e23", sourceId: "controlado", targetId: "encerrar", type: "sequence", label: "SIM" },
      { id: "e24", sourceId: "encerrar", targetId: "fim", type: "sequence", label: "" },
    ],
  };
}

export function validateFlowModel(model: FlowModel): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const lanes = new Map(model.lanes.map(lane => [lane.id, lane]));
  const nodes = new Map(model.nodes.map(node => [node.id, node]));
  const mpscLanes = model.lanes.filter(lane => lane.poolId === "mpsc").sort((a, b) => a.order - b.order);

  if (mpscLanes[0]?.id !== ADMINISTRATION_LANE_ID) {
    issues.push({ id: "admin-order", severity: "error", message: "A Administração Superior deve permanecer na primeira baia do Pool MPSC." });
  }

  model.nodes.forEach(node => {
    if (!lanes.has(node.laneId)) {
      issues.push({ id: `node-lane-${node.id}`, severity: "error", message: "Ação sem baia válida.", nodeId: node.id });
    }
    if (node.requiresValidation && !node.label.includes("[A VALIDAR]")) {
      issues.push({ id: `validation-marker-${node.id}`, severity: "warning", message: "Campo sujeito à validação deve manter a marcação [A VALIDAR].", nodeId: node.id });
    }
    const label = node.label.toLowerCase();
    if (node.laneId === "mpsc-cisi" && (label.includes("determinar ativação") || label.includes("autorizar ativação"))) {
      issues.push({ id: `competence-${node.id}`, severity: "error", message: "A determinação ou autorização de ativação deve ficar na Administração Superior.", nodeId: node.id });
    }
  });

  model.edges.forEach(edge => {
    const source = nodes.get(edge.sourceId);
    const target = nodes.get(edge.targetId);
    if (!source || !target) {
      issues.push({ id: `edge-reference-${edge.id}`, severity: "error", message: "Conector com origem ou destino inexistente.", edgeId: edge.id });
      return;
    }
    const sourcePool = lanes.get(source.laneId)?.poolId;
    const targetPool = lanes.get(target.laneId)?.poolId;
    if (edge.type === "sequence" && sourcePool !== targetPool) {
      issues.push({ id: `edge-pool-${edge.id}`, severity: "error", message: "Fluxo de sequência não pode conectar Pools distintos; use fluxo de mensagem.", edgeId: edge.id });
    }
    if (edge.type === "message" && sourcePool === targetPool) {
      issues.push({ id: `edge-message-${edge.id}`, severity: "warning", message: "Fluxo de mensagem deve conectar participantes de Pools distintos.", edgeId: edge.id });
    }
  });

  model.nodes.forEach(node => {
    const label = node.label.toLowerCase();
    if (node.laneId === "mpsc-cisi" && /(comandar|executar resgate|determinar atendimento externo|autorizar atendimento externo|controlar ocorrência externa)/.test(label)) {
      issues.push({ id: `external-command-${node.id}`, severity: "error", message: "A CISI não pode ser representada como órgão de comando operacional externo.", nodeId: node.id });
    }
    if (node.laneId === "mpsc-promotor" && /(determinar ativação|autorizar ativação)/.test(label)) {
      issues.push({ id: `promotor-governance-${node.id}`, severity: "error", message: "A autorização de ativação deve permanecer na Administração Superior.", nodeId: node.id });
    }
  });

  model.nodes.filter(node => node.nodeType === "gateway").forEach(gateway => {
    const outgoing = model.edges.filter(edge => edge.sourceId === gateway.id);
    if (outgoing.length === 0) {
      issues.push({ id: `gateway-empty-${gateway.id}`, severity: "error", message: "Gateway sem saída definida.", nodeId: gateway.id });
    }
    outgoing.forEach(edge => {
      if (!edge.label.trim()) {
        issues.push({ id: `gateway-label-${edge.id}`, severity: "error", message: "Saída de gateway deve ter rótulo de condição.", nodeId: gateway.id, edgeId: edge.id });
      }
    });
  });

  model.nodes.forEach(node => {
    const incoming = model.edges.some(edge => edge.targetId === node.id);
    const outgoing = model.edges.some(edge => edge.sourceId === node.id);
    if (node.nodeType !== "start" && !incoming) {
      issues.push({ id: `disconnected-in-${node.id}`, severity: "warning", message: "Ação sem conector de entrada.", nodeId: node.id });
    }
    if (node.nodeType !== "end" && !outgoing) {
      issues.push({ id: `disconnected-out-${node.id}`, severity: "warning", message: "Ação sem conector de saída.", nodeId: node.id });
    }
  });

  return issues;
}
