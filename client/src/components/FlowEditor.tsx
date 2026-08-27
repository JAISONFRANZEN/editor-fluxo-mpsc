import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CircleDot,
  Download,
  FileJson,
  FileText,
  GitBranch,
  GripVertical,
  History,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Undo2,
  Upload,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { buildBpmnXml } from "../../../shared/bpmnExport";
import { compareFlowModels } from "../../../shared/flowDiff";
import { popFlowHistory, pushFlowHistory } from "../../../shared/flowHistory";
import { importMarkdownToFlow, type MarkdownImportResult } from "../../../shared/markdownImporter";
import {
  ADMINISTRATION_LANE_ID,
  type FlowEdge,
  type FlowIssue,
  type FlowLane,
  type FlowLevel,
  type FlowModel,
  type FlowNode,
  type FlowNodeType,
  validateFlowModel,
} from "../../../shared/flowModel";

const NODE_WIDTH = 190;
const NODE_HEIGHT = 58;
const LANE_HEIGHT = 126;

const statusLabels = {
  draft: "Rascunho",
  under_review: "Em revisão",
  approved: "Aprovado",
  archived: "Arquivado",
} as const;

const nodeTypeLabels: Record<FlowNodeType, string> = {
  start: "Evento de início",
  end: "Evento de fim",
  task: "Tarefa",
  decision: "Tarefa de decisão / deliberação",
  gateway: "Gateway",
  parallelGateway: "Gateway paralelo (AND)",
  data: "Objeto de dados",
  annotation: "Anotação / observação",
};

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] || character);
}

function buildExportSvg(model: FlowModel) {
  const lanes = sortedLanes(model);
  const width = Math.max(3300, ...model.nodes.map(node => node.x + NODE_WIDTH + 90));
  const height = lanes.length * LANE_HEIGHT + 330;
  const laneY = (laneId: string) => lanes.findIndex(lane => lane.id === laneId) * LANE_HEIGHT + 56;
  const laneFill = (lane: FlowLane) => {
    if (lane.id === ADMINISTRATION_LANE_ID) return "#E4EFFB";
    if (lane.id === "mpsc-cisi") return "#DCEBFA";
    return lane.poolId === "externo" ? "#F3F4F6" : "#F8FBFE";
  };
  const edges = model.edges.map(edge => {
    const source = model.nodes.find(node => node.id === edge.sourceId);
    const target = model.nodes.find(node => node.id === edge.targetId);
    if (!source || !target) return "";
    const x1 = source.x + NODE_WIDTH;
    const y1 = laneY(source.laneId) + 54;
    const x2 = target.x;
    const y2 = laneY(target.laneId) + 54;
    const mid = Math.round((x1 + x2) / 2);
    const dash = edge.type === "message" ? "stroke-dasharray='9 6'" : edge.type === "association" ? "stroke-dasharray='4 5'" : "";
    const label = edge.label ? `<text x='${mid}' y='${Math.min(y1, y2) - 8}' font-family='Inter, Arial' font-size='14' fill='#516070' text-anchor='middle'>${escapeXml(edge.label)}</text>` : "";
    return `<path d='M ${x1} ${y1} H ${mid} V ${y2} H ${x2}' fill='none' stroke='${edge.type === "message" ? "#687385" : edge.type === "association" ? "#9CA3AF" : "#4A90E2"}' stroke-width='2' ${dash} marker-end='url(#arrow)'/>${label}`;
  }).join("");
  const lanesSvg = lanes.map((lane, index) => {
    const y = index * LANE_HEIGHT + 56;
    const labelFill = lane.id === ADMINISTRATION_LANE_ID ? "#1F4788" : lane.id === "mpsc-cisi" ? "#4A90E2" : lane.poolId === "externo" ? "#687385" : "#6AA6D8";
    return `<rect x='20' y='${y}' width='${width - 40}' height='${LANE_HEIGHT}' fill='${laneFill(lane)}' stroke='#D1D5DB'/><rect x='34' y='${y + 15}' width='275' height='32' rx='6' fill='${labelFill}'/><text x='48' y='${y + 36}' font-family='Inter, Arial' font-size='14' fill='white'>${escapeXml(lane.label)}</text>`;
  }).join("");
  const nodes = model.nodes.map(node => {
    const y = laneY(node.laneId) + 50;
    const fill = node.nodeType === "gateway" ? "#FFF4D6" : node.nodeType === "parallelGateway" ? "#FFF7D1" : node.nodeType === "decision" ? "#F0ECF8" : node.nodeType === "annotation" ? "#FFF9EB" : node.nodeType === "data" ? "#FFFFFF" : node.nodeType === "end" ? "#FDEBEC" : node.nodeType === "start" ? "#E9F7EF" : "#FFFFFF";
    const stroke = node.nodeType === "gateway" ? "#D99600" : node.nodeType === "parallelGateway" ? "#C99600" : node.nodeType === "decision" ? "#7D6AAE" : node.nodeType === "annotation" ? "#E8B04F" : node.nodeType === "data" ? "#687385" : node.nodeType === "end" ? "#D14343" : node.laneId === "mpsc-cisi" ? "#4A90E2" : "#1F4788";
    const shape = node.nodeType === "gateway" || node.nodeType === "parallelGateway"
      ? `<polygon points='${node.x + 95},${y} ${node.x + 190},${y + 29} ${node.x + 95},${y + 58} ${node.x},${y + 29}' fill='${fill}' stroke='${stroke}' stroke-width='2'/>`
      : node.nodeType === "start" || node.nodeType === "end"
        ? `<ellipse cx='${node.x + 95}' cy='${y + 29}' rx='88' ry='27' fill='${fill}' stroke='${stroke}' stroke-width='${node.nodeType === "end" ? 3 : 2}'/>`
        : `<rect x='${node.x}' y='${y}' width='190' height='58' rx='8' fill='${fill}' stroke='${stroke}' stroke-width='2'/>`;
    const marker = node.requiresValidation ? `<text x='${node.x + 95}' y='${y + 18}' font-family='Inter, Arial' font-size='10' fill='#C94C4C' text-anchor='middle'>A VALIDAR</text>` : "";
    const textY = node.requiresValidation ? y + 38 : y + 33;
    const symbol = node.nodeType === "gateway" ? `<text x='${node.x + 95}' y='${y + 34}' font-family='Inter, Arial' font-size='17' fill='#8A5B00' text-anchor='middle'>×</text>` : node.nodeType === "parallelGateway" ? `<text x='${node.x + 95}' y='${y + 34}' font-family='Inter, Arial' font-size='17' fill='#8A5B00' text-anchor='middle'>+</text>` : "";
    return `${shape}${symbol}${marker}<text x='${node.x + 95}' y='${textY + (symbol ? 13 : 0)}' font-family='Inter, Arial' font-size='12' fill='#333333' text-anchor='middle'>${escapeXml(node.label.replace("[A VALIDAR]", "").slice(0, 58))}</text>`;
  }).join("");
  const legendY = lanes.length * LANE_HEIGHT + 85;
  const legendItems = [["#B7E47B", "Evento de início"], ["#F5A6A6", "Evento de fim"], ["#FFFFFF", "Tarefa / atividade"], ["#F0ECF8", "Tarefa de decisão / deliberação"], ["#FFF4D6", "Gateway exclusivo (XOR)"], ["#FFF7D1", "Gateway paralelo (AND)"], ["#FFFFFF", "Fluxo de sequência"], ["#FFFFFF", "Fluxo de mensagem"], ["#FFFFFF", "Objeto de dados"], ["#FFF9EB", "Anotação / observação"], ["#FFFFFF", "Associação / anotação"]];
  const legend = legendItems.map((item, index) => { const column = index % 2; const row = Math.floor(index / 2); const x = 60 + column * 560; const y = legendY + 52 + row * 34; const arrow = index === 6 || index === 7; const association = index === 10; const diamond = index === 4 || index === 5; const icon = association ? `<path d='M${x},${y} H${x + 34}' stroke='#9CA3AF' stroke-width='2' stroke-dasharray='4 5' marker-end='url(#arrow)'/>` : arrow ? `<path d='M${x},${y} H${x + 34}' stroke='#${index === 7 ? "687385" : "1F4788"}' stroke-width='2' ${index === 7 ? "stroke-dasharray='7 5'" : ""} marker-end='url(#arrow)'/>` : diamond ? `<polygon points='${x + 14},${y - 11} ${x + 27},${y} ${x + 14},${y + 11} ${x + 1},${y}' fill='${item[0]}' stroke='#D99600'/>${index === 4 ? `<text x='${x + 14}' y='${y + 5}' font-size='13' text-anchor='middle'>×</text>` : `<text x='${x + 14}' y='${y + 5}' font-size='13' text-anchor='middle'>+</text>`}` : `<rect x='${x}' y='${y - 10}' width='28' height='20' rx='${index < 2 ? "11" : "4"}' fill='${item[0]}' stroke='#${index === 1 ? "D14343" : index === 3 ? "7D6AAE" : index === 9 ? "E8B04F" : "4A90E2"}'/>`; return `${icon}<text x='${x + 46}' y='${y + 5}' font-family='Inter, Arial' font-size='14' fill='#334155'>${item[1]}</text>`; }).join("");
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'><defs><marker id='arrow' markerWidth='9' markerHeight='9' refX='7' refY='4.5' orient='auto'><path d='M0,0 L0,9 L8,4.5 z' fill='#4A90E2'/></marker></defs><rect width='100%' height='100%' fill='#F8F9FA'/><rect x='20' y='15' width='${width - 40}' height='32' fill='#1F4788'/><text x='38' y='37' font-family='Inter, Arial' font-size='18' font-weight='700' fill='white'>Fluxo Básico de Acionamento — MPSC</text>${lanesSvg}${edges}${nodes}<rect x='36' y='${legendY}' width='1160' height='220' rx='12' fill='#FFFFFF' stroke='#CBD5E1'/><text x='60' y='${legendY + 30}' font-family='Inter, Arial' font-size='17' font-weight='700' fill='#1F4788'>LEGENDA — BPMN 2.0</text>${legend}</svg>`;
}

