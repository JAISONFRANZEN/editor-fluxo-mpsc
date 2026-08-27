import type { FlowEdge, FlowModel } from "./flowModel";

export function inferConnectionType(model: FlowModel, sourceId: string, targetId: string): FlowEdge["type"] | null {
  if (sourceId === targetId) return null;
  const source = model.nodes.find(node => node.id === sourceId);
  const target = model.nodes.find(node => node.id === targetId);
  if (!source || !target) return null;
  const lanes = new Map(model.lanes.map(lane => [lane.id, lane]));
  const sourcePool = lanes.get(source.laneId)?.poolId;
  const targetPool = lanes.get(target.laneId)?.poolId;
  if (!sourcePool || !targetPool) return null;
  return sourcePool === targetPool ? "sequence" : "message";
}
