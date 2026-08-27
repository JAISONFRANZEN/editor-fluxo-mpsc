import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CircleDot,
  Copy,
  Database,
  Download,
  FileJson,
  FileText,
  GitBranch,
  GripVertical,
  History,
  Link2,
  Loader2,
  Maximize2,
  MessageSquare,
  Minus,
  Paperclip,
  Plus,
  Redo2,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Undo2,
  Upload,
  UserRoundCog,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
  Grid3X3,
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
import { buildBpmnXml } from "@shared/bpmnExport";
import { calculateCanvasDropX, snapCanvasX } from "@shared/canvasGeometry";
import { inferConnectionType } from "@shared/edgeRules";
import { compareFlowModels } from "../../../shared/flowDiff";
import { pushFlowHistory, redoFlowChange, undoFlowChange } from "../../../shared/flowHistory";
import { importMarkdownToFlow, type MarkdownImportResult } from "../../../shared/markdownImporter";
import { buildInstitutionalInfographicPrompt } from "../../../shared/infographicPrompt";
import { filterFlowNodes, listFlowResponsibles } from "../../../shared/flowFilters";
import { roleLabels } from "../../../shared/flowAccess";
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
  intermediate: "Evento intermediário",
  end: "Evento de fim",
  task: "Tarefa",
  decision: "Tarefa de decisão / deliberação",
  subprocess: "Subprocesso",
  gateway: "Gateway exclusivo (XOR)",
  parallelGateway: "Gateway paralelo (AND)",
  inclusiveGateway: "Gateway inclusivo (OR)",
  eventGateway: "Gateway baseado em eventos",
  data: "Objeto de dados",
  dataStore: "Repositório de dados",
  annotation: "Anotação / observação",
};

const essentialNodeTypes: FlowNodeType[] = ["start", "end", "task", "decision", "gateway", "parallelGateway", "data", "annotation"];
const extendedNodeTypes = Object.keys(nodeTypeLabels) as FlowNodeType[];

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

const legendEntries = [
  ["start", "Evento de início"], ["intermediate", "Evento intermediário"], ["end", "Evento de fim"], ["task", "Tarefa / atividade"],
  ["decision", "Tarefa de decisão / deliberação"], ["subprocess", "Subprocesso"], ["xor", "Gateway exclusivo (XOR)"], ["and", "Gateway paralelo (AND)"],
  ["or", "Gateway inclusivo (OR)"], ["event", "Gateway baseado em eventos"], ["sequence", "Fluxo de sequência"], ["message", "Fluxo de mensagem"],
  ["data", "Objeto de dados"], ["store", "Repositório de dados"], ["annotation", "Anotação / observação"], ["association", "Associação / anotação"],
] as const;

function BpmnLegend() {
  const glyph = (kind: typeof legendEntries[number][0]) => {
    if (kind === "start") return <span className="h-5 w-5 rounded-full border-2 border-lime-600 bg-lime-200" />;
    if (kind === "intermediate") return <span className="h-5 w-5 rounded-full border-[3px] border-lime-600 bg-lime-50" />;
    if (kind === "end") return <span className="h-5 w-5 rounded-full border-[3px] border-red-600 bg-red-200" />;
    if (kind === "task") return <span className="h-5 w-7 rounded-md border-2 border-[#4A90E2] bg-blue-50" />;
    if (kind === "decision") return <span className="h-5 w-7 rounded-md border-2 border-violet-400 bg-violet-50" />;
    if (kind === "subprocess") return <span className="flex h-5 w-7 items-center justify-center rounded-md border-2 border-[#4A90E2] bg-blue-50 text-[11px] text-[#1F4788]">+</span>;
    if (["xor", "and", "or", "event"].includes(kind)) return <span className="flex h-6 w-6 items-center justify-center rotate-45 border-2 border-[#E59B23] bg-amber-50 text-sm text-amber-900"><span className="-rotate-45 font-bold">{kind === "xor" ? "×" : kind === "and" ? <span className="text-green-700">+</span> : kind === "or" ? "○" : "◎"}</span></span>;
    if (kind === "sequence") return <span className="relative h-4 w-9 border-t-2 border-black before:absolute before:right-0 before:-top-1.5 before:border-y-[5px] before:border-l-[8px] before:border-y-transparent before:border-l-black" />;
    if (kind === "message") return <span className="relative h-4 w-9 border-t-2 border-dashed border-black before:absolute before:-left-0.5 before:-top-1.5 before:h-2 before:w-2 before:rounded-full before:border before:border-black before:bg-white after:absolute after:right-0 after:-top-1.5 after:border-y-[5px] after:border-l-[8px] after:border-y-transparent after:border-l-black" />;
    if (kind === "association") return <span className="relative h-4 w-9 border-t-2 border-dashed border-black after:absolute after:right-0 after:-top-1 after:text-xs after:font-bold after:content-['›']" />;
    if (kind === "data") return <span className="relative h-6 w-5 border-2 border-slate-500 bg-white after:absolute after:-right-0.5 after:-top-0.5 after:h-2 after:w-2 after:border-b-2 after:border-l-2 after:border-slate-500 after:bg-slate-100" />;
    if (kind === "store") return <span className="h-5 w-7 rounded-[50%] border-2 border-slate-500 bg-white" />;
    return <span className="h-6 w-7 rounded-md border-2 border-amber-400 bg-amber-50" />;
  };
  return <div className="absolute bottom-5 left-5 z-30 w-[920px] rounded-xl border border-slate-300 bg-white/95 p-4 shadow-sm backdrop-blur"><div className="mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#1F4788]" /><h3 className="text-sm font-bold tracking-wide text-[#1F4788]">LEGENDA — BPMN 2.0</h3></div><div className="grid grid-cols-2 gap-x-7 gap-y-2 text-xs text-slate-700">{legendEntries.map(([kind, label]) => <div key={kind} className="flex items-center gap-2">{glyph(kind)}<span>{label}</span></div>)}</div></div>;
}

function buildCompleteLegendSvg(legendY: number) {
  const visual: Record<string, string> = {
    start: "<circle cx='14' cy='0' r='10' fill='#B7E47B' stroke='#65A30D' stroke-width='2'/>", intermediate: "<circle cx='14' cy='0' r='10' fill='#E9F7EF' stroke='#65A30D' stroke-width='3'/>", end: "<circle cx='14' cy='0' r='10' fill='#F5A6A6' stroke='#D14343' stroke-width='3'/>", task: "<rect x='0' y='-10' width='28' height='20' rx='4' fill='#EDF5FD' stroke='#4A90E2'/>", decision: "<rect x='0' y='-10' width='28' height='20' rx='4' fill='#F0ECF8' stroke='#7D6AAE'/>", subprocess: "<rect x='0' y='-10' width='28' height='20' rx='4' fill='#EDF5FD' stroke='#4A90E2'/><text x='14' y='5' font-size='13' text-anchor='middle'>+</text>", xor: "<polygon points='14,-11 27,0 14,11 1,0' fill='#FFF4D6' stroke='#E59B23'/><text x='14' y='5' font-size='13' text-anchor='middle'>×</text>", and: "<polygon points='14,-11 27,0 14,11 1,0' fill='#FFF4D6' stroke='#E59B23'/><text x='14' y='5' font-size='13' fill='#3C8A38' text-anchor='middle'>+</text>", or: "<polygon points='14,-11 27,0 14,11 1,0' fill='#FFF4D6' stroke='#E59B23'/><circle cx='14' cy='0' r='6' fill='none' stroke='#8A5B00'/>", event: "<polygon points='14,-11 27,0 14,11 1,0' fill='#FFF4D6' stroke='#E59B23'/><circle cx='14' cy='0' r='7' fill='none' stroke='#8A5B00'/><circle cx='14' cy='0' r='3' fill='none' stroke='#8A5B00'/>", sequence: "<path d='M0,0 H34' stroke='#111827' stroke-width='2' marker-end='url(#arrow)'/>", message: "<circle cx='4' cy='0' r='4' fill='white' stroke='#111827'/><path d='M0,0 H34' stroke='#111827' stroke-width='2' stroke-dasharray='5 4' marker-end='url(#arrow)'/>", data: "<path d='M0,-11 h20 l8,7 v15 h-28 z M20,-11 v7 h8' fill='white' stroke='#687385'/>", store: "<path d='M2,-7 a12,5 0 0 1 24,0 v12 a12,5 0 0 1 -24,0 z M2,-7 a12,5 0 0 0 24,0' fill='white' stroke='#687385'/>", annotation: "<rect x='0' y='-10' width='28' height='20' rx='4' fill='#FFF9EB' stroke='#E8B04F'/>", association: "<path d='M0,0 H34' stroke='#111827' stroke-width='2' stroke-dasharray='4 5' marker-end='url(#open-arrow)'/>"
  };
  return legendEntries.map(([kind, label], index) => { const column = index % 2; const row = Math.floor(index / 2); const x = 60 + column * 560; const y = legendY + 52 + row * 34; return `<g transform='translate(${x},${y})'>${visual[kind]}<text x='46' y='5' font-family='Inter, Arial' font-size='14' fill='#334155'>${label}</text></g>`; }).join("");
}

