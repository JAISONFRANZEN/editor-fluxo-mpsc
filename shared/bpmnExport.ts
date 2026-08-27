import type { FlowEdge, FlowLane, FlowModel, FlowNode } from "./flowModel";

const NODE_WIDTH = 190;
const NODE_HEIGHT = 58;
const LANE_HEIGHT = 126;

const escapeXml = (value: string) => value.replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] || character);

const safeId = (value: string) => value.replace(/[^A-Za-z0-9_.-]/g, "_");

function sortedLanes(model: FlowModel) {
  return [...model.pools]
    .sort((a, b) => a.order - b.order)
    .flatMap(pool => model.lanes.filter(lane => lane.poolId === pool.id).sort((a, b) => a.order - b.order));
}

function poolNodes(model: FlowModel, lane: FlowLane) {
  return model.nodes.filter(node => node.laneId === lane.id);
}

function nodeXml(node: FlowNode) {
  const id = safeId(node.id);
  const name = escapeXml(node.label);
  if (node.nodeType === "start") return `<bpmn:startEvent id="${id}" name="${name}" />`;
  if (node.nodeType === "intermediate") return `<bpmn:intermediateCatchEvent id="${id}" name="${name}" />`;
  if (node.nodeType === "end") return `<bpmn:endEvent id="${id}" name="${name}" />`;
  if (node.nodeType === "gateway") return `<bpmn:exclusiveGateway id="${id}" name="${name}" gatewayDirection="Diverging" />`;
  if (node.nodeType === "parallelGateway") return `<bpmn:parallelGateway id="${id}" name="${name}" gatewayDirection="Diverging" />`;
  if (node.nodeType === "inclusiveGateway") return `<bpmn:inclusiveGateway id="${id}" name="${name}" gatewayDirection="Diverging" />`;
  if (node.nodeType === "eventGateway") return `<bpmn:eventBasedGateway id="${id}" name="${name}" gatewayDirection="Diverging" />`;
  if (node.nodeType === "subprocess") return `<bpmn:subProcess id="${id}" name="${name}" />`;
  if (node.nodeType === "data") return `<bpmn:dataObject id="DataObject_${id}" /><bpmn:dataObjectReference id="${id}" name="${name}" dataObjectRef="DataObject_${id}" />`;
  if (node.nodeType === "dataStore") return `<bpmn:dataStore id="DataStore_${id}" name="${name}" /><bpmn:dataStoreReference id="${id}" name="${name}" dataStoreRef="DataStore_${id}" />`;
  if (node.nodeType === "annotation") return `<bpmn:textAnnotation id="${id}"><bpmn:text>${name}</bpmn:text></bpmn:textAnnotation>`;
  return `<bpmn:task id="${id}" name="${name}" />`;
}

function edgeXml(edge: FlowEdge) {
  const id = safeId(edge.id);
  const name = edge.label ? ` name="${escapeXml(edge.label)}"` : "";
  if (edge.type === "association") return `<bpmn:association id="${id}"${name} sourceRef="${safeId(edge.sourceId)}" targetRef="${safeId(edge.targetId)}" associationDirection="None" />`;
  return `<bpmn:sequenceFlow id="${id}"${name} sourceRef="${safeId(edge.sourceId)}" targetRef="${safeId(edge.targetId)}" />`;
}

function nodeBounds(node: FlowNode, lanes: FlowLane[]) {
  const laneIndex = Math.max(0, lanes.findIndex(lane => lane.id === node.laneId));
  const y = 85 + laneIndex * LANE_HEIGHT + 48;
  if (["gateway", "parallelGateway", "inclusiveGateway", "eventGateway"].includes(node.nodeType)) return { x: node.x, y: y - 8, width: 82, height: 82 };
  if (["start", "intermediate", "end"].includes(node.nodeType)) return { x: node.x, y: y + 2, width: NODE_WIDTH, height: 54 };
  return { x: node.x, y, width: NODE_WIDTH, height: ["data", "dataStore"].includes(node.nodeType) ? 62 : NODE_HEIGHT };
}