function sortedLanes(model: FlowModel) {
  return [...model.pools]
    .sort((a, b) => a.order - b.order)
    .flatMap(pool => model.lanes.filter(lane => lane.poolId === pool.id).sort((a, b) => a.order - b.order));
}

function nodeClass(node: FlowNode) {
  if (node.nodeType === "gateway") return "h-[74px] w-[150px] rotate-0 bg-amber-50 border-amber-500 text-amber-950";
  if (node.nodeType === "parallelGateway") return "h-[74px] w-[150px] rotate-0 bg-yellow-50 border-yellow-600 text-yellow-950";
  if (node.nodeType === "start") return "h-[56px] w-[190px] rounded-full bg-lime-100 border-lime-600 text-lime-950";
  if (node.nodeType === "end") return "h-[56px] w-[190px] rounded-full bg-red-50 border-[3px] border-red-600 text-red-900";
  if (node.nodeType === "decision") return "h-[58px] w-[190px] rounded-lg bg-violet-50 border-violet-400 text-violet-950";
  if (node.nodeType === "data") return "h-[62px] w-[190px] rounded-md bg-white border-slate-400 text-slate-700";
  if (node.nodeType === "annotation") return "h-[62px] w-[190px] rounded-lg bg-amber-50 border-amber-300 text-amber-950";
  return "h-[58px] w-[190px] rounded-lg bg-white border-[#4A90E2] text-slate-800";
}

function severityStyle(severity: FlowIssue["severity"]) {
  if (severity === "error") return "bg-red-50 text-red-800 border-red-200";
  if (severity === "warning") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-blue-50 text-blue-800 border-blue-200";
}