function buildExportSvg(model: FlowModel) {
  const lanes = sortedLanes(model);
  const width = Math.max(3300, ...model.nodes.map(node => node.x + NODE_WIDTH + 90));
  const height = lanes.length * LANE_HEIGHT + 420;
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
    const originCircle = edge.type === "message" ? `<circle cx='${x1 + 4}' cy='${y1}' r='4' fill='white' stroke='#111827' stroke-width='1.5'/>` : "";
    return `${originCircle}<path d='M ${x1} ${y1} H ${mid} V ${y2} H ${x2}' fill='none' stroke='#111827' stroke-width='2' ${dash} marker-end='url(#${edge.type === "association" ? "open-arrow" : "arrow"})'/>${label}`;
  }).join("");
  const lanesSvg = lanes.map((lane, index) => {
    const y = index * LANE_HEIGHT + 56;
    const labelFill = lane.id === ADMINISTRATION_LANE_ID ? "#1F4788" : lane.id === "mpsc-cisi" ? "#4A90E2" : lane.poolId === "externo" ? "#687385" : "#6AA6D8";
    return `<rect x='20' y='${y}' width='${width - 40}' height='${LANE_HEIGHT}' fill='${laneFill(lane)}' stroke='#D1D5DB'/><rect x='34' y='${y + 15}' width='275' height='32' rx='6' fill='${labelFill}'/><text x='48' y='${y + 36}' font-family='Inter, Arial' font-size='14' fill='white'>${escapeXml(lane.label)}</text>`;
  }).join("");
  const nodes = model.nodes.map(node => {
    const y = laneY(node.laneId) + 50;
    const isGateway = ["gateway", "parallelGateway", "inclusiveGateway", "eventGateway"].includes(node.nodeType);
    const fill = node.nodeType === "decision" ? "#F0ECF8" : node.nodeType === "annotation" ? "#FFF9EB" : node.nodeType === "data" || node.nodeType === "dataStore" ? "#FFFFFF" : node.nodeType === "end" ? "#FDEBEC" : node.nodeType === "start" || node.nodeType === "intermediate" ? "#E9F7EF" : isGateway ? "#FFF4D6" : "#EDF5FD";
    const stroke = isGateway ? "#E59B23" : node.nodeType === "decision" ? "#7D6AAE" : node.nodeType === "annotation" ? "#E8B04F" : node.nodeType === "data" || node.nodeType === "dataStore" ? "#687385" : node.nodeType === "end" ? "#D14343" : node.nodeType === "start" || node.nodeType === "intermediate" ? "#65A30D" : "#4A90E2";
    const shape = isGateway
      ? `<polygon points='${node.x + 95},${y} ${node.x + 190},${y + 29} ${node.x + 95},${y + 58} ${node.x},${y + 29}' fill='${fill}' stroke='${stroke}' stroke-width='2'/>`
      : node.nodeType === "start" || node.nodeType === "intermediate" || node.nodeType === "end"
        ? `<ellipse cx='${node.x + 95}' cy='${y + 29}' rx='88' ry='27' fill='${fill}' stroke='${stroke}' stroke-width='${node.nodeType === "end" ? 3 : 2}'/>`
        : node.nodeType === "data" ? `<path d='M${node.x},${y} h155 l35,18 v40 h-190 z M${node.x + 155},${y} v18 h35' fill='${fill}' stroke='${stroke}' stroke-width='2'/>` : node.nodeType === "dataStore" ? `<path d='M${node.x + 8},${y + 10} a87,13 0 0 1 174,0 v38 a87,13 0 0 1 -174,0 z M${node.x + 8},${y + 10} a87,13 0 0 0 174,0' fill='${fill}' stroke='${stroke}' stroke-width='2'/>` : `<rect x='${node.x}' y='${y}' width='190' height='58' rx='8' fill='${fill}' stroke='${stroke}' stroke-width='2'/>`;
    const marker = node.requiresValidation ? `<text x='${node.x + 95}' y='${y + 18}' font-family='Inter, Arial' font-size='10' fill='#C94C4C' text-anchor='middle'>A VALIDAR</text>` : "";
    const textY = node.requiresValidation ? y + 38 : y + 33;
    const symbol = node.nodeType === "gateway" ? `<text x='${node.x + 95}' y='${y + 34}' font-family='Inter, Arial' font-size='17' fill='#8A5B00' text-anchor='middle'>×</text>` : node.nodeType === "parallelGateway" ? `<text x='${node.x + 95}' y='${y + 34}' font-family='Inter, Arial' font-size='18' fill='#3C8A38' text-anchor='middle'>+</text>` : node.nodeType === "inclusiveGateway" ? `<circle cx='${node.x + 95}' cy='${y + 29}' r='13' fill='none' stroke='#8A5B00' stroke-width='2'/>` : node.nodeType === "eventGateway" ? `<circle cx='${node.x + 95}' cy='${y + 29}' r='14' fill='none' stroke='#8A5B00' stroke-width='2'/><circle cx='${node.x + 95}' cy='${y + 29}' r='8' fill='none' stroke='#8A5B00' stroke-width='2'/>` : node.nodeType === "subprocess" ? `<rect x='${node.x + 86}' y='${y + 43}' width='18' height='11' fill='white' stroke='#4A90E2'/><text x='${node.x + 95}' y='${y + 53}' font-family='Inter, Arial' font-size='12' fill='#1F4788' text-anchor='middle'>+</text>` : node.nodeType === "intermediate" ? `<ellipse cx='${node.x + 95}' cy='${y + 29}' rx='79' ry='21' fill='none' stroke='#65A30D' stroke-width='1.5'/>` : "";
    return `${shape}${symbol}${marker}<text x='${node.x + 95}' y='${textY + (symbol ? 13 : 0)}' font-family='Inter, Arial' font-size='12' fill='#333333' text-anchor='middle'>${escapeXml(node.label.replace("[A VALIDAR]", "").slice(0, 58))}</text>`;
  }).join("");
  const milestonesSvg = (model.milestones ?? []).map(milestone => `<g><rect x='${milestone.x}' y='19' width='${milestone.width}' height='24' rx='5' fill='#FFFFFF' fill-opacity='0.14' stroke='#FFFFFF' stroke-opacity='0.36'/><text x='${milestone.x + milestone.width / 2}' y='35' font-family='Inter, Arial' font-size='10' font-weight='700' letter-spacing='1.1' fill='#FFFFFF' text-anchor='middle'>${escapeXml(milestone.label.toUpperCase())}</text></g>`).join("");
  const legendY = lanes.length * LANE_HEIGHT + 85;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'><defs><marker id='arrow' markerWidth='9' markerHeight='9' refX='7' refY='4.5' orient='auto'><path d='M0,0 L0,9 L8,4.5 z' fill='#111827'/></marker><marker id='open-arrow' markerWidth='10' markerHeight='10' refX='8' refY='5' orient='auto'><path d='M1,1 L8,5 L1,9' fill='none' stroke='#111827' stroke-width='1.5'/></marker></defs><rect width='100%' height='100%' fill='#F8F9FA'/><rect x='20' y='15' width='${width - 40}' height='32' fill='#1F4788'/><text x='38' y='37' font-family='Inter, Arial' font-size='18' font-weight='700' fill='white'>Fluxo Básico de Acionamento — MPSC</text>${milestonesSvg}${lanesSvg}${edges}${nodes}<rect x='36' y='${legendY}' width='1160' height='310' rx='12' fill='#FFFFFF' stroke='#CBD5E1'/><text x='60' y='${legendY + 30}' font-family='Inter, Arial' font-size='17' font-weight='700' fill='#1F4788'>LEGENDA — BPMN 2.0</text>${buildCompleteLegendSvg(legendY)}</svg>`;
}

function sortedLanes(model: FlowModel) {
  return [...model.pools]
    .sort((a, b) => a.order - b.order)
    .flatMap(pool => model.lanes.filter(lane => lane.poolId === pool.id).sort((a, b) => a.order - b.order));
}