/** Exports the current editor model as portable BPMN 2.0 XML suitable for import testing in Bizagi. */
export function buildBpmnXml(model: FlowModel) {
  const lanes = sortedLanes(model);
  const laneById = new Map(model.lanes.map(lane => [lane.id, lane]));
  const nodeById = new Map(model.nodes.map(node => [node.id, node]));
  const processByPool = new Map(model.pools.map(pool => [pool.id, `Process_${safeId(pool.id)}`]));
  const poolParticipants = model.pools.map(pool => `<bpmn:participant id="Participant_${safeId(pool.id)}" name="${escapeXml(pool.label)}" processRef="${processByPool.get(pool.id)}" />`).join("");
  const messageFlows = model.edges.filter(edge => edge.type === "message").map(edge => `<bpmn:messageFlow id="Message_${safeId(edge.id)}"${edge.label ? ` name="${escapeXml(edge.label)}"` : ""} sourceRef="${safeId(edge.sourceId)}" targetRef="${safeId(edge.targetId)}" />`).join("");

  const processes = model.pools.map(pool => {
    const localLanes = lanes.filter(lane => lane.poolId === pool.id);
    const localNodes = localLanes.flatMap(lane => poolNodes(model, lane));
    const localEdges = model.edges.filter(edge => {
      if (edge.type === "message") return false;
      const source = nodeById.get(edge.sourceId);
      const target = nodeById.get(edge.targetId);
      return source && target && laneById.get(source.laneId)?.poolId === pool.id && laneById.get(target.laneId)?.poolId === pool.id;
    });
    const laneSet = localLanes.map(lane => {
      const flowNodeRefs = localNodes.filter(node => node.laneId === lane.id && !["data", "dataStore", "annotation"].includes(node.nodeType)).map(node => `<bpmn:flowNodeRef>${safeId(node.id)}</bpmn:flowNodeRef>`).join("");
      return `<bpmn:lane id="${safeId(lane.id)}" name="${escapeXml(lane.label)}">${flowNodeRefs}</bpmn:lane>`;
    }).join("");
    return `<bpmn:process id="${processByPool.get(pool.id)}" name="${escapeXml(pool.label)}" isExecutable="false"><bpmn:laneSet id="LaneSet_${safeId(pool.id)}">${laneSet}</bpmn:laneSet>${localNodes.map(nodeXml).join("")}${localEdges.map(edgeXml).join("")}</bpmn:process>`;
  }).join("");

  let currentY = 50;
  const poolBounds = new Map<string, { y: number; height: number }>();
  model.pools.sort((a, b) => a.order - b.order).forEach(pool => {
    const count = lanes.filter(lane => lane.poolId === pool.id).length;
    const height = Math.max(110, count * LANE_HEIGHT + 35);
    poolBounds.set(pool.id, { y: currentY, height });
    currentY += height + 24;
  });
  const processWidth = Math.max(2100, ...model.nodes.map(node => node.x + NODE_WIDTH + 120));
  const participantShapes = model.pools.map(pool => {
    const bounds = poolBounds.get(pool.id)!;
    return `<bpmndi:BPMNShape id="ParticipantShape_${safeId(pool.id)}" bpmnElement="Participant_${safeId(pool.id)}" isHorizontal="true"><dc:Bounds x="20" y="${bounds.y}" width="${processWidth}" height="${bounds.height}" /></bpmndi:BPMNShape>`;
  }).join("");
  const laneShapes = lanes.map(lane => {
    const pool = poolBounds.get(lane.poolId)!;
    const localIndex = lanes.filter(item => item.poolId === lane.poolId).findIndex(item => item.id === lane.id);
    return `<bpmndi:BPMNShape id="LaneShape_${safeId(lane.id)}" bpmnElement="${safeId(lane.id)}" isHorizontal="true"><dc:Bounds x="50" y="${pool.y + 30 + localIndex * LANE_HEIGHT}" width="${processWidth - 30}" height="${LANE_HEIGHT}" /></bpmndi:BPMNShape>`;
  }).join("");
  const nodeShapes = model.nodes.map(node => {
    const bounds = nodeBounds(node, lanes);
    const lane = laneById.get(node.laneId)!;
    const pool = poolBounds.get(lane.poolId)!;
    const localIndex = lanes.filter(item => item.poolId === lane.poolId).findIndex(item => item.id === node.laneId);
    const y = pool.y + 30 + localIndex * LANE_HEIGHT + 34;
    const height = ["gateway", "parallelGateway", "inclusiveGateway", "eventGateway"].includes(node.nodeType) ? 82 : ["data", "dataStore"].includes(node.nodeType) ? 62 : ["start", "intermediate", "end"].includes(node.nodeType) ? 54 : NODE_HEIGHT;
    const width = ["gateway", "parallelGateway", "inclusiveGateway", "eventGateway"].includes(node.nodeType) ? 82 : NODE_WIDTH;
    return `<bpmndi:BPMNShape id="Shape_${safeId(node.id)}" bpmnElement="${safeId(node.id)}"><dc:Bounds x="${Math.max(80, bounds.x)}" y="${y}" width="${width}" height="${height}" /></bpmndi:BPMNShape>`;
  }).join("");
  const edgeShapes = model.edges.map(edge => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) return "";
    const sourceBounds = nodeBounds(source, lanes);
    const targetBounds = nodeBounds(target, lanes);
    const sourceLane = laneById.get(source.laneId)!;
    const targetLane = laneById.get(target.laneId)!;
    const sourcePoolBounds = poolBounds.get(sourceLane.poolId)!;
    const targetPoolBounds = poolBounds.get(targetLane.poolId)!;
    const sourceLaneIndex = lanes.filter(lane => lane.poolId === sourceLane.poolId).findIndex(lane => lane.id === source.laneId);
    const targetLaneIndex = lanes.filter(lane => lane.poolId === targetLane.poolId).findIndex(lane => lane.id === target.laneId);
    const x1 = sourceBounds.x + sourceBounds.width;
    const y1 = sourcePoolBounds.y + 30 + sourceLaneIndex * LANE_HEIGHT + 62;
    const x2 = targetBounds.x;
    const y2 = targetPoolBounds.y + 30 + targetLaneIndex * LANE_HEIGHT + 62;
    const elementId = edge.type === "message" ? `Message_${safeId(edge.id)}` : safeId(edge.id);
    return `<bpmndi:BPMNEdge id="Edge_${safeId(edge.id)}" bpmnElement="${elementId}"><di:waypoint x="${x1}" y="${y1}" /><di:waypoint x="${Math.round((x1 + x2) / 2)}" y="${y1}" /><di:waypoint x="${Math.round((x1 + x2) / 2)}" y="${y2}" /><di:waypoint x="${x2}" y="${y2}" /></bpmndi:BPMNEdge>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_MPSC_Fluxo" targetNamespace="https://www.mpsc.mp.br/bpmn">
  <bpmn:collaboration id="Collaboration_MPSC">${poolParticipants}${messageFlows}</bpmn:collaboration>
  ${processes}
  <bpmndi:BPMNDiagram id="Diagram_MPSC"><bpmndi:BPMNPlane id="Plane_MPSC" bpmnElement="Collaboration_MPSC">${participantShapes}${laneShapes}${nodeShapes}${edgeShapes}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
