import {
  ADMINISTRATION_LANE_ID,
  createDefaultFlowModel,
  type FlowEdge,
  type FlowLane,
  type FlowLevel,
  type FlowModel,
  type FlowNode,
  type FlowNodeType,
} from "./flowModel";

export type MarkdownImportResult = {
  model: FlowModel;
  title: string;
  warnings: string[];
  summary: { pools: number; lanes: number; nodes: number; validationFields: number };
};

type LaneDefinition = { id: string; label: string; poolId: "mpsc" | "externo"; order: number; locked?: boolean };

const laneDefinitions: LaneDefinition[] = [
  { id: ADMINISTRATION_LANE_ID, label: "Administração Superior", poolId: "mpsc", order: 0, locked: true },
  { id: "mpsc-promotor", label: "Promotor de Justiça — atuação natural", poolId: "mpsc", order: 1 },
  { id: "mpsc-apoio", label: "Apoio da Promotoria — registro e comunicação", poolId: "mpsc", order: 2 },
  { id: "mpsc-cisi", label: "CISI — ponto focal institucional", poolId: "mpsc", order: 3 },
  { id: "mpsc-salas", label: "Sala de Situação / GEDCLIMA / Sala de Crise / GGC", poolId: "mpsc", order: 4 },
  { id: "mpsc-areas", label: "Áreas internas de apoio", poolId: "mpsc", order: 5 },
  { id: "externo-resposta", label: "Defesa Civil, CBMSC, PMSC, SAMU, Município e demais órgãos", poolId: "externo", order: 0 },
];

const canonical = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[\[\]`*_#]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const clean = (value: string) => value
  .replace(/^\s*[-*]\s+/, "")
  .replace(/^\s*\d+\.\s+/, "")
  .replace(/\*\*/g, "")
  .replace(/`/g, "")
  .trim();