function nodeClass(node: FlowNode) {
  if (["gateway", "parallelGateway", "inclusiveGateway", "eventGateway"].includes(node.nodeType)) return "h-[76px] w-[76px] rotate-45 bg-amber-50 border-[#E59B23] text-amber-950";
  if (node.nodeType === "start") return "h-[56px] w-[190px] rounded-full bg-lime-200 border-lime-600 text-lime-950";
  if (node.nodeType === "intermediate") return "h-[56px] w-[190px] rounded-full border-[3px] border-lime-600 bg-lime-50 text-lime-950";
  if (node.nodeType === "end") return "h-[56px] w-[190px] rounded-full bg-red-50 border-[3px] border-red-600 text-red-900";
  if (node.nodeType === "decision") return "h-[58px] w-[190px] rounded-lg bg-violet-50 border-violet-400 text-violet-950";
  if (node.nodeType === "subprocess") return "h-[62px] w-[190px] rounded-lg bg-blue-50 border-[#4A90E2] text-slate-800";
  if (node.nodeType === "data") return "h-[62px] w-[190px] rounded-none bg-white border-slate-400 text-slate-700";
  if (node.nodeType === "dataStore") return "h-[62px] w-[190px] rounded-[50%] bg-white border-slate-500 text-slate-700";
  if (node.nodeType === "annotation") return "h-[62px] w-[190px] rounded-lg bg-amber-50 border-amber-300 text-amber-950";
  return "h-[58px] w-[190px] rounded-lg bg-blue-50 border-[#4A90E2] text-slate-800";
}

function severityStyle(severity: FlowIssue["severity"]) {
  if (severity === "error") return "bg-red-50 text-red-800 border-red-200";
  if (severity === "warning") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-blue-50 text-blue-800 border-blue-200";
}

function FlowAccessManager({ flowId, ownerId }: { flowId: number; ownerId: number }) {
  const utils = trpc.useUtils();
  const usersQuery = trpc.flow.users.useQuery();
  const membersQuery = trpc.flow.members.useQuery({ flowId });
  const assignMutation = trpc.flow.assignMember.useMutation();
  const removeMutation = trpc.flow.removeMember.useMutation();
  const memberIds = new Set((membersQuery.data ?? []).map(member => member.userId));
  const eligibleUsers = (usersQuery.data ?? []).filter(user => user.id !== ownerId && user.role !== "admin");

  const updateMembership = (userId: number, assigned: boolean) => {
    const mutation = assigned ? removeMutation : assignMutation;
    mutation.mutate({ flowId, userId }, {
      onSuccess: () => {
        utils.flow.members.invalidate({ flowId });
        utils.flow.audit.invalidate({ flowId });
        toast.success(assigned ? "Acesso ao fluxo removido." : "Acesso ao fluxo concedido.");
      },
      onError: error => toast.error(error.message),
    });
  };

  return <Dialog><DialogTrigger asChild><Button variant="outline" title="Gerenciar usuários autorizados neste fluxo"><UserRoundCog className="mr-2 h-4 w-4" />Acessos</Button></DialogTrigger><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Acesso a este fluxo</DialogTitle><DialogDescription>Revisores, aprovadores e editores somente acessam este fluxo quando forem atribuídos. Administradores mantêm acesso global.</DialogDescription></DialogHeader><div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">{eligibleUsers.map(user => { const assigned = memberIds.has(user.id); return <div key={user.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{user.name || user.email || `Usuário ${user.id}`}</p><p className="text-xs text-slate-500">{roleLabels[user.role]}</p></div><Button size="sm" variant={assigned ? "outline" : "default"} disabled={assignMutation.isPending || removeMutation.isPending} onClick={() => updateMembership(user.id, assigned)}>{assigned ? "Remover" : "Conceder"}</Button></div>; })}{eligibleUsers.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">Não há outros usuários elegíveis cadastrados.</p>}</div></DialogContent></Dialog>;
}

