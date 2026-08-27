import type { FlowLevel, FlowModel, FlowNode } from "./flowModel";

export type FlowCanvasFilters = {
  level: Exclude<FlowLevel, null> | "all";
  responsible: string;
};

export function filterFlowNodes(nodes: FlowNode[], filters: FlowCanvasFilters) {
  return nodes.filter(node => (filters.level === "all" || node.level === filters.level) && (filters.responsible === "all" || node.responsible === filters.responsible));
}

export function listFlowResponsibles(model: FlowModel) {
  return Array.from(new Set(model.nodes.map(node => node.responsible.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