const getHeading = (markdown: string) => {
  const heading = markdown.split(/\r?\n/).find(line => /^##\s+/.test(line) || /^#\s+/.test(line));
  return heading ? clean(heading.replace(/^#{1,2}\s+/, "")) : "Fluxo importado de Markdown";
};

function laneIdFromHeading(value: string) {
  const text = canonical(value);
  if (text.includes("administracao superior")) return ADMINISTRATION_LANE_ID;
  if (text.includes("promotor")) return "mpsc-promotor";
  if (text.includes("apoio da promotoria")) return "mpsc-apoio";
  if (text.includes("cisi")) return "mpsc-cisi";
  if (text.includes("sala de situacao") || text.includes("gedclima") || text.includes("sala de crise") || text.includes("ggc")) return "mpsc-salas";
  if (text.includes("areas internas")) return "mpsc-areas";
  return null;
}

function levelFromLabel(label: string): FlowLevel {
  const match = label.match(/\b(N[0-3])\b/i);
  return match ? match[1].toUpperCase() as Exclude<FlowLevel, null> : null;
}

function nodeTypeFromLabel(label: string, laneId: string): FlowNodeType {
  const text = canonical(label);
  if (text.includes("informacao minima da ocorrencia") || text.includes("registro de ocorrencia") || text.includes("sintese executiva")) return "data";
  if (label.includes("?") || text.startsWith("qual e") || text.startsWith("ha perigo") || text.startsWith("e necessario") || text.startsWith("o risco esta")) return "gateway";
  if (laneId === "mpsc-promotor" && (text.includes("identificar risco") || text.includes("promotor identifica"))) return "start";
  if (text.includes("ocorrencia encerrada") || text.includes("ocorrencia concluida")) return "end";
  return "task";
}

function responsibleForLane(laneId: string) {
  const map: Record<string, string> = {
    [ADMINISTRATION_LANE_ID]: "Administração Superior",
    "mpsc-promotor": "Promotor de Justiça",
    "mpsc-apoio": "Apoio da Promotoria",
    "mpsc-cisi": "CISI",
    "mpsc-salas": "Sala de Situação / GEDCLIMA / Sala de Crise / GGC",
    "mpsc-areas": "Áreas internas competentes",
    "externo-resposta": "Órgãos externos competentes",
  };
  return map[laneId] ?? "[A VALIDAR]";
}

function extractLaneActivities(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const activityByLane = new Map<string, string[]>();
  let currentLane: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = line.match(/^####\s*Baia\s*\d+\s*[—-]\s*(.+)$/i);
    if (headingMatch) {
      currentLane = laneIdFromHeading(headingMatch[1]);
      if (currentLane && !activityByLane.has(currentLane)) activityByLane.set(currentLane, []);
      continue;
    }
    if (!currentLane) continue;
    if (/^#{1,3}\s+/.test(line) || /^---\s*$/.test(line)) {
      if (/^###\s+Pool\s+2/i.test(line)) currentLane = "externo-resposta";
      else if (/^###\s+/.test(line)) currentLane = null;
      continue;
    }
    const bullet = line.match(/^\s*-\s+\*\*(.+?)\*\*/);
    if (bullet) {
      const activity = clean(bullet[1]);
      if (activity && !activityByLane.get(currentLane)?.includes(activity)) activityByLane.get(currentLane)?.push(activity);
    }
  }

  const dataMatches = Array.from(markdown.matchAll(/^\*\*(INFORMAÇÃO MÍNIMA DA OCORRÊNCIA|REGISTRO DE OCORRÊNCIA\s*\/\s*FICHA DE ACIONAMENTO|SÍNTESE EXECUTIVA PARA DECISÃO)\*\*$/gim));
  dataMatches.forEach(match => {
    const label = clean(match[1]);
    const laneId = canonical(label).includes("informacao minima") ? "mpsc-apoio" : "mpsc-cisi";
    const activities = activityByLane.get(laneId) ?? [];
    if (!activities.includes(label)) activities.push(label);
    activityByLane.set(laneId, activities);
  });

  const gatewayMatches = Array.from(markdown.matchAll(/Gateway exclusivo:\s*\*\*(.+?)\*\*/gim));
  gatewayMatches.forEach(match => {
    const label = clean(match[1]);
    const text = canonical(label);
    const laneId = text.includes("perigo imediato") ? "mpsc-promotor"
      : text.includes("classificacao") ? "mpsc-cisi"
        : text.includes("estrutura superior") ? ADMINISTRATION_LANE_ID
          : text.includes("risco esta controlado") ? "mpsc-cisi"
            : "mpsc-cisi";
    const activities = activityByLane.get(laneId) ?? [];
    if (!activities.includes(label)) activities.push(label);
    activityByLane.set(laneId, activities);
  });

  const classificationMatches = Array.from(markdown.matchAll(/^\s*-\s+\*\*(N[0-3]\s*[—-].+?)\*\*/gim));
  classificationMatches.forEach(match => {
    const label = clean(match[1]);
    const laneId = /^N2\b/i.test(label) ? "mpsc-areas" : "mpsc-cisi";
    const activities = activityByLane.get(laneId) ?? [];
    if (!activities.includes(label)) activities.push(label);
    activityByLane.set(laneId, activities);
  });

  const externalHeading = markdown.match(/^\*\*(DEFESA CIVIL, CBMSC, PMSC, SAMU, MUNICÍPIO E DEMAIS ÓRGÃOS COMPETENTES)\*\*$/im);
  if (externalHeading && !activityByLane.has("externo-resposta")) activityByLane.set("externo-resposta", []);
  const externalStart = lines.findIndex(line => /^###\s+Pool\s+2\b/i.test(line));
  const externalActivities: string[] = [];
  if (externalStart >= 0) {
    for (let index = externalStart + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^---\s*$/.test(line) || /^##\s+/.test(line)) break;
      const bullet = line.match(/^\s*-\s+\*\*(.+?)\*\*/);
      if (bullet) externalActivities.push(clean(bullet[1]));
    }
  }
  if (externalActivities.length > 0) {
    const activities = activityByLane.get("externo-resposta") ?? [];
    externalActivities.forEach(activity => { if (!activities.includes(activity)) activities.push(activity); });
    activityByLane.set("externo-resposta", activities);
  }
  return activityByLane;
}

function addCoreEdge(edges: FlowEdge[], nodes: FlowNode[], sourceTerm: string, targetTerm: string, label = "") {
  const source = nodes.find(node => canonical(node.label).includes(canonical(sourceTerm)));
  const target = nodes.find(node => canonical(node.label).includes(canonical(targetTerm)));
  if (!source || !target || source.id === target.id || edges.some(edge => edge.sourceId === source.id && edge.targetId === target.id)) return;
  const sourceLane = laneDefinitions.find(lane => lane.id === source.laneId);
  const targetLane = laneDefinitions.find(lane => lane.id === target.laneId);
  const type = sourceLane?.poolId === targetLane?.poolId ? "sequence" : "message";
  edges.push({ id: `edge-${edges.length + 1}`, sourceId: source.id, targetId: target.id, type, label, order: edges.length });
}

/** Converts a structured protocol Markdown into an editable, human-reviewable BPMN draft. */
export function importMarkdownToFlow(markdown: string, filename: string): MarkdownImportResult {
  const title = getHeading(markdown);
  const warnings: string[] = [];
  const activityByLane = extractLaneActivities(markdown);
  const hasStructuredLanes = activityByLane.size > 0;

  if (!hasStructuredLanes) {
    const model = createDefaultFlowModel();
    warnings.push("Não foram encontradas baias estruturadas. O sistema aplicou o modelo-base do MPSC para revisão manual.");
    return {
      model: { ...model, sourceMarkdown: markdown, sourceFileName: filename, sourceTitle: title, importWarnings: warnings },
      title,
      warnings,
      summary: { pools: model.pools.length, lanes: model.lanes.length, nodes: model.nodes.length, validationFields: Array.from(markdown.matchAll(/\[A VALIDAR\]/g)).length },
    };
  }

  const lanes: FlowLane[] = laneDefinitions.map(lane => ({ ...lane }));
  const nodes: FlowNode[] = [];
  const nodeCounters = new Map<string, number>();
  laneDefinitions.forEach(lane => {
    const activities = activityByLane.get(lane.id) ?? [];
    activities.forEach(activity => {
      const count = nodeCounters.get(lane.id) ?? 0;
      nodeCounters.set(lane.id, count + 1);
      const nodeType = nodeTypeFromLabel(activity, lane.id);
      const requiresValidation = activity.includes("[A VALIDAR]");
      nodes.push({
        id: `import-${lane.id}-${count + 1}`,
        laneId: lane.id,
        label: activity,
        nodeType,
        x: 60 + count * 235,
        y: 0,
        responsible: responsibleForLane(lane.id),
        notes: "Importado do Markdown; revisar sequência, responsável e competência antes de registrar versão.",
        gatewayCondition: nodeType === "gateway" ? "[A VALIDAR]" : "",
        level: levelFromLabel(activity),
        requiresValidation,
      });
    });
  });

  if (!nodes.some(node => node.nodeType === "start")) {
    nodes.unshift({ id: "import-inicio", laneId: "mpsc-promotor", label: "Promotor identifica risco, alerta relevante, emergência ou crise", nodeType: "start", x: 60, y: 0, responsible: "Promotor de Justiça", notes: "Marco inicial criado pelo importador.", gatewayCondition: "", level: null, requiresValidation: false });
    warnings.push("O evento de início não foi reconhecido no texto e foi inserido como marco padrão para revisão.");
  }

  const edges: FlowEdge[] = [];
  addCoreEdge(edges, nodes, "identifica risco", "preservar a propria seguranca");
  addCoreEdge(edges, nodes, "preservar a propria seguranca", "ha perigo imediato");
  addCoreEdge(edges, nodes, "ha perigo imediato", "acionar servico publico competente", "SIM");
  addCoreEdge(edges, nodes, "ha perigo imediato", "comunicar a cisi", "NÃO");
  addCoreEdge(edges, nodes, "acionar servico publico competente", "receber solicitacao", "Solicitação de atendimento");
  addCoreEdge(edges, nodes, "receber solicitacao", "comunicar a cisi", "Atendimento / orientação / protocolo");
  addCoreEdge(edges, nodes, "comunicar a cisi", "receber comunicacao");
  addCoreEdge(edges, nodes, "receber comunicacao", "verificar impacto");
  addCoreEdge(edges, nodes, "verificar impacto", "qual e a classificacao");
  addCoreEdge(edges, nodes, "qual e a classificacao", "n0", "N0");
  addCoreEdge(edges, nodes, "qual e a classificacao", "n1", "N1");
  addCoreEdge(edges, nodes, "qual e a classificacao", "n2", "N2");
  addCoreEdge(edges, nodes, "qual e a classificacao", "n3", "N3");
  addCoreEdge(edges, nodes, "n3", "consolidar situacao");
  addCoreEdge(edges, nodes, "consolidar situacao", "analisar recomendacao", "Síntese executiva");
  addCoreEdge(edges, nodes, "analisar recomendacao", "e necessario ativar estrutura superior");
  addCoreEdge(edges, nodes, "e necessario ativar estrutura superior", "determinar ou autorizar ativacao", "SIM");
  addCoreEdge(edges, nodes, "determinar ou autorizar ativacao", "monitorar cenario");
  addCoreEdge(edges, nodes, "monitorar cenario", "retornar orientacoes");
  addCoreEdge(edges, nodes, "retornar orientacoes", "monitorar evolucao");
  addCoreEdge(edges, nodes, "risco controlado", "confirmar estabilizacao", "SIM");

  const validationFields = Array.from(markdown.matchAll(/\[A VALIDAR\]/g)).length;
  if (validationFields === 0) warnings.push("Não foi encontrada a marcação [A VALIDAR]. Confirme se canais, autoridades e prazos já foram formalmente definidos.");
  if (!activityByLane.has("externo-resposta")) warnings.push("Nenhuma atividade externa foi reconhecida. O Pool de órgãos externos foi mantido vazio para revisão.");
  if (nodes.length < 8) warnings.push("Poucas atividades foram identificadas. Estruture o arquivo com headings de Pool, headings de Baia e listas em negrito para uma conversão mais completa.");

  const model: FlowModel = {
    pools: [
      { id: "mpsc", label: "MPSC — Governança e Resposta Institucional", order: 0 },
      { id: "externo", label: "Órgãos externos de resposta", order: 1 },
    ],
    lanes,
    nodes,
    edges,
    sourceMarkdown: markdown,
    sourceFileName: filename,
    sourceTitle: title,
    importWarnings: warnings,
  };

  return { model, title, warnings, summary: { pools: model.pools.length, lanes: model.lanes.length, nodes: model.nodes.length, validationFields } };
}