export default function FlowEditor() {
  const flowQuery = trpc.flow.getOrCreate.useQuery();
  const [model, setModel] = useState<FlowModel | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [connectorSourceId, setConnectorSourceId] = useState<string | null>(null);
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
  const [infographicPromptOpen, setInfographicPromptOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<FlowModel[]>([]);
  const [redoStack, setRedoStack] = useState<FlowModel[]>([]);
  const [pendingImport, setPendingImport] = useState<MarkdownImportResult | null>(null);
  const [isReadingMarkdown, setIsReadingMarkdown] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [paletteMode, setPaletteMode] = useState<"essential" | "extended">("essential");
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [levelFilter, setLevelFilter] = useState<Exclude<FlowLevel, null> | "all">("all");
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [commentAttachments, setCommentAttachments] = useState<File[]>([]);
  const [isPreparingComment, setIsPreparingComment] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentAttachmentInputRef = useRef<HTMLInputElement>(null);
  const priorModelRef = useRef<FlowModel | null>(null);
  const skipUndoRecordRef = useRef(false);
  const utils = trpc.useUtils();
  const flowId = flowQuery.data?.id;
  const saveMutation = trpc.flow.save.useMutation();
  const restoreMutation = trpc.flow.restore.useMutation();
  const addCommentMutation = trpc.flow.addComment.useMutation();
  const resolveCommentMutation = trpc.flow.resolveComment.useMutation();
  const versionsQuery = trpc.flow.versions.useQuery({ flowId: flowId ?? -1 }, { enabled: Boolean(flowId) });
  const auditQuery = trpc.flow.audit.useQuery({ flowId: flowId ?? -1 }, { enabled: Boolean(flowId) });
  const commentsQuery = trpc.flow.comments.useQuery({ flowId: flowId ?? -1 }, { enabled: Boolean(flowId) });
  const usersQuery = trpc.flow.users.useQuery(undefined, { enabled: Boolean(flowQuery.data?.access?.permissions.manageUsers) });
  const updateUserRoleMutation = trpc.flow.updateUserRole.useMutation();

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
      setRedoStack([]);
    }
    priorModelRef.current = JSON.parse(JSON.stringify(model)) as FlowModel;
    skipUndoRecordRef.current = false;
  }, [model]);

  const lanes = useMemo(() => (model ? sortedLanes(model) : []), [model]);
  const selectedNode = model?.nodes.find(node => node.id === selectedNodeId) ?? null;
  const selectedEdge = model?.edges.find(edge => edge.id === selectedEdgeId) ?? null;
  const issues = useMemo(() => (model ? validateFlowModel(model) : []), [model]);
  const issueCount = issues.filter(issue => issue.severity === "error").length;
  const access = flowQuery.data?.access;
  const canEdit = access?.permissions.edit ?? true;
  const canComment = access?.permissions.comment ?? true;
  const canApprove = access?.permissions.approve ?? false;
  const canManageUsers = access?.permissions.manageUsers ?? false;
  const zoomFactor = zoom / 100;
  const canvasHeight = lanes.length * LANE_HEIGHT + 290;
  const hasUnregisteredChanges = useMemo(() => {
    const latest = versionsQuery.data?.[0]?.snapshot as FlowModel | undefined;
    return Boolean(latest && JSON.stringify(latest) !== JSON.stringify(model));
  }, [model, versionsQuery.data]);
  const comparison = useMemo(() => {
    const selectedVersion = versionsQuery.data?.find(version => version.id === compareVersionId);
    return selectedVersion && model ? compareFlowModels(selectedVersion.snapshot as unknown as FlowModel, model) : null;
  }, [compareVersionId, model, versionsQuery.data]);
  const infographicPrompt = useMemo(() => model ? buildInstitutionalInfographicPrompt(model, flowQuery.data?.title) : "", [flowQuery.data?.title, model]);
  const canvasFilters = useMemo(() => ({ level: levelFilter, responsible: responsibleFilter }), [levelFilter, responsibleFilter]);
  const visibleNodeIds = useMemo(() => new Set(filterFlowNodes(model?.nodes ?? [], canvasFilters).map(node => node.id)), [canvasFilters, model]);
  const responsibleOptions = useMemo(() => model ? listFlowResponsibles(model) : [], [model]);

  const scrollFromMiniMap = (event: React.MouseEvent<HTMLButtonElement>) => {
    const viewport = canvasRef.current?.closest("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    if (!viewport || !model) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    viewport.scrollTo({ left: Math.max(0, x * 3300 * zoomFactor - viewport.clientWidth / 2), top: Math.max(0, y * canvasHeight * zoomFactor - viewport.clientHeight / 2), behavior: "smooth" });
  };

  const copyInfographicPrompt = async () => {
    try {
      await navigator.clipboard.writeText(infographicPrompt);
      toast.success("Prompt de infográfico copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione e copie o texto do prompt.");
    }
  };

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
    const result = undoFlowChange(model, undoStack, redoStack);
    if (!result) {
      toast.message("Não há alteração local para desfazer.");
      return;
    }
    skipUndoRecordRef.current = true;
    setRedoStack(result.redoStack);
    setUndoStack(result.undoStack);
    setModel(result.model);
    toast.success("Alteração local desfeita.");
  };

  const redoLastChange = () => {
    const result = redoFlowChange(model, undoStack, redoStack);
    if (!result) {
      toast.message("Não há alteração local para refazer.");
      return;
    }
    skipUndoRecordRef.current = true;
    setUndoStack(result.undoStack);
    setRedoStack(result.redoStack);
    setModel(result.model);
    toast.success("Alteração local refeita.");
  };

  const snapX = (value: number) => snapCanvasX(value, snapToGrid);

  const autoArrange = () => {
    if (!model || !canEdit) return;
    const nodeIndexByLane = new Map(model.lanes.map(lane => [lane.id, 0]));
    setModel({ ...model, nodes: model.nodes.map(node => {
      const index = nodeIndexByLane.get(node.laneId) ?? 0;
      nodeIndexByLane.set(node.laneId, index + 1);
      return { ...node, x: 350 + index * 230 };
    }) });
    toast.success("Elementos organizados por baia. Revise as conexões antes de registrar a versão.");
  };

  const createVisualConnection = (sourceId: string, targetId: string) => {
    if (!model || !canEdit) return;
    const type = inferConnectionType(model, sourceId, targetId);
    if (!type) {
      toast.error("Escolha dois elementos distintos e válidos para criar a conexão.");
      return;
    }
    if (model.edges.some(edge => edge.sourceId === sourceId && edge.targetId === targetId)) {
      toast.message("Já existe uma conexão entre esses elementos.");
      setConnectorSourceId(null);
      return;
    }
    const edge: FlowEdge = {
      id: `edge-${Date.now()}`,
      sourceId,
      targetId,
      type,
      label: type === "message" ? "Mensagem [A VALIDAR]" : "",
      order: model.edges.length,
    };
    setModel({ ...model, edges: [...model.edges, edge] });
    setConnectorSourceId(null);
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    toast.success(type === "message" ? "Fluxo de mensagem criado entre Pools. Revise o rótulo." : "Fluxo de sequência criado. Ajuste o rótulo quando necessário.");
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
      if ((((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z")) && !typing) {
        event.preventDefault();
        redoLastChange();
      }
    };
    window.addEventListener("keydown", handleKeyboardUndo);
    return () => window.removeEventListener("keydown", handleKeyboardUndo);
  }, [undoStack, redoStack, model]);

  const createNodeAt = (nodeType: FlowNodeType, laneId: string, x: number) => {
    if (!model || !canEdit) return;
    const node: FlowNode = {
      id: `node-${Date.now()}`,
      laneId,
      label: nodeType === "gateway" ? "Nova decisão exclusiva?" : nodeType === "parallelGateway" ? "Ativar ações em paralelo" : nodeType === "inclusiveGateway" ? "Quais condições se aplicam?" : nodeType === "eventGateway" ? "Qual evento ocorrerá primeiro?" : nodeType === "decision" ? "Nova deliberação [A VALIDAR]" : nodeType === "subprocess" ? "Novo subprocesso [A VALIDAR]" : nodeType === "annotation" ? "Nova observação [A VALIDAR]" : nodeType === "start" ? "Novo início" : nodeType === "intermediate" ? "Novo evento intermediário" : nodeType === "end" ? "Novo encerramento" : nodeType === "data" ? "Novo objeto de dados [A VALIDAR]" : nodeType === "dataStore" ? "Novo repositório de dados [A VALIDAR]" : "Nova ação [A VALIDAR]",
      nodeType,
      x: snapX(x),
      y: 0,
      responsible: selectedNode?.responsible ?? "[A VALIDAR]",
      notes: "",
      gatewayCondition: nodeType === "gateway" ? "SIM / NÃO" : nodeType === "parallelGateway" ? "Todas as saídas aplicáveis" : nodeType === "inclusiveGateway" ? "Uma, algumas ou todas as condições" : nodeType === "eventGateway" ? "Evento que ocorrer primeiro" : "",
      level: null,
      requiresValidation: !["start", "intermediate", "end", "parallelGateway"].includes(nodeType),
    };
    setModel({ ...model, nodes: [...model.nodes, node] });
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    toast.success("Elemento inserido. Preencha agora as propriedades no painel lateral.");
  };

  const handleNodeDrop = (event: React.DragEvent<HTMLDivElement>, laneId: string) => {
    event.preventDefault();
    if (!canEdit || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = snapX(calculateCanvasDropX({ clientX: event.clientX, canvasLeft: rect.left, scrollLeft: canvasRef.current.parentElement?.scrollLeft ?? 0, zoomPercent: zoom, nodeWidth: NODE_WIDTH }));
    const paletteType = event.dataTransfer.getData("application/x-bpmn-node-type") as FlowNodeType;
    if (paletteType && Object.prototype.hasOwnProperty.call(nodeTypeLabels, paletteType)) {
      createNodeAt(paletteType, laneId, x);
      return;
    }
    if (!draggedNodeId) return;
    setModel(current => current ? { ...current, nodes: current.nodes.map(node => node.id === draggedNodeId ? { ...node, laneId, x: snapX(x) } : node) } : current);
    setDraggedNodeId(null);
  };

  const addNode = (nodeType: FlowNodeType) => {
    if (!model || !canEdit) return;
    const maxX = Math.max(...model.nodes.map(node => node.x), 400);
    createNodeAt(nodeType, selectedNode?.laneId ?? "mpsc-cisi", maxX + 240);
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
        utils.flow.audit.invalidate({ flowId });
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
        utils.flow.audit.invalidate({ flowId });
        toast.success("Versão restaurada como novo rascunho.");
      },
      onError: error => toast.error(error.message),
    });
  };

  const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Não foi possível preparar o anexo."));
    reader.readAsDataURL(file);
  });

  const addCommentAttachments = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    if (commentAttachments.length + files.length > 5) {
      toast.error("Inclua no máximo 5 anexos por comentário.");
      return;
    }
    if (files.some(file => file.size > 5 * 1024 * 1024)) {
      toast.error("Cada anexo deve ter no máximo 5 MB.");
      return;
    }
    setCommentAttachments(current => [...current, ...files]);
  };

  const submitComment = async () => {
    if (!flowId || commentText.trim().length < 2 || !canComment) return;
    setIsPreparingComment(true);
    try {
      const attachments = await Promise.all(commentAttachments.map(async file => ({ filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size, contentBase64: await fileToBase64(file) })));
      addCommentMutation.mutate({ flowId, elementId: selectedNodeId ?? selectedEdgeId ?? undefined, content: commentText.trim(), attachments }, {
      onSuccess: () => {
        setCommentText("");
        setCommentAttachments([]);
        utils.flow.comments.invalidate({ flowId });
        utils.flow.audit.invalidate({ flowId });
        toast.success("Comentário adicionado à revisão.");
      },
      onError: error => toast.error(error.message),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível preparar os anexos.");
    } finally {
      setIsPreparingComment(false);
    }
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
    try {
      const filename = `${(model.sourceTitle ?? "fluxo-mpsc").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "fluxo-mpsc"}.bpmn`;
      downloadFile(filename, buildBpmnXml(model), "application/xml");
      toast.success("Fluxo BPMN 2.0 baixado para teste de importação no Bizagi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o arquivo BPMN.");
    }
  };

  if (flowQuery.isLoading || !model) {
    return <div className="flex h-[70vh] items-center justify-center text-slate-600"><Loader2 className="mr-3 h-5 w-5 animate-spin" />Carregando espaço de modelagem…</div>;
  }

  return (
    <div className="min-h-[calc(100vh-2rem)] bg-[#F5F7FA] text-slate-900">
      <header className="border-b border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
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
            {access && <Badge variant="outline" className="border-slate-300 bg-white text-slate-700"><UserRoundCog className="mr-1 h-3.5 w-3.5" />{roleLabels[access.role]}</Badge>}
            {hasUnregisteredChanges && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Alterações não registradas</Badge>}
            {canManageUsers && flowId && <FlowAccessManager flowId={flowId} ownerId={flowQuery.data?.ownerId ?? -1} />}
            <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={readMarkdownFile} />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isReadingMarkdown}><Upload className="mr-2 h-4 w-4" />{isReadingMarkdown ? "Lendo MD…" : "Importar MD"}</Button>
            <Button variant="outline" onClick={undoLastChange} disabled={undoStack.length === 0} title="Desfazer alteração local (Ctrl+Z)"><Undo2 className="mr-2 h-4 w-4" />Desfazer</Button>
            <Button variant="outline" onClick={redoLastChange} disabled={redoStack.length === 0} title="Refazer alteração local (Ctrl+Y ou Ctrl+Shift+Z)"><Redo2 className="mr-2 h-4 w-4" />Refazer</Button>
            <Dialog open={infographicPromptOpen} onOpenChange={setInfographicPromptOpen}><DialogTrigger asChild><Button variant="outline" title="Gerar prompt de infográfico institucional"><Sparkles className="mr-2 h-4 w-4" />Prompt infográfico</Button></DialogTrigger><DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Prompt para infográfico institucional</DialogTitle><DialogDescription>O texto é montado a partir do fluxo atual. Revise as marcações <code>[A VALIDAR]</code> antes de utilizá-lo em uma ferramenta de criação de imagem.</DialogDescription></DialogHeader><div className="space-y-3"><div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-[#1F4788]"><strong>Uso recomendado:</strong> copie o prompt, revise o conteúdo institucional e utilize-o na ferramenta de geração de imagem de sua escolha. O botão não gera nem publica imagens.</div><Textarea aria-label="Prompt de infográfico institucional" readOnly value={infographicPrompt} className="min-h-[440px] resize-y font-mono text-xs leading-relaxed" /><div className="flex justify-end"><Button className="bg-[#1F4788] hover:bg-[#16396f]" onClick={copyInfographicPrompt}><Copy className="mr-2 h-4 w-4" />Copiar prompt</Button></div></div></DialogContent></Dialog>
            <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogTrigger asChild><Button variant="outline"><CircleHelp className="mr-2 h-4 w-4" />Como usar</Button></DialogTrigger><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Orientação de uso do editor BPMN</DialogTitle><DialogDescription>Este espaço é uma minuta de modelagem e revisão. A versão institucional definitiva deve ser validada pela CISI e modelada no Bizagi.</DialogDescription></DialogHeader><div className="space-y-4 text-sm leading-relaxed text-slate-700"><div><b>1. Estruture o fluxo.</b> Adicione ações, decisões, eventos e objetos de dados. Arraste uma ação para alterar sua baia ou sua ordem horizontal. Arraste os rótulos das baias para reordená-las.</div><div><b>2. Preserve a governança.</b> A Administração Superior permanece bloqueada na primeira baia do Pool MPSC. Para interlocução externa, use o Pool de órgãos externos e conexões do tipo “fluxo de mensagem”.</div><div><b>3. Revise propriedades.</b> Selecione uma ação ou ligação no canvas e ajuste rótulo, responsável, observações, condição e nível N0–N3. Mantenha a marcação <code>[A VALIDAR]</code> em todo dado ainda não confirmado.</div><div><b>4. Resolva alertas.</b> O painel “Revisão” aponta fluxos inválidos entre Pools, gateways sem rótulo de saída, ações desconectadas e conflitos elementares de competência.</div><div><b>5. Proteja a informação.</b> Este ambiente não substitui os controles institucionais de classificação. Não insira dados pessoais, dados sensíveis, informação de inteligência ou detalhes operacionais restritos sem autorização e tratamento adequado.</div><div><b>6. Registre decisão e exporte.</b> Adicione comentários, registre uma versão com resumo e status, compare com versões anteriores ou restaure um rascunho. Exporte SVG, especiﬁcação JSON ou imprima em A1/PDF.</div><div><b>7. Use o teclado.</b> Pressione <code>Ctrl+Z</code> para desfazer e <code>Ctrl+Y</code> ou <code>Ctrl+Shift+Z</code> para refazer. Os controles principais podem ser percorridos com <code>Tab</code>.</div></div></DialogContent></Dialog>
            <Button variant="outline" onClick={() => downloadFile("fluxo-mpsc-especificacao.json", JSON.stringify({ title: flowQuery.data?.title, status, model, exportedAt: new Date().toISOString() }, null, 2), "application/json")}><FileJson className="mr-2 h-4 w-4" />Especificação</Button>
            <Button className="bg-[#1F4788] hover:bg-[#16396f]" onClick={downloadBpmn}><Download className="mr-2 h-4 w-4" />Baixar fluxo</Button>
            <Button variant="outline" onClick={() => downloadFile("fluxo-mpsc-visao.svg", buildExportSvg(model), "image/svg+xml")}><Download className="mr-2 h-4 w-4" />Imagem SVG</Button>
            <Button variant="outline" onClick={printFlow}><FileText className="mr-2 h-4 w-4" />Imprimir / PDF</Button>
            <Button className="bg-[#1F4788] hover:bg-[#16396f]" onClick={saveVersion} disabled={saveMutation.isPending || (!canEdit && !(canApprove && (status === "approved" || status === "archived")))}><Save className="mr-2 h-4 w-4" />{saveMutation.isPending ? "Salvando…" : status === "approved" ? "Aprovar versão" : "Registrar versão"}</Button>
            <Dialog open={Boolean(pendingImport)} onOpenChange={open => { if (!open) setPendingImport(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Confirmar geração da visão BPMN</DialogTitle><DialogDescription>O arquivo será convertido em um rascunho inicial editável. Nenhuma versão será registrada até que você selecione “Registrar versão”.</DialogDescription></DialogHeader>{pendingImport && <div className="space-y-4 text-sm text-slate-700"><div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="font-semibold text-[#1F4788]">{pendingImport.model.sourceFileName}</p><p className="mt-1">{pendingImport.summary.pools} Pools · {pendingImport.summary.lanes} baias · {pendingImport.summary.nodes} elementos iniciais · {pendingImport.summary.validationFields} marcações [A VALIDAR]</p></div><div><p className="font-semibold">Como o sistema interpretou o MD</p><p className="mt-1 leading-relaxed">As seções e atividades identificáveis são convertidas em uma visão inicial do fluxo. Itens ambíguos permanecem no modelo-base e devem ser revisados no canvas.</p></div>{pendingImport.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="font-semibold text-amber-900">Pontos para revisão</p><ul className="mt-1 list-disc space-y-1 pl-5 text-amber-900">{pendingImport.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPendingImport(null)}>Cancelar</Button><Button className="bg-[#1F4788] hover:bg-[#16396f]" onClick={applyMarkdownImport}>Gerar visão editável</Button></div></div>}</DialogContent></Dialog>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[250px_minmax(0,1fr)_350px]">
        <div className="col-span-full flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><p><strong>Uso institucional e classificação.</strong> Este editor gera minuta técnica de modelagem e revisão, não ato normativo nem comando operacional. Preserve a marcação <code>[A VALIDAR]</code> até a validação competente e não inclua dados pessoais, sensíveis, de inteligência ou informações operacionais restritas sem classificação, autorização e tratamento institucional adequados.</p></div>
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:h-[calc(100vh-3rem)]">
          <div className="mb-4 flex items-center gap-2"><div className="rounded-md bg-blue-50 p-2 text-[#1F4788]"><Plus className="h-4 w-4" /></div><div><h2 className="font-semibold">Elementos BPMN</h2><p className="text-xs text-slate-500">Adicionar ao rascunho</p></div></div>
          <div className="mb-3 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs"><button aria-pressed={paletteMode === "essential"} onClick={() => setPaletteMode("essential")} className={`rounded-md px-2 py-1.5 font-semibold ${paletteMode === "essential" ? "bg-white text-[#1F4788] shadow-sm" : "text-slate-500"}`}>Essencial</button><button aria-pressed={paletteMode === "extended"} onClick={() => setPaletteMode("extended")} className={`rounded-md px-2 py-1.5 font-semibold ${paletteMode === "extended" ? "bg-white text-[#1F4788] shadow-sm" : "text-slate-500"}`}>Estendido</button></div>
          <div className="space-y-2">
            {(paletteMode === "essential" ? essentialNodeTypes : extendedNodeTypes).map(type => <Button key={type} variant="outline" draggable={canEdit} onDragStart={event => { event.dataTransfer.setData("application/x-bpmn-node-type", type); event.dataTransfer.effectAllowed = "copy"; }} className="w-full cursor-grab justify-start border-slate-200 active:cursor-grabbing" onClick={() => addNode(type)} disabled={!canEdit}>{["gateway", "parallelGateway", "inclusiveGateway", "eventGateway"].includes(type) ? <GitBranch className={`mr-2 h-4 w-4 ${type === "gateway" ? "text-amber-600" : "text-yellow-700"}`} /> : ["data", "dataStore", "annotation"].includes(type) ? <FileText className={`mr-2 h-4 w-4 ${type === "annotation" ? "text-amber-700" : "text-slate-600"}`} /> : ["start", "intermediate", "end"].includes(type) ? <CircleDot className={`mr-2 h-4 w-4 ${type === "end" ? "text-red-600" : "text-lime-600"}`} /> : <Workflow className={`mr-2 h-4 w-4 ${type === "decision" ? "text-violet-600" : "text-[#4A90E2]"}`} />}{nodeTypeLabels[type]}</Button>)}
          </div>
          <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-2 text-[11px] leading-relaxed text-[#1F4788]"><strong>Inserção direta.</strong> Arraste um elemento desta paleta até a posição desejada no canvas. Ao soltar, as propriedades serão abertas para preenchimento.</p>
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
            <div><h2 className="font-semibold text-slate-900">Canvas de revisão</h2><p className="text-sm text-slate-500">Arraste elementos entre baias ou ao longo da faixa. Arraste novos elementos da paleta para inseri-los no ponto desejado.</p></div>
            <div className="flex flex-wrap items-center justify-end gap-3"><div className="flex items-center gap-2 text-xs text-slate-500"><span className="inline-flex h-2 w-2 rounded-full bg-[#4A90E2]" />fluxo de sequência <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-slate-500" />mensagem externa</div><div className="flex items-center gap-1"><Select value={levelFilter} onValueChange={value => setLevelFilter(value as Exclude<FlowLevel, null> | "all")}><SelectTrigger className="h-8 w-[108px] text-xs"><SelectValue placeholder="Nível" /></SelectTrigger><SelectContent><SelectItem value="all">Todos níveis</SelectItem><SelectItem value="N0">N0</SelectItem><SelectItem value="N1">N1</SelectItem><SelectItem value="N2">N2</SelectItem><SelectItem value="N3">N3</SelectItem></SelectContent></Select><Select value={responsibleFilter} onValueChange={setResponsibleFilter}><SelectTrigger className="h-8 w-[132px] text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger><SelectContent><SelectItem value="all">Todos responsáveis</SelectItem>{responsibleOptions.map(responsible => <SelectItem key={responsible} value={responsible}>{responsible}</SelectItem>)}</SelectContent></Select>{(levelFilter !== "all" || responsibleFilter !== "all") && <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setLevelFilter("all"); setResponsibleFilter("all"); }}>Limpar</Button>}</div><Button size="sm" variant="outline" onClick={() => setShowGrid(current => !current)}><Grid3X3 className="mr-1.5 h-3.5 w-3.5" />{showGrid ? "Ocultar grade" : "Exibir grade"}</Button><Button size="sm" variant="outline" onClick={() => setSnapToGrid(current => !current)}><Sparkles className="mr-1.5 h-3.5 w-3.5" />{snapToGrid ? "Encaixe ativo" : "Encaixe livre"}</Button><Button size="sm" variant="outline" onClick={autoArrange} disabled={!canEdit}><Maximize2 className="mr-1.5 h-3.5 w-3.5" />Organizar</Button><button type="button" onClick={scrollFromMiniMap} className="relative h-10 w-24 overflow-hidden rounded border border-slate-300 bg-slate-50" title="Mini-mapa: clique para navegar pelo canvas" aria-label="Mini-mapa navegável do canvas">{lanes.map((lane, index) => <span key={lane.id} className={`absolute inset-x-0 border-b border-slate-200 ${lane.poolId === "externo" ? "bg-slate-200" : "bg-blue-50"}`} style={{ top: `${(index / lanes.length) * 100}%`, height: `${100 / lanes.length}%` }} />)}{model.nodes.filter(node => visibleNodeIds.has(node.id)).map(node => <span key={node.id} className="absolute h-1.5 w-1.5 rounded-full bg-[#1F4788]" style={{ left: `${Math.min(96, Math.max(1, ((node.x + NODE_WIDTH / 2) / 3300) * 100))}%`, top: `${Math.min(94, Math.max(2, ((lanes.findIndex(lane => lane.id === node.laneId) + 0.52) / lanes.length) * 100))}%` }} />)}</button><div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" aria-label="Régua de zoom do canvas"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(current => Math.max(50, current - 10))} disabled={zoom <= 50} title="Diminuir zoom" aria-label="Diminuir zoom"><ZoomOut className="h-4 w-4" /></Button><span className="min-w-12 text-center text-xs font-semibold tabular-nums text-slate-700">{zoom}%</span><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(current => Math.min(150, current + 10))} disabled={zoom >= 150} title="Aumentar zoom" aria-label="Aumentar zoom"><ZoomIn className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(100)} title="Ajustar para 100%" aria-label="Ajustar zoom para 100%"><Maximize2 className="h-4 w-4" /></Button></div></div>
          </div>
          <ScrollArea className="h-[calc(100vh-15rem)] min-h-[650px]">
            <div className="p-5" style={{ minWidth: 3340 * zoomFactor }}>
              <div style={{ width: 3300 * zoomFactor, height: canvasHeight * zoomFactor }}>
              <div ref={canvasRef} className="relative overflow-hidden rounded-xl border border-slate-300 bg-[#F8F9FA] shadow-inner" style={{ width: 3300, height: canvasHeight, transform: `scale(${zoomFactor})`, transformOrigin: "top left", backgroundImage: showGrid ? "radial-gradient(#CBD5E1 0.75px, transparent 0.75px)" : undefined, backgroundSize: "20px 20px" }}>
                <div className="absolute inset-x-0 top-0 flex h-14 items-center bg-[#1F4788] px-5 text-sm font-semibold tracking-wide text-white">POOL 1 — MPSC | GOVERNANÇA E RESPOSTA INSTITUCIONAL <span className="ml-4 border-l border-white/30 pl-4 text-xs font-medium text-blue-100">Rascunho auditável · Fluxo de nível Promotoria</span></div>
                {(model.milestones ?? []).map(milestone => <div key={milestone.id} className="pointer-events-none absolute top-1 z-10 rounded border border-white/30 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-[0.12em] text-white" style={{ left: milestone.x, width: milestone.width }}>{milestone.label}</div>)}
                <svg className="pointer-events-none absolute inset-0 z-[25] h-full w-full" width="3300" height={lanes.length * LANE_HEIGHT + 56} aria-label="Conectores editáveis do fluxo">
                  <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4 Z" fill="#111827" /></marker><marker id="open-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M1,1 L8,5 L1,9" fill="none" stroke="#111827" strokeWidth="1.5" /></marker></defs>
                  {model.edges.map(edge => {
                    const source = model.nodes.find(node => node.id === edge.sourceId);
                    const target = model.nodes.find(node => node.id === edge.targetId);
                    if (!source || !target || !visibleNodeIds.has(source.id) || !visibleNodeIds.has(target.id)) return null;
                    const sourceLane = lanes.findIndex(lane => lane.id === source.laneId);
                    const targetLane = lanes.findIndex(lane => lane.id === target.laneId);
                    const y1 = 56 + sourceLane * LANE_HEIGHT + 78;
                    const y2 = 56 + targetLane * LANE_HEIGHT + 78;
                    const x1 = source.x + NODE_WIDTH;
                    const x2 = target.x;
                    const mid = Math.round((x1 + x2) / 2);
                    return <g key={edge.id} className="pointer-events-auto cursor-pointer" onClick={event => { event.stopPropagation(); setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}>{edge.type === "message" && <circle cx={x1 + 4} cy={y1} r="4" fill="white" stroke="#111827" strokeWidth="1.5" />}<path d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`} fill="none" stroke="#111827" strokeWidth={selectedEdgeId === edge.id ? "4" : "2"} strokeDasharray={edge.type === "message" ? "8 6" : edge.type === "association" ? "4 5" : undefined} markerEnd={edge.type === "association" ? "url(#open-arrow)" : "url(#arrow)"} /><text x={mid} y={Math.min(y1, y2) - 7} textAnchor="middle" fontSize="12" fill="#516070">{edge.label}</text></g>;
                  })}
                </svg>
                {lanes.map((lane, index) => {
                  const laneNodes = model.nodes.filter(node => node.laneId === lane.id && visibleNodeIds.has(node.id));
                  const isAdmin = lane.id === ADMINISTRATION_LANE_ID;
                  const isCisi = lane.id === "mpsc-cisi";
                  return <div key={lane.id} className={`absolute left-0 right-0 z-20 border-b border-slate-200 ${isAdmin ? "bg-[#E4EFFB]" : isCisi ? "bg-[#DCEBFA]" : lane.poolId === "externo" ? "bg-slate-100" : "bg-white"}`} style={{ top: 56 + index * LANE_HEIGHT, height: LANE_HEIGHT }} onDragOver={event => event.preventDefault()} onDrop={event => handleNodeDrop(event, lane.id)}>
                    {lane.poolId === "externo" && <div className="absolute inset-x-0 top-0 flex h-8 items-center bg-[#687385] px-5 text-xs font-semibold tracking-wide text-white">POOL 2 — ÓRGÃOS EXTERNOS DE RESPOSTA <span className="ml-4 text-[11px] font-medium text-slate-200">Interação por fluxo de mensagem</span></div>}
                    {lane.poolId !== "externo" && <div className="absolute left-3 top-3 flex w-[260px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white" draggable={!isAdmin} onDoubleClick={() => { if (!isAdmin) { const nextLabel = window.prompt("Nome da baia", lane.label); if (nextLabel?.trim()) setModel(current => current ? { ...current, lanes: current.lanes.map(item => item.id === lane.id ? { ...item, label: nextLabel.trim() } : item) } : current); } }} onDragStart={() => setDraggedLaneId(lane.id)} onDragEnd={() => setDraggedLaneId(null)} onDrop={event => { event.preventDefault(); if (draggedLaneId) moveLane(draggedLaneId, lane.id); }} style={{ background: isAdmin ? "#1F4788" : isCisi ? "#4A90E2" : "#6AA6D8" }}>
                      {!isAdmin && <GripVertical className="h-4 w-4 opacity-80" />}<span className="truncate">{isAdmin ? "1. " : ""}{lane.label}</span>{isCisi && <Badge className="ml-auto bg-white/20 text-[10px] text-white hover:bg-white/20">FOCAL</Badge>}
                    </div>}
                    {lane.poolId === "externo" && <div className="absolute left-3 top-10 flex w-[360px] items-center gap-2 rounded-lg bg-[#687385] px-3 py-2 text-xs font-semibold text-white"><span className="truncate">{lane.label}</span></div>}
                    {laneNodes.map(node => <div key={node.id}><button draggable={canEdit} onDragStart={event => { setDraggedNodeId(node.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedNodeId(null)} onClick={() => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }} className={`absolute ${lane.poolId === "externo" ? "top-[58px]" : "top-[48px]"} z-30 flex items-center justify-center border-2 px-3 text-center text-xs font-medium leading-snug shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${nodeClass(node)} ${selectedNodeId === node.id ? "ring-4 ring-[#87CEEB]/70" : ""}`} style={{ left: node.x }}><span className={`line-clamp-3 ${["gateway", "parallelGateway", "inclusiveGateway", "eventGateway"].includes(node.nodeType) ? "-rotate-45 w-[112px]" : ""}`}>{node.nodeType === "parallelGateway" && <span className="mb-1 block text-lg font-bold leading-none text-green-700">+</span>}{node.nodeType === "gateway" && <span className="mb-1 block text-lg font-bold leading-none text-amber-700">×</span>}{node.nodeType === "inclusiveGateway" && <span className="mb-1 block text-lg font-bold leading-none text-amber-800">○</span>}{node.nodeType === "eventGateway" && <span className="mb-1 block text-lg font-bold leading-none text-amber-800">◎</span>}{node.nodeType === "subprocess" && <span className="mb-1 block text-sm font-bold leading-none text-[#1F4788]">⊞</span>}{node.requiresValidation && <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-red-600">[A VALIDAR]</span>}{node.label.replace("[A VALIDAR]", "")}</span></button><button type="button" draggable={canEdit} onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData("application/x-bpmn-connector-source", node.id); event.dataTransfer.effectAllowed = "link"; setConnectorSourceId(node.id); }} onDragEnd={() => setConnectorSourceId(null)} onClick={event => { event.stopPropagation(); setConnectorSourceId(node.id); toast.message("Agora arraste a ligação até o ponto de entrada do elemento de destino."); }} aria-label={`Criar conexão a partir de ${node.label}`} title="Arraste para criar conexão" className={`absolute z-40 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white text-[10px] text-white shadow-sm ${connectorSourceId === node.id ? "bg-emerald-600 ring-2 ring-emerald-300" : "bg-[#1F4788] hover:bg-[#4A90E2]"}`} style={{ left: node.x + NODE_WIDTH - 8, top: (lane.poolId === "externo" ? 58 : 48) + 22 }}>+</button><button type="button" onDragOver={event => { if (canEdit) event.preventDefault(); }} onDrop={event => { event.preventDefault(); event.stopPropagation(); const sourceId = event.dataTransfer.getData("application/x-bpmn-connector-source") || connectorSourceId; if (sourceId) createVisualConnection(sourceId, node.id); }} onClick={event => { event.stopPropagation(); if (connectorSourceId) createVisualConnection(connectorSourceId, node.id); else toast.message("Arraste o ponto de saída de um elemento até este ponto de entrada."); }} aria-label={`Receber conexão em ${node.label}`} title="Solte uma conexão aqui" className="absolute z-40 h-4 w-4 rounded-full border-2 border-white bg-slate-500 shadow-sm hover:bg-[#4A90E2]" style={{ left: node.x - 8, top: (lane.poolId === "externo" ? 58 : 48) + 22 }} /></div>)}
                  </div>;
                })}
                <div className="absolute bottom-5 left-5 z-30 w-[760px] rounded-xl border border-slate-300 bg-white/95 p-4 shadow-sm backdrop-blur"><div className="mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#1F4788]" /><h3 className="text-sm font-bold tracking-wide text-[#1F4788]">LEGENDA — BPMN 2.0</h3></div><div className="grid grid-cols-2 gap-x-7 gap-y-2 text-xs text-slate-700"><div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border-2 border-lime-600 bg-lime-200" />Evento de início</div><div className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border-2 border-red-600 bg-red-200" />Evento de fim</div><div className="flex items-center gap-2"><span className="h-5 w-7 rounded-md border-2 border-[#4A90E2] bg-white" />Tarefa / atividade</div><div className="flex items-center gap-2"><span className="h-5 w-7 rounded-md border-2 border-violet-400 bg-violet-50" />Tarefa de decisão / deliberação</div><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rotate-45 border-2 border-amber-500 bg-amber-50 text-sm text-amber-800"><span className="-rotate-45">×</span></span>Gateway exclusivo (XOR)</div><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rotate-45 border-2 border-yellow-600 bg-yellow-50 text-sm text-yellow-800"><span className="-rotate-45">+</span></span>Gateway paralelo (AND)</div><div className="flex items-center gap-2"><span className="w-8 border-t-2 border-[#1F4788]" />Fluxo de sequência</div><div className="flex items-center gap-2"><span className="w-8 border-t-2 border-dashed border-slate-600" />Fluxo de mensagem</div><div className="flex items-center gap-2"><span className="h-6 w-5 rounded-sm border-2 border-slate-500 bg-white" />Objeto de dados</div><div className="flex items-center gap-2"><span className="h-6 w-7 rounded-md border-2 border-amber-300 bg-amber-50" />Anotação / observação</div><div className="flex items-center gap-2"><span className="w-8 border-t-2 border-dashed border-slate-400" />Associação / anotação</div></div></div>
              </div>
              </div>
            </div>
          </ScrollArea>
        </section>

        <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 xl:h-[calc(100vh-3rem)]">
          <Tabs defaultValue="properties" className="flex h-full flex-col">
            <TabsList className="m-3 grid grid-cols-3 bg-slate-100"><TabsTrigger value="properties"><Settings2 className="mr-1 h-3.5 w-3.5" />Propr.</TabsTrigger><TabsTrigger value="review"><MessageSquare className="mr-1 h-3.5 w-3.5" />Revisão</TabsTrigger><TabsTrigger value="history"><History className="mr-1 h-3.5 w-3.5" />Histórico</TabsTrigger></TabsList>
            <TabsContent value="properties" className="mt-0 min-h-0 flex-1"><ScrollArea className="h-[calc(100vh-8.5rem)] px-4 pb-5">
              {selectedNode ? <div className="space-y-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Elemento selecionado</p><h3 className="font-semibold">{nodeTypeLabels[selectedNode.nodeType]}</h3></div><Button size="icon" variant="ghost" onClick={removeSelected} aria-label="Remover elemento selecionado"><X className="h-4 w-4" /></Button></div>
                <div className="space-y-2"><Label>Rótulo</Label><Textarea value={selectedNode.label} disabled={!canEdit} onChange={event => updateNode({ label: event.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Tipo</Label><Select value={selectedNode.nodeType} onValueChange={value => updateNode({ nodeType: value as FlowNodeType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(nodeTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Nível</Label><Select value={selectedNode.level ?? "none"} onValueChange={value => updateNode({ level: value === "none" ? null : value as FlowLevel })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não aplicável</SelectItem><SelectItem value="N0">N0</SelectItem><SelectItem value="N1">N1</SelectItem><SelectItem value="N2">N2</SelectItem><SelectItem value="N3">N3</SelectItem></SelectContent></Select></div></div>
                <div className="space-y-2"><Label>Responsável</Label><Input value={selectedNode.responsible} disabled={!canEdit} onChange={event => updateNode({ responsible: event.target.value })} /></div>
                <div className="space-y-2"><Label>Observações</Label><Textarea value={selectedNode.notes} disabled={!canEdit} onChange={event => updateNode({ notes: event.target.value })} /></div>
                {["gateway", "parallelGateway", "inclusiveGateway", "eventGateway"].includes(selectedNode.nodeType) && <div className="space-y-2"><Label>Condições de saída</Label><Input value={selectedNode.gatewayCondition} disabled={!canEdit} onChange={event => updateNode({ gatewayCondition: event.target.value })} placeholder="SIM / NÃO ou N0 / N1 / N2 / N3" /></div>}
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" disabled={!canEdit} checked={selectedNode.requiresValidation} onChange={event => { const required = event.target.checked; updateNode({ requiresValidation: required, label: required && !selectedNode.label.includes("[A VALIDAR]") ? `${selectedNode.label} [A VALIDAR]` : !required ? selectedNode.label.replace(" [A VALIDAR]", "") : selectedNode.label }); }} />Campo depende de validação institucional</label>
              </div> : selectedEdge ? <div className="space-y-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Conector selecionado</p><h3 className="font-semibold">Ligação BPMN</h3></div><Button size="icon" variant="ghost" onClick={removeSelected} aria-label="Remover conector selecionado"><X className="h-4 w-4" /></Button></div><div className="space-y-2"><Label>Origem</Label><Select value={selectedEdge.sourceId} onValueChange={value => updateEdge({ sourceId: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{model.nodes.map(node => <SelectItem key={node.id} value={node.id}>{node.label.slice(0, 44)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Destino</Label><Select value={selectedEdge.targetId} onValueChange={value => updateEdge({ targetId: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{model.nodes.map(node => <SelectItem key={node.id} value={node.id}>{node.label.slice(0, 44)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Tipo</Label><Select value={selectedEdge.type} onValueChange={value => updateEdge({ type: value as FlowEdge["type"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sequence">Fluxo de sequência</SelectItem><SelectItem value="message">Fluxo de mensagem</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Rótulo da conexão</Label><Input value={selectedEdge.label} onChange={event => updateEdge({ label: event.target.value })} /></div></div> : <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500"><Settings2 className="mx-auto mb-3 h-6 w-6 text-slate-400" />Selecione uma ação, decisão, dado ou conexão para editar suas propriedades.</div>}
            </ScrollArea></TabsContent>
            <TabsContent value="review" className="mt-0 min-h-0 flex-1"><ScrollArea className="h-[calc(100vh-8.5rem)] px-4 pb-5"><div className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Validações automáticas</p><h3 className="font-semibold">Regras de coerência BPMN</h3></div>{issues.length === 0 ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mb-2 h-5 w-5" />Não há inconsistências detectadas no modelo atual.</div> : <div className="space-y-2">{issues.map(issue => <button key={issue.id} className={`w-full rounded-lg border p-3 text-left text-sm ${severityStyle(issue.severity)}`} onClick={() => { if (issue.nodeId) { setSelectedNodeId(issue.nodeId); setSelectedEdgeId(null); } if (issue.edgeId) { setSelectedEdgeId(issue.edgeId); setSelectedNodeId(null); } }}><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{issue.message}</span></div></button>)}</div>}
                <Separator />
                <div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Comentário de revisão</p><p className="mt-1 text-sm text-slate-500">Vinculado ao elemento selecionado quando houver seleção. Anexe fontes, pareceres ou evidências com até 5 MB cada.</p></div><Textarea value={commentText} disabled={!canComment} onChange={event => setCommentText(event.target.value)} placeholder="Descreva o ajuste ou a dúvida institucional…" /><input ref={commentAttachmentInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.xml,.bpmn" className="hidden" onChange={addCommentAttachments} /><div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={!canComment} onClick={() => commentAttachmentInputRef.current?.click()}><Paperclip className="mr-2 h-4 w-4" />Anexar</Button><Button className="flex-1" onClick={submitComment} disabled={!canComment || isPreparingComment || addCommentMutation.isPending || commentText.trim().length < 2}><MessageSquare className="mr-2 h-4 w-4" />{isPreparingComment ? "Preparando…" : "Registrar"}</Button></div>{commentAttachments.length > 0 && <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2">{commentAttachments.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs text-slate-700"><span className="truncate">{file.name}</span><button className="text-slate-400 hover:text-red-600" onClick={() => setCommentAttachments(current => current.filter((_, fileIndex) => fileIndex !== index))}><X className="h-3.5 w-3.5" /></button></div>)}</div>}
                <div className="space-y-2">{commentsQuery.data?.map(comment => <div key={comment.id} className="rounded-lg border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between"><Badge variant="outline" className={comment.status === "resolved" ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}>{comment.status === "resolved" ? "Resolvido" : "Aberto"}</Badge>{comment.status === "open" && <Button size="sm" variant="ghost" disabled={!canComment} onClick={() => resolveCommentMutation.mutate({ commentId: comment.id }, { onSuccess: () => { if (flowId) { utils.flow.comments.invalidate({ flowId }); utils.flow.audit.invalidate({ flowId }); } } })}>Resolver</Button>}</div><p className="text-sm leading-relaxed text-slate-700">{comment.content}</p>{comment.attachments?.length > 0 && <div className="mt-3 space-y-1">{comment.attachments.map(attachment => <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs font-medium text-[#1F4788] hover:bg-blue-50"><Paperclip className="h-3.5 w-3.5" />{attachment.filename}</a>)}</div>}</div>)}</div>
              </div></ScrollArea></TabsContent>
            <TabsContent value="history" className="mt-0 min-h-0 flex-1"><ScrollArea className="h-[calc(100vh-8.5rem)] px-4 pb-5"><div className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Controle de versão</p><h3 className="font-semibold">Histórico persistente</h3><p className="mt-1 text-sm text-slate-500">Depois de importar ou editar, registre uma versão para manter o estado recuperável.</p></div>{hasUnregisteredChanges && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><b>Alterações não registradas.</b> O estado atual pode ser salvo como nova versão; versões anteriores continuam preservadas.</div>}<div className="space-y-2"><Label>Status da próxima versão</Label><Select value={status} onValueChange={value => setStatus(value as keyof typeof statusLabels)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).filter(([value]) => canApprove || (value !== "approved" && value !== "archived")).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Resumo da alteração</Label><Textarea value={changeSummary} disabled={!canEdit && !canApprove} onChange={event => setChangeSummary(event.target.value)} /></div><Button className="w-full bg-[#1F4788] hover:bg-[#16396f]" onClick={saveVersion} disabled={saveMutation.isPending || (!canEdit && !(canApprove && (status === "approved" || status === "archived")))}><Save className="mr-2 h-4 w-4" />{status === "approved" ? "Aprovar versão" : "Registrar nova versão"}</Button>{comparison && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="text-sm font-semibold text-[#1F4788]">Comparação com versão selecionada</p><div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-slate-700"><div><b>{comparison.addedNodes.length}</b><br />novas</div><div><b>{comparison.changedNodes.length}</b><br />alteradas</div><div><b>{comparison.removedNodes.length}</b><br />removidas</div></div><Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setCompareVersionId(null)}>Limpar comparação</Button></div>}<Separator /><div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Trilha de auditoria</p><p className="mt-1 text-sm text-slate-500">Registros somente de leitura das operações críticas do fluxo.</p></div><div className="space-y-2">{auditQuery.data?.length ? auditQuery.data.map(event => <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2"><p className="text-xs font-semibold text-slate-700">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-[11px] text-slate-500">{new Date(event.createdAt).toLocaleString("pt-BR")}</p></div>) : <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">Nenhuma ação crítica foi registrada nesta sessão.</p>}</div><Separator />{versionsQuery.data?.map(version => <div key={version.id} className={`rounded-xl border p-3 ${compareVersionId === version.id ? "border-[#4A90E2] bg-blue-50" : "border-slate-200"}`}><div className="flex items-center justify-between"><span className="font-semibold text-[#1F4788]">Versão {version.versionNumber}</span><Badge variant="outline">{statusLabels[version.status]}</Badge></div><p className="mt-2 text-sm text-slate-600">{version.changeSummary}</p><p className="mt-2 text-xs text-slate-400">{new Date(version.createdAt).toLocaleString("pt-BR")}</p><div className="mt-3 grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={() => setCompareVersionId(version.id)}>Comparar</Button><Button size="sm" variant="outline" onClick={() => restore(version.id)} disabled={restoreMutation.isPending || !canEdit}><Undo2 className="mr-1 h-3.5 w-3.5" />Restaurar</Button></div></div>)}{canManageUsers && <><Separator /><div><p className="text-xs font-semibold uppercase tracking-wide text-[#4A90E2]">Perfis institucionais</p><p className="mt-1 text-sm text-slate-500">Administradores definem quem revisa, aprova ou edita o fluxo.</p></div><div className="space-y-2">{usersQuery.data?.map(member => <div key={member.id} className="rounded-lg border border-slate-200 p-2"><p className="truncate text-xs font-semibold text-slate-700">{member.name || member.email || `Usuário ${member.id}`}</p><Select value={member.role} onValueChange={value => updateUserRoleMutation.mutate({ userId: member.id, role: value as "user" | "revisor" | "aprovador" | "admin" }, { onSuccess: () => { usersQuery.refetch(); toast.success("Perfil institucional atualizado."); }, onError: error => toast.error(error.message) })}><SelectTrigger className="mt-2 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user">Editor</SelectItem><SelectItem value="revisor">Revisor</SelectItem><SelectItem value="aprovador">Aprovador</SelectItem><SelectItem value="admin">Administrador</SelectItem></SelectContent></Select></div>)}</div></>}</div></ScrollArea></TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  );
}
