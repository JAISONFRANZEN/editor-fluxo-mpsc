import type { FlowModel } from "./flowModel";

export type FlowDiff = {
  addedNodes: string[];
  removedNodes: string[];
  changedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  changedEdges: string[];
};

export function compareFlowModels(previous: FlowModel, current: FlowModel): FlowDiff {
  const previousNodes = new Map(previous.nodes.map(node => [node.id, node]));
  const currentNodes = new Map(current.nodes.map(node => [node.id, node]));
  const previousEdges = new Map(previous.edges.map(edge => [edge.id, edge]));
  const currentEdges = new Map(current.edges.map(edge => [edge.id, edge]));
  const changedNodes = current.nodes.filter(node => {
    const prior = previousNodes.get(node.id);
    return prior && JSON.stringify(prior) !== JSON.stringify(node);
  }).map(node => node.label);
  const changedEdges = current.edges.filter(edge => {
    const prior = previousEdges.get(edge.id);
    return prior && JSON.stringify(prior) !== JSON.stringify(edge);
  }).map(edge => edge.label || `${edge.sourceId} → ${edge.targetId}`);
  return {
    addedNodes: current.nodes.filter(node => !previousNodes.has(node.id)).map(node => node.label),
    removedNodes: previous.nodes.filter(node => !currentNodes.has(node.id)).map(node => node.label),
    changedNodes,
    addedEdges: current.edges.filter(edge => !previousEdges.has(edge.id)).map(edge => edge.label || `${edge.sourceId} → ${edge.targetId}`),
    removedEdges: previous.edges.filter(edge => !currentEdges.has(edge.id)).map(edge => edge.label || `${edge.sourceId} → ${edge.targetId}`),
    changedEdges,
  };
}