export default function FlowEditor() {
  const flowQuery = trpc.flow.getOrCreate.useQuery();
  const [model, setModel] = useState<FlowModel | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [draggedLaneId, setDraggedLaneId] = useState<string | null>(null);
  const [draggedEdgeId, setDraggedEdgeId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<number | null>(null);
  const [status, setStatus] = useState<keyof typeof statusLabels>("draft");
  const [changeSummary, setChangeSummary] = useState("Ajustes no fluxo para revisão institucional.");
  const [commentText, setCommentText] = useState("");
  const [newEdgeSource, setNewEdgeSource] = useState("");
  const [newEdgeTarget, setNewEdgeTarget] = useState("");
  const [newLaneLabel, setNewLaneLabel] = useState("");
  const [newLanePool, setNewLanePool] = useState<"mpsc" | "externo">("mpsc");
  const [helpOpen, setHelpOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<FlowModel[]>([]);
  const [pendingImport, setPendingImport] = useState<MarkdownImportResult | null>(null);
  const [isReadingMarkdown, setIsReadingMarkdown] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const priorModelRef = useRef<FlowModel | null>(null);
  const skipUndoRecordRef = useRef(false);
  const utils = trpc.useUtils();
  const flowId = flowQuery.data?.id;
  const saveMutation = trpc.flow.save.useMutation();
  const restoreMutation = trpc.flow.restore.useMutation();
  const addCommentMutation = trpc.flow.addComment.useMutation();
  const resolveCommentMutation = trpc.flow.resolveComment.useMutation();
  const versionsQuery = trpc.flow.versions.useQuery({ flowId: flowId ?? -1 }, { enabled: Boolean(flowId) });
  const commentsQuery = trpc.flow.comments.useQuery({ flowId: flowId ?? -1 }, { enabled: Boolean(flowId) });

  useEffect(() => {
    if (flowQuery.data?.modelJson && !model) {
      setModel(flowQuery.data.modelJson as unknown as FlowModel);
      setStatus(flowQuery.data.status);
    }
  }, [flowQuery.data, model]);

  useEffect(() => {
    if (!model) return;
    if (priorModelRef.current && !skipUndoRecordRef.current) {
      setUndoStack(history => pushFlowHistory(history, priorModelRef.current as FlowModel));
    }
    priorModelRef.current = JSON.parse(JSON.stringify(model)) as FlowModel;
    skipUndoRecordRef.current = false;
  }, [model]);

  const lanes = useMemo(() => (model ? sortedLanes(model) : []), [model]);
  const selectedNode = model?.nodes.find(node => node.id === selectedNodeId) ?? null;
  const selectedEdge = model?.edges.find(edge => edge.id === selectedEdgeId) ?? null;
  const issues = useMemo(() => (model ? validateFlowModel(model) : []), [model]);
  const issueCount = issues.filter(issue => issue.severity === "error").length;
  const hasUnregisteredChanges = useMemo(() => {
    const latest = versionsQuery.data?.[0]?.snapshot as FlowModel | undefined;
    return Boolean(latest && JSON.stringify(latest) !== JSON.stringify(model));
  }, [model, versionsQuery.data]);
  const comparison = useMemo(() => {
    const selectedVersion = versionsQuery.data?.find(version => version.id === compareVersionId);
    return selectedVersion && model ? compareFlowModels(selectedVersion.snapshot as unknown as FlowModel, model) : null;
  }, [compareVersionId, model, versionsQuery.data]);

  const updateNode = (changes: Partial<FlowNode>) => {
    if (!selectedNodeId) return;
    setModel(current => current ? { ...current, nodes: current.nodes.map(node => node.id === selectedNodeId ? { ...node, ...changes } : node) } : current);
  };

  const updateEdge = (changes: Partial<FlowEdge>) => {
    if (!selectedEdgeId) return;
    setModel(current => current ? { ...current, edges: current.edges.map(edge => edge.id === selectedEdgeId ? { ...edge, ...changes } : edge) } : current);
  };

  const moveLane = (sourceId: string, targetId: string) => {
    if (!model || sourceId === targetId) return;
    if (sourceId === ADMINISTRATION_LANE_ID || targetId === ADMINISTRATION_LANE_ID) {
      toast.error("A Administração Superior é fixa na primeira baia do Pool MPSC.");
      return;
    }
    const source = model.lanes.find(lane => lane.id === sourceId);
    const target = model.lanes.find(lane => lane.id === targetId);
    if (!source || !target || source.poolId !== target.poolId) {
      toast.error("Baias só podem ser reordenadas dentro do mesmo Pool.");
      return;
    }
    const poolLanes = model.lanes.filter(lane => lane.poolId === source.poolId).sort((a, b) => a.order - b.order);
    const from = poolLanes.findIndex(lane => lane.id === sourceId);
    const to = poolLanes.findIndex(lane => lane.id === targetId);
    const reordered = [...poolLanes];
    reordered.splice(from, 1);
    reordered.splice(to, 0, source);
    setModel({ ...model, lanes: model.lanes.map(lane => {
      const index = reordered.findIndex(item => item.id === lane.id);
      return index >= 0 ? { ...lane, order: index } : lane;
    }) });
  };

  const reorderEdges = (sourceId: string, targetId: string) => {
    if (!model || sourceId === targetId) return;
    const from = model.edges.findIndex(edge => edge.id === sourceId);
    const to = model.edges.findIndex(edge => edge.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...model.edges];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setModel({ ...model, edges: reordered.map((edge, index) => ({ ...edge, order: index })) });
    toast.success("Ordem de conexão atualizada no rascunho.");
  };

  const addLane = () => {
    if (!model || !newLaneLabel.trim()) {
      toast.error("Informe o nome da nova baia.");
      return;
    }
    const order = Math.max(-1, ...model.lanes.filter(lane => lane.poolId === newLanePool).map(lane => lane.order)) + 1;
    setModel({ ...model, lanes: [...model.lanes, { id: `lane-${Date.now()}`, poolId: newLanePool, label: newLaneLabel.trim(), order }] });
    setNewLaneLabel("");
    toast.success("Nova baia adicionada ao rascunho.");
  };

  const undoLastChange = () => {
    const result = popFlowHistory(undoStack);
    if (!result) {
      toast.message("Não há alteração local para desfazer.");
      return;
    }
    skipUndoRecordRef.current = true;
    setUndoStack(result.history);
    setModel(result.model);
    toast.success("Alteração local desfeita.");
  };

  const readMarkdownFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("O arquivo Markdown deve ter até 2 MB.");
      return;
    }
    if (!/\.(md|markdown|txt)$/i.test(file.name) && !file.type.includes("markdown") && !file.type.startsWith("text/")) {
      toast.error("Selecione um arquivo Markdown ou texto estruturado.");
      return;
    }
    setIsReadingMarkdown(true);
    try {
      const content = await file.text();
      if (content.trim().length < 40) throw new Error("O arquivo não contém orientações suficientes para gerar uma visão inicial.");
      setPendingImport(importMarkdownToFlow(content, file.name));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo Markdown.");
    } finally {
      setIsReadingMarkdown(false);
    }
  };

  const applyMarkdownImport = () => {
    if (!pendingImport) return;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setChangeSummary(`Importação de orientações do arquivo ${pendingImport.model.sourceFileName}.`);
    setModel(JSON.parse(JSON.stringify(pendingImport.model)) as FlowModel);
    setPendingImport(null);
    toast.success("Visão inicial criada a partir do Markdown. Revise e registre uma nova versão quando estiver pronta.");
  };

  useEffect(() => {
    const handleKeyboardUndo = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, [contenteditable='true']");
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey && !typing) {
        event.preventDefault();
        undoLastChange();
      }
    };
    window.addEventListener("keydown", handleKeyboardUndo);
    return () => window.removeEventListener("keydown", handleKeyboardUndo);
  }, [undoStack]);

  const handleNodeDrop = (event: React.DragEvent<HTMLDivElement>, laneId: string) => {
    event.preventDefault();
    if (!draggedNodeId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(30, Math.round(event.clientX - rect.left + canvasRef.current.parentElement!.scrollLeft - NODE_WIDTH / 2));
    setModel(current => current ? { ...current, nodes: current.nodes.map(node => node.id === draggedNodeId ? { ...node, laneId, x } : node) } : current);
    setDraggedNodeId(null);
  };

  const addNode = (nodeType: FlowNodeType) => {
    if (!model) return;
    const maxX = Math.max(...model.nodes.map(node => node.x), 400);
    const node: FlowNode = {
      id: `node-${Date.now()}`,
      laneId: selectedNode?.laneId ?? "mpsc-cisi",
      label: nodeType === "gateway" ? "Nova decisão exclusiva?" : nodeType === "parallelGateway" ? "Ativa ações em paralelo" : nodeType === "decision" ? "Nova deliberação [A VALIDAR]" : nodeType === "annotation" ? "Nova observação [A VALIDAR]" : nodeType === "start" ? "Novo início" : nodeType === "end" ? "Novo encerramento" : nodeType === "data" ? "Novo objeto de dados [A VALIDAR]" : "Nova ação [A VALIDAR]",
      nodeType,
      x: maxX + 240,
      y: 0,
      responsible: selectedNode?.responsible ?? "[A VALIDAR]",
      notes: "",
      gatewayCondition: nodeType === "gateway" ? "SIM / NÃO" : nodeType === "parallelGateway" ? "Todas as saídas aplicáveis" : "",
      level: null,
      requiresValidation: true,
    };
    setModel({ ...model, nodes: [...model.nodes, node] });
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  };

  const addEdge = () => {
    if (!model || !newEdgeSource || !newEdgeTarget || newEdgeSource === newEdgeTarget) {
      toast.error("Selecione origem e destino distintos para criar o conector.");
      return;
    }
    const edge: FlowEdge = { id: `edge-${Date.now()}`, sourceId: newEdgeSource, targetId: newEdgeTarget, type: "sequence", label: "[A VALIDAR]", order: model.edges.length };
    setModel({ ...model, edges: [...model.edges, edge] });
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setNewEdgeSource("");
    setNewEdgeTarget("");
  };

  const removeSelected = () => {
    if (!model) return;
    if (selectedNodeId) {
      setModel({ ...model, nodes: model.nodes.filter(node => node.id !== selectedNodeId), edges: model.edges.filter(edge => edge.sourceId !== selectedNodeId && edge.targetId !== selectedNodeId) });
      setSelectedNodeId(null);
      toast.success("Elemento removido do rascunho.");
    }
    if (selectedEdgeId) {
      setModel({ ...model, edges: model.edges.filter(edge => edge.id !== selectedEdgeId) });
      setSelectedEdgeId(null);
      toast.success("Conector removido do rascunho.");
    }
  };

  const saveVersion = () => {
    if (!model || !flowId) return;
    if (issueCount > 0) {
      toast.error("Corrija os erros críticos de BPMN antes de salvar uma versão.");
      return;
    }
    saveMutation.mutate({ flowId, model, status, summary: changeSummary }, {
      onSuccess: updated => {
        if (updated?.modelJson) setModel(updated.modelJson as unknown as FlowModel);
        utils.flow.getOrCreate.invalidate();
        utils.flow.versions.invalidate({ flowId });
        toast.success("Nova versão registrada com sucesso.");
      },
      onError: error => toast.error(error.message),
    });
  };

  const restore = (versionId: number) => {
    if (!flowId) return;
    restoreMutation.mutate({ flowId, versionId }, {
      onSuccess: updated => {
        if (updated?.modelJson) setModel(updated.modelJson as unknown as FlowModel);
        utils.flow.getOrCreate.invalidate();
        utils.flow.versions.invalidate({ flowId });
        toast.success("Versão restaurada como novo rascunho.");
      },
      onError: error => toast.error(error.message),
    });
  };

  const submitComment = () => {
    if (!flowId || commentText.trim().length < 2) return;
    addCommentMutation.mutate({ flowId, elementId: selectedNodeId ?? selectedEdgeId ?? undefined, content: commentText.trim() }, {
      onSuccess: () => {
        setCommentText("");
        utils.flow.comments.invalidate({ flowId });
        toast.success("Comentário adicionado à revisão.");
      },
      onError: error => toast.error(error.message),
    });
  };

  const printFlow = () => {
    if (!model) return;
    const popup = window.open("", "_blank", "noopener,noreferrer,width=1280,height=800");
    if (!popup) {
      toast.error("Não foi possível abrir a janela de impressão. Verifique o bloqueio de pop-ups.");
      return;
    }
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><title>Fluxo Básico de Acionamento — MPSC</title><style>body{margin:0;background:#F8F9FA;font-family:Inter,Arial,sans-serif}.sheet{padding:22px}.meta{margin:0 0 12px;color:#1F4788;font-size:17px;font-weight:700}.hint{margin:0 0 20px;color:#516070;font-size:12px}@page{size:A1 landscape;margin:10mm}@media print{.sheet{padding:0}.hint{display:none}}</style></head><body><div class="sheet"><p class="meta">MPSC · CISI — Fluxo Básico de Acionamento</p><p class="hint">Minuta de trabalho. Campos com “A VALIDAR” dependem de confirmação institucional.</p>${buildExportSvg(model)}</div><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  const downloadBpmn = () => {
    if (!model) return;
    if (issueCount > 0) {
      toast.error("Corrija os erros críticos apontados na revisão antes de baixar o fluxo BPMN.");
      return;
    }
    const filename = `${(model.sourceTitle ?? "fluxo-mpsc").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "fluxo-mpsc"}.bpmn`;
    downloadFile(filename, buildBpmnXml(model), "application/xml");
    toast.success("Fluxo BPMN 2.0 baixado para teste de importação no Bizagi.");
  };

  if (flowQuery.isLoading || !model) {
    return <div className="flex h-[70vh] items-center justify-center text-slate-600"><Loader2 className="mr-3 h-5 w-5 animate-spin" />Carregando espaço de modelagem…</div>;
  }

  return (
    <div className="min-h-[calc(100vh-2rem)] bg-[#F5F7FA] text-slate-900">
      <header className="border-b border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1F4788] text-white shadow-sm"><Workflow className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4A90E2]">MPSC · CISI</p>
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">Editor de Protocolos BPMN</h1>
              <p className="truncate text-sm text-slate-500">{model.sourceTitle ?? "Fluxo Básico de Acionamento — Nível Promotoria de Justiça"}{model.sourceFileName ? ` · fonte: ${model.sourceFileName}` : ""}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-[#4A90E2]/40 bg-blue-50 px-3 py-1 text-[#1F4788]">v{flowQuery.data?.currentVersion ?? 1} · {statusLabels[status]}</Badge>
            <Badge className={issueCount ? "bg-red-600" : "bg-emerald-600"}>{issueCount ? `${issueCount} erro(s) crítico(s)` : "Modelo consistente"}</Badge>
            {hasUnregisteredChanges && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Alterações não registradas</Badge>}
            <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={readMarkdownFile} />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isReadingMarkdown}><Upload className="mr-2 h-4 w-4" />{isReadingMarkdown ? "Lendo MD…" : "Importar MD"}</Button>
            <Button variant="outline" onClick={undoLastChange} disabled={undoStack.length === 0} title="Desfazer alteração local (Ctrl+Z)"><Undo2 className="mr-2 h-4 w-4" />Desfazer</Button>
            <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogTrigger asChild><Button variant="outline"><CircleHelp className="mr-2 h-4 w-4" />Como usar</Button></DialogTrigger><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Orientação de uso do editor BPMN</DialogTitle><DialogDescription>Este espaço é uma minuta de modelagem e revisão. A versão institucional definitiva deve ser validada pela CISI e modelada no Bizagi.</DialogDescription></DialogHeader><div className="space-y-4 text-sm leading-relaxed text-slate-700"><div><b>1. Estruture o fluxo.</b> Adicione ações, decisões, eventos e objetos de dados. Arraste uma ação para alterar sua baia ou sua ordem horizontal. Arraste os rótulos das baias para reordená-las.</div><div><b>2. Preserve a governança.</b> A Administração Superior permanece bloqueada na primeira baia do Pool MPSC. Para interlocução externa, use o Pool de órgãos externos e conexões do tipo “fluxo de mensagem”.</div><div><b>3. Revise propriedades.</b> Selecione uma ação ou ligação no canvas e ajuste rótulo, responsável, observações, condição e nível N0–N3. Mantenha a marcação <code>[A VALIDAR]</code> em todo dado ainda não confirmado.</div><div><b>4. Resolva alertas.</b> O painel “Revisão” aponta fluxos inválidos entre Pools, gateways sem rótulo de saída, ações desconectadas e conflitos elementares de competência.</div><div><b>5. Registre decisão e exporte.</b> Adicione comentários, registre uma versão com resumo e status, compare com versões anteriores ou restaure um rascunho. Exporte SVG, especiﬁcação JSON ou imprima em A1/PDF.</div></div></DialogContent></Dialog>
            <Button variant="outline" onClick={() => downloadFile("fluxo-mpsc-especificacao.json", JSON.stringify({ title: flowQuery.data?.title, status, model, exportedAt: new Date().toISOString() }, null, 2), "application/json")}><FileJson className="mr-2 h-4 w-4" />Especificação</Button>
            <Button className="bg-[#1F4788] hover:bg-[#16396f]" onClick={downloadBpmn}><Download className="mr-2 h-4 w-4" />Baixar fluxo</Button>
            <Button variant="outline" onClick={() => downloadFile("fluxo-mpsc-visao.svg", buildExportSvg(model), "image/svg+xml")}><Download className="mr-2 h-4 w-4" />Imagem SVG</Button>
            <Button variant="outline" onClick={printFlow}><FileText className="mr-2 h-4 w-4" />Imprimir / PDF</Button>
            <Button className="bg-[#1F4788] hover:bg-[#16396f]" onClick={saveVersion} disabled={saveMutation.isPending}><Save className="mr-2 h-4 w-4" />{saveMutation.isPending ? "Salvando…" : "Registrar versão"}</Button>
            <Dialog open={Boolean(pendingImport)} onOpenChange={open => { if (!open) setPendingImport(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Confirmar geração da visão BPMN</DialogTitle><DialogDescription>O arquivo será convertido em um rascunho inicial editável. Nenhuma versão será registrada até que você selecione “Registrar versão”.</DialogDescription></DialogHeader>{pendingImport && <div className="space-y-4 text-sm text-slate-700"><div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="font-semibold text-[#1F4788]">{pendingImport.model.sourceFileName}</p><p className="mt-1">{pendingImport.summary.pools} Pools · {pendingImport.summary.lanes} baias · {pendingImport.summary.nodes} elementos iniciais · {pendingImport.summary.validationFields} marcações [A VALIDAR]</p></div><div><p className="font-semibold">Como o sistema interpretou o MD</p><p className="mt-1 leading-relaxed">As seções e atividades identificáveis são convertidas em uma visão inicial do fluxo. Itens ambíguos permanecem no modelo-base e devem ser revisados no canvas.</p></div>{pendingImport.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="font-semibold text-amber-900">Pontos para revisão</p><ul className="mt-1 list-disc space-y-1 pl-5 text-amber-900">{pendingImport.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPendingImport(null)}>Cancelar</Button><Button className="bg-[#1F4788] hover:bg-[#16396f]" onClick={applyMarkdownImport}>Gerar visão editável</Button></div></div>}</DialogContent></Dialog>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[250px_minmax(0,1fr)_350px]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:h-[calc(100vh-3rem)]">
          <div className="mb-4 flex items-center gap-2"><div className="rounded-md bg-blue-50 p-2 text-[#1F4788]"><Plus className="h-4 w-4" /></div><div><h2 className="font-semibold">Elementos BPMN</h2><p className="text-xs text-slate-500">Adicionar ao rascunho</p></div></div>
          <div className="space-y-2">
            {(["start", "end", "task", "decision", "gateway", "parallelGateway", "data", "annotation"] as FlowNodeType[]).map(type => <Button key={type} variant="outline" className="w-full justify-start border-slate-200" onClick={() => addNode(type)}>{type === "gateway" || type === "parallelGateway" ? <GitBranch className={`mr-2 h-4 w-4 ${type === "gateway" ? "text-amber-600" : "text-yellow-700"}`} /> : type === "data" || type === "annotation" ? <FileText className={`mr-2 h-4 w-4 ${type === "annotation" ? "text-amber-700" : "text-slate-600"}`} /> : type === "start" || type === "end" ? <CircleDot className={`mr-2 h-4 w-4 ${type === "end" ? "text-red-600" : "text-lime-600"}`} /> : <Workflow className={`mr-2 h-4 w-4 ${type === "decision" ? "text-violet-600" : "text-[#4A90E2]"}`} />}{nodeTypeLabels[type]}</Button>)}
          </div>
          <Separator className="my-5" />
          <div className="space-y-3">
            <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-[#4A90E2]" /><h3 className="text-sm font-semibold">Novo conector</h3></div>
            <Select value={newEdgeSource} onValueChange={setNewEdgeSource}><SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger><SelectContent>{model.nodes.map(node => <SelectItem key={node.id} value={node.id}>{node.label.slice(0, 40)}</SelectItem>)}</SelectContent></Select>
            <Select value={newEdgeTarget} onValueChange={setNewEdgeTarget}><SelectTrigger><SelectValue placeholder="Destino" /></SelectTrigger><SelectContent>{model.nodes.map(node => <SelectItem key={node.id} value={node.id}>{node.label.slice(0, 40)}</SelectItem>)}</SelectContent></Select>
            <Button variant="secondary" className="w-full" onClick={addEdge}><Plus className="mr-2 h-4 w-4" />Adicionar conexão</Button>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2"><p className="mb-2 px-1 text-xs font-semibold text-slate-600">Ordem dos conectores</p><div className="max-h-44 space-y-1 overflow-y-auto">{model.edges.map(edge => <button key={edge.id} draggable onDragStart={() => setDraggedEdgeId(edge.id)} onDragEnd={() => setDraggedEdgeId(null)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (draggedEdgeId) reorderEdges(draggedEdgeId, edge.id); }} onClick={() => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }} className={`flex w-full items-center gap-1 rounded-md px-1.5 py-1.5 text-left text-[11px] ${selectedEdgeId === edge.id ? "bg-blue-100 text-[#1F4788]" : "hover:bg-white text-slate-600"}`}><GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{edge.label || "Conexão sem rótulo"}</span></button>)}</div></div>
          </div>
          <Separator className="my-5" />
          <div className="space-y-2"><div className="flex items-center gap-2"><GripVertical className="h-4 w-4 text-[#4A90E2]" /><h3 className="text-sm font-semibold">Estrutura de baias</h3></div><Input value={newLaneLabel} onChange={event => setNewLaneLabel(event.target.value)} placeholder="Nome da nova baia" /><Select value={newLanePool} onValueChange={value => setNewLanePool(value as "mpsc" | "externo")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mpsc">Pool MPSC</SelectItem><SelectItem value="externo">Pool órgãos externos</SelectItem></SelectContent></Select><Button variant="outline" className="w-full" onClick={addLane}><Plus className="mr-2 h-4 w-4" />Adicionar baia</Button><p className="text-[11px] leading-relaxed text-slate-500">Clique duas vezes em um rótulo de baia para alterar seu nome. A Administração Superior não pode ser renomeada nem movida.</p></div>
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><ShieldCheck className="mb-1 h-4 w-4" /><strong>Regra institucional.</strong> A Administração Superior está protegida na primeira baia do Pool MPSC.</div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div><h2 className="font-semibold text-slate-900">Canvas de revisão</h2><p className="text-sm text-slate-500">Arraste elementos entre baias ou ao longo da faixa. Arraste rótulos de baias e conectores para reordenar.</p></div>
            <div className="flex items-center gap-2 text-xs text-slate-500"><span className="inline-flex h-2 w-2 rounded-full bg-[#4A90E2]" />fluxo de sequência <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-slate-500" />mensagem externa</div>
          </div>
          <ScrollArea className="h-[calc(100vh-15rem)] min-h-[650px]">
            <div className="min-w-[3320px] p-5">
              <div ref={canvasRef} className="relative overflow-hidden rounded-xl border border-slate-300 bg-[#F8F9FA] shadow-inner" style={{ height: lanes.length * LANE_HEIGHT + 290 }}>
                <div className="absolute inset-x-0 top-0 flex h-14 items-center bg-[#1F4788] px-5 text-sm font-semibold tracking-wide text-white">POOL 1 — MPSC | GOVERNANÇA E RESPOSTA INSTITUCIONAL <span className="ml-4 border-l border-white/30 pl-4 text-xs font-medium text-blue-100">Rascunho auditável · Fluxo de nível Promotoria</span></div>
                <svg className="pointer-events-none absolute inset-0 z-[25] h-full w-full" width="3300" height={lanes.length * LANE_HEIGHT + 56} aria-label="Conectores editáveis do fluxo">
                  <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 Z" fill="#4A90E2" /></marker></defs>
                  {model.edges.map(edge => {
                    const source = model.nodes.find(node => node.id === edge.sourceId);
                    const target = model.nodes.find(node => node.id === edge.targetId);
                    if (!source || !target) return null;
                    const sourceLane = lanes.findIndex(lane => lane.id === source.laneId);
                    const targetLane = lanes.findIndex(lane => lane.id === target.laneId);
                    const y1 = 56 + sourceLane * LANE_HEIGHT + 78;
                    const y2 = 56 + targetLane * LANE_HEIGHT + 78;
                    const x1 = source.x + NODE_WIDTH;
                    const x2 = target.x;
                    const mid = Math.round((x1 + x2) / 2);
                    return <g key={edge.id} className="pointer-events-auto cursor-pointer" onClick={event => { event.stopPropagation(); setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}><path d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`} fill="none" stroke={selectedEdgeId === edge.id ? "#1F4788" : edge.type === "message" ? "#687385" : edge.type === "association" ? "#9CA3AF" : "#4A90E2"} strokeWidth={selectedEdgeId === edge.id ? "4" : "2"} strokeDasharray={edge.type === "message" ? "8 6" : edge.type === "association" ? "4 5" : undefined} markerEnd="url(#arrow)" /><text x={mid} y={Math.min(y1, y2) - 7} textAnchor="middle" fontSize="12" fill="#516070">{edge.label}</text></g>;
                  })}
                </svg>
                {lanes.map((lane, index) => {
                  const laneNodes = model.nodes.filter(node => node.laneId === lane.id);
                  const isAdmin = lane.id === ADMINISTRATION_LANE_ID;
                  const isCisi = lane.id === "mpsc-cisi";
                  return <div key={lane.id} className={`absolute left-0 right-0 z-20 border-b border-slate-200 ${isAdmin ? "bg-[#E4EFFB]" : isCisi ? "bg-[#DCEBFA]" : lane.poolId === "externo" ? "bg-slate-100" : "bg-white"}`} style={{ top: 56 + index * LANE_HEIGHT, height: LANE_HEIGHT }} onDragOver={event => event.preventDefault()} onDrop={event => handleNodeDrop(event, lane.id)}>
                    {lane.poolId === "externo" && <div className="absolute inset-x-0 top-0 flex h-8 items-center bg-[#687385] px-5 text-xs font-semibold tracking-wide text-white">POOL 2 — ÓRGÃOS EXTERNOS DE RESPOSTA <span className="ml-4 text-[11px] font-medium text-slate-200">Interação por fluxo de mensagem</span></div>}
                    {lane.poolId !== "externo" && <div className="absolute left-3 top-3 flex w-[260px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white" draggable={!isAdmin} onDoubleClick={() => { if (!isAdmin) { const nextLabel = window.prompt("Nome da baia", lane.label); if (nextLabel?.trim()) setModel(current => current ? { ...current, lanes: current.lanes.map(item => item.id === lane.id ? { ...item, label: nextLabel.trim() } : item) } : current); } }} onDragStart={() => setDraggedLaneId(lane.id)} onDragEnd={() => setDraggedLaneId(null)} onDrop={event => { event.preventDefault(); if (draggedLaneId) moveLane(draggedLaneId, lane.id); }} style={{ background: isAdmin ? "#1F4788" : isCisi ? "#4A90E2" : "#6AA6D8" }}>
                      {!isAdmin && <GripVertical className="h-4 w-4 opacity-80" />}<span className="truncate">{isAdmin ? "1. " : ""}{lane.label}</span>{isCisi && <Badge className="ml-auto bg-white/20 text-[10px] text-white hover:bg-white/20">FOCAL</Badge>}
                    </div>}
                    {lane.poolId === "externo" && <div className="absolute left-3 top-10 flex w-[360px] items-center gap-2 rounded-lg bg-[#687385] px-3 py-2 text-xs font-semibold text-white"><span className="truncate">{lane.label}</span></div>}
                    {laneNodes.map(node => <button key={node.id} draggable onDragStart={event => { setDraggedNodeId(node.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedNodeId(null)} onClick={() => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }} className={`absolute ${lane.poolId === "externo" ? "top-[58px]" : "top-[48px]"} z-30 flex cursor-grab items-center justify-center border-2 px-3 text-center text-xs font-medium leading-snug shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${nodeClass(node)} ${selectedNodeId === node.id ? "ring-4 ring-[#87CEEB]/70" : ""}`} style={{ left: node.x }}><span className="line-clamp-3">{node.nodeType === "parallelGateway" && <span className="mb-1 block text-lg font-bold leading-none text-yellow-700">+</span>}{node.nodeType === "gateway" && <span className="mb-1 block text-lg font-bold leading-none text-amber-700">×</span>}{node.requiresValidation && <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-red-600">[A VALIDAR]</span>}{node.label.replace("[A VALIDAR]", "")}</span></button>)}
                  </div>;
                })}
                <div className="absolute bottom-5 left-5 z-30 w-[760px] rounded-xl border border-slate-300 bg-white/95 p-4 shadow-sm backdrop-blur"><div className="mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#1F4788]" /><h3 className="text-sm font-bold tracking-wide text-[#1F4788]">LEGENDA — BPMN 2.0</h3></div><div className="grid grid-cols-2 gap-x-7 gap-y-2 text-xs text-slate-700"><div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border-2 border-lime-600 bg-lime-200" />Evento de início</div><div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border-2 border-red-600 bg-red-200" />Evento de fim</div><div className="flex items-center gap-2"><span className="h-5 w-7 rounded-md border-2 border-[#4A90E2] bg-white" />Tarefa / atividade</div><div className="flex items-center gap-2"><span className="h-5 w-7 rounded-md border-2 border-violet-400 bg-violet-50" />Tarefa de decisão / deliberação</div><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rotate-45 border-2 border-amber-500 bg-amber-50 text-sm text-amber-800"><span className="-rotate-45">×</span></span>Gateway exclusivo (XOR)</div><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rotate-45 border-2 border-yellow-600 bg-yellow-50 text-sm text-yellow-800"><span className="-rotate-45">+</span></span>Gateway paralelo (AND)</div><div className="flex items-center gap-2"><span className="w-8 border-t-2 border-[#1F4788]" />Fluxo de sequência</div><div className="flex items-center gap-2"><span className="w-8 border-t-2 border-dashed border-slate-600" />Fluxo de mensagem</div><div className="flex items-center gap-2"><span className="h-6 w-5 rounded-sm border-2 border-slate-500 bg-white" />Objeto de dados</div><div className="flex items-center gap-2"><span className="h-6 w-7 rounded-md border-2 border-amber-300 bg-amber-50" />Anotação / observação</div><div className="flex items-center gap-2"><span className="w-8 border-t-2 border-dashed border-slate-400" />Associação / anotação</div></div></div>
              </div>
            </div>
          </ScrollArea>
        </section>

        <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 xl:h-[calc(100vh-3rem)]">
          <Tabs defaultValue="properties" className="flex h-full flex-col">
            <TabsList className="m-3 grid grid-cols-3 bg-slate-100"><TabsTrigger value="properties"><Settings2 className="mr-1 h-3.5 w-3.5" />Propr.</TabsTrigger><TabsTrigger value="review"><MessageSquare className="mr-1 h-3.5 w-3.5" />Revisão</TabsTrigger><TabsTrigger value="history"><History className="mr-1 h-3.5 w-3.5" />Histórico</TabsTrigger></TabsList>
            <TabsContent value="properties" className="mt-0 min-h-0 flex-1"><ScrollArea className="h-[calc(100vh-8.5rem)] px-4 pb-5">
              {selectedNode ? <div className="space-y-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Elemento selecionado</p><h3 className="font-semibold">{nodeTypeLabels[selectedNode.nodeType]}</h3></div><Button size="icon" variant="ghost" onClick={removeSelected}><X className="h-4 w-4" /></Button></div>
                <div className="space-y-2"><Label>Rótulo</Label><Textarea value={selectedNode.label} onChange={event => updateNode({ label: event.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Tipo</Label><Select value={selectedNode.nodeType} onValueChange={value => updateNode({ nodeType: value as FlowNodeType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(nodeTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Nível</Label><Select value={selectedNode.level ?? "none"} onValueChange={value => updateNode({ level: value === "none" ? null : value as FlowLevel })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não aplicável</SelectItem><SelectItem value="N0">N0</SelectItem><SelectItem value="N1">N1</SelectItem><SelectItem value="N2">N2</SelectItem><SelectItem value="N3">N3</SelectItem></SelectContent></Select></div></div>
                <div className="space-y-2"><Label>Responsável</Label><Input value={selectedNode.responsible} onChange={event => updateNode({ responsible: event.target.value })} /></div>
                <div className="space-y-2"><Label>Observações</Label><Textarea value={selectedNode.notes} onChange={event => updateNode({ notes: event.target.value })} /></div>
                {selectedNode.nodeType === "gateway" && <div className="space-y-2"><Label>Condições de saída</Label><Input value={selectedNode.gatewayCondition} onChange={event => updateNode({ gatewayCondition: event.target.value })} placeholder="SIM / NÃO ou N0 / N1 / N2 / N3" /></div>}
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={selectedNode.requiresValidation} onChange={event => { const required = event.target.checked; updateNode({ requiresValidation: required, label: required && !selectedNode.label.includes("[A VALIDAR]") ? `${selectedNode.label} [A VALIDAR]` : !required ? selectedNode.label.replace(" [A VALIDAR]", "") : selectedNode.label }); }} />Campo depende de validação institucional</label>
              </div> : selectedEdge ? <div className="space-y-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Conector selecionado</p><h3 className="font-semibold">Ligação BPMN</h3></div><Button size="icon" variant="ghost" onClick={removeSelected}><X className="h-4 w-4" /></Button></div><div className="space-y-2"><Label>Origem</Label><Select value={selectedEdge.sourceId} onValueChange={value => updateEdge({ sourceId: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{model.nodes.map(node => <SelectItem key={node.id} value={node.id}>{node.label.slice(0, 44)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Destino</Label><Select value={selectedEdge.targetId} onValueChange={value => updateEdge({ targetId: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{model.nodes.map(node => <SelectItem key={node.id} value={node.id}>{node.label.slice(0, 44)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Tipo</Label><Select value={selectedEdge.type} onValueChange={value => updateEdge({ type: value as FlowEdge["type"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sequence">Fluxo de sequência</SelectItem><SelectItem value="message">Fluxo de mensagem</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Rótulo da conexão</Label><Input value={selectedEdge.label} onChange={event => updateEdge({ label: event.target.value })} /></div></div> : <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500"><Settings2 className="mx-auto mb-3 h-6 w-6 text-slate-400" />Selecione uma ação, decisão, dado ou conexão para editar suas propriedades.</div>}
            </ScrollArea></TabsContent>
            <TabsContent value="review" className="mt-0 min-h-0 flex-1"><ScrollArea className="h-[calc(100vh-8.5rem)] px-4 pb-5"><div className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Validações automáticas</p><h3 className="font-semibold">Regras de coerência BPMN</h3></div>{issues.length === 0 ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mb-2 h-5 w-5" />Não há inconsistências detectadas no modelo atual.</div> : <div className="space-y-2">{issues.map(issue => <button key={issue.id} className={`w-full rounded-lg border p-3 text-left text-sm ${severityStyle(issue.severity)}`} onClick={() => { if (issue.nodeId) { setSelectedNodeId(issue.nodeId); setSelectedEdgeId(null); } if (issue.edgeId) { setSelectedEdgeId(issue.edgeId); setSelectedNodeId(null); } }}><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{issue.message}</span></div></button>)}</div>}
                <Separator />
                <div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Comentário de revisão</p><p className="mt-1 text-sm text-slate-500">Vinculado ao elemento selecionado quando houver seleção.</p></div><Textarea value={commentText} onChange={event => setCommentText(event.target.value)} placeholder="Descreva o ajuste ou a dúvida institucional…" /><Button className="w-full" onClick={submitComment} disabled={addCommentMutation.isPending}><MessageSquare className="mr-2 h-4 w-4" />Registrar comentário</Button>
                <div className="space-y-2">{commentsQuery.data?.map(comment => <div key={comment.id} className="rounded-lg border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between"><Badge variant="outline" className={comment.status === "resolved" ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}>{comment.status === "resolved" ? "Resolvido" : "Aberto"}</Badge>{comment.status === "open" && <Button size="sm" variant="ghost" onClick={() => resolveCommentMutation.mutate({ commentId: comment.id }, { onSuccess: () => { if (flowId) utils.flow.comments.invalidate({ flowId }); } })}>Resolver</Button>}</div><p className="text-sm leading-relaxed text-slate-700">{comment.content}</p></div>)}</div>
              </div></ScrollArea></TabsContent>
            <TabsContent value="history" className="mt-0 min-h-0 flex-1"><ScrollArea className="h-[calc(100vh-8.5rem)] px-4 pb-5"><div className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Controle de versão</p><h3 className="font-semibold">Histórico persistente</h3><p className="mt-1 text-sm text-slate-500">Depois de importar ou editar, registre uma versão para manter o estado recuperável.</p></div>{hasUnregisteredChanges && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><b>Alterações não registradas.</b> O estado atual pode ser salvo como nova versão; versões anteriores continuam preservadas.</div>}<div className="space-y-2"><Label>Status da próxima versão</Label><Select value={status} onValueChange={value => setStatus(value as keyof typeof statusLabels)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Resumo da alteração</Label><Textarea value={changeSummary} onChange={event => setChangeSummary(event.target.value)} /></div><Button className="w-full bg-[#1F4788] hover:bg-[#16396f]" onClick={saveVersion}><Save className="mr-2 h-4 w-4" />Registrar nova versão</Button>{comparison && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="text-sm font-semibold text-[#1F4788]">Comparação com versão selecionada</p><div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-slate-700"><div><b>{comparison.addedNodes.length}</b><br />novas</div><div><b>{comparison.changedNodes.length}</b><br />alteradas</div><div><b>{comparison.removedNodes.length}</b><br />removidas</div></div><Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setCompareVersionId(null)}>Limpar comparação</Button></div>}<Separator />{versionsQuery.data?.map(version => <div key={version.id} className={`rounded-xl border p-3 ${compareVersionId === version.id ? "border-[#4A90E2] bg-blue-50" : "border-slate-200"}`}><div className="flex items-center justify-between"><span className="font-semibold text-[#1F4788]">Versão {version.versionNumber}</span><Badge variant="outline">{statusLabels[version.status]}</Badge></div><p className="mt-2 text-sm text-slate-600">{version.changeSummary}</p><p className="mt-2 text-xs text-slate-400">{new Date(version.createdAt).toLocaleString("pt-BR")}</p><div className="mt-3 grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={() => setCompareVersionId(version.id)}>Comparar</Button><Button size="sm" variant="outline" onClick={() => restore(version.id)} disabled={restoreMutation.isPending}><Undo2 className="mr-1 h-3.5 w-3.5" />Restaurar</Button></div></div>)}</div></ScrollArea></TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  );
}
