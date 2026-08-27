import type { FlowEdge, FlowLane, FlowModel, FlowNode } from "./flowModel";

const NODE_WIDTH = 190;
const NODE_HEIGHT = 58;
const LANE_HEIGHT = 126;
const POOL_X = 20;
const POOL_HEADER_HEIGHT = 30;
const POOL_GAP = 36;

const escapeXml = (value: string) => value.replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character] || character);
const safeId = (value: string) => value.replace(/[^A-Za-z0-9_.-]/g, "_");

type DiagramBounds = { x: number; y: number; width: number; height: number };

function sortedPools(model: FlowModel) {
  return [...model.pools].sort((a, b) => a.order - b.order);
}

function sortedLanes(model: FlowModel) {
  return sortedPools(model).flatMap(pool => model.lanes.filter(lane => lane.poolId === pool.id).sort((a, b) => a.order - b.order));
}

function nodeSize(node: FlowNode) {
  if (["gateway", "parallelGateway", "inclusiveGateway", "eventGateway"].includes(node.nodeType)) return { width: 76, height: 76 };
  if (["start", "intermediate", "end"].includes(node.nodeType)) return { width: 56, height: 56 };
  if (["data", "dataStore"].includes(node.nodeType)) return { width: NODE_WIDTH, height: 62 };
  if (node.nodeType === "subprocess") return { width: NODE_WIDTH, height: 62 };
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
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
  if (edge.type === "association") return `<bpmn:association id="${id}"${name} sourceRef="${safeId(edge.sourceId)}" targetRef="${safeId(edge.targetId)}" associationDirection="One" />`;
  return `<bpmn:sequenceFlow id="${id}"${name} sourceRef="${safeId(edge.sourceId)}" targetRef="${safeId(edge.targetId)}" />`;
}

function assertUniqueExportedIds(model: FlowModel) {
  const exportedIds = ["Definitions_MPSC_Fluxo", "Collaboration_MPSC", "Diagram_MPSC", "Plane_MPSC"];
  model.pools.forEach(pool => exportedIds.push(`Participant_${safeId(pool.id)}`, `Process_${safeId(pool.id)}`, `LaneSet_${safeId(pool.id)}`, `ParticipantShape_${safeId(pool.id)}`));
  model.lanes.forEach(lane => exportedIds.push(safeId(lane.id), `LaneShape_${safeId(lane.id)}`));
  model.nodes.forEach(node => {
    const id = safeId(node.id);
    exportedIds.push(id, `Shape_${id}`);
    if (node.nodeType === "data") exportedIds.push(`DataObject_${id}`);
    if (node.nodeType === "dataStore") exportedIds.push(`DataStore_${id}`);
  });
  model.edges.forEach(edge => {
    const id = safeId(edge.id);
    exportedIds.push(edge.type === "message" ? `Message_${id}` : id, `Edge_${id}`);
  });
  const duplicates = exportedIds.filter((id, index) => exportedIds.indexOf(id) !== index);
  if (duplicates.length > 0) throw new Error(`A exportação BPMN contém identificadores conflitantes: ${Array.from(new Set(duplicates)).join(", ")}.`);
}

function edgeWaypoints(source: DiagramBounds, target: DiagramBounds) {
  const sourceCenter = source.x + source.width / 2;
  const targetCenter = target.x + target.width / 2;
  const flowsForward = sourceCenter <= targetCenter;
  const x1 = flowsForward ? source.x + source.width : source.x;
  const x2 = flowsForward ? target.x : target.x + target.width;
  const y1 = source.y + source.height / 2;
  const y2 = target.y + target.height / 2;
  const middle = Math.round((x1 + x2) / 2);
  return `<di:waypoint x="${Math.round(x1)}" y="${Math.round(y1)}" /><di:waypoint x="${middle}" y="${Math.round(y1)}" /><di:waypoint x="${middle}" y="${Math.round(y2)}" /><di:waypoint x="${Math.round(x2)}" y="${Math.round(y2)}" />`;
}

/** Exports the current editor model as portable BPMN 2.0 XML suitable for Bizagi import testing. */
export function buildBpmnXml(model: FlowModel) {
  assertUniqueExportedIds(model);
  const pools = sortedPools(model);
  const lanes = sortedLanes(model);
  const laneById = new Map(model.lanes.map(lane => [lane.id, lane]));
  const nodeById = new Map(model.nodes.map(node => [node.id, node]));
  const processByPool = new Map(pools.map(pool => [pool.id, `Process_${safeId(pool.id)}`]));
  const poolBounds = new Map<string, DiagramBounds>();
  let currentY = 50;

  pools.forEach(pool => {
    const laneCount = lanes.filter(lane => lane.poolId === pool.id).length;
    const height = Math.max(POOL_HEADER_HEIGHT + LANE_HEIGHT, POOL_HEADER_HEIGHT + laneCount * LANE_HEIGHT);
    poolBounds.set(pool.id, { x: POOL_X, y: currentY, width: 0, height });
    currentY += height + POOL_GAP;
  });

  const nodeBounds = new Map<string, DiagramBounds>();
  model.nodes.forEach(node => {
    const lane = laneById.get(node.laneId);
    if (!lane) return;
    const pool = poolBounds.get(lane.poolId);
    const localLanes = lanes.filter(item => item.poolId === lane.poolId);
    const laneIndex = localLanes.findIndex(item => item.id === node.laneId);
    if (!pool || laneIndex < 0) return;
    const size = nodeSize(node);
    nodeBounds.set(node.id, {
      x: Math.max(POOL_X + 72, node.x),
      y: pool.y + POOL_HEADER_HEIGHT + laneIndex * LANE_HEIGHT + Math.round((LANE_HEIGHT - size.height) / 2),
      ...size,
    });
  });

  const processWidth = Math.max(2200, ...Array.from(nodeBounds.values()).map(bounds => bounds.x + bounds.width + 140));
  poolBounds.forEach(bounds => { bounds.width = processWidth; });

  const participants = pools.map(pool => `<bpmn:participant id="Participant_${safeId(pool.id)}" name="${escapeXml(pool.label)}" processRef="${processByPool.get(pool.id)}" />`).join("");
  const messageFlows = model.edges.filter(edge => edge.type === "message").map(edge => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    const sourcePoolId = source ? laneById.get(source.laneId)?.poolId : undefined;
    const targetPoolId = target ? laneById.get(target.laneId)?.poolId : undefined;
    if (!sourcePoolId || !targetPoolId) return "";
    return `<bpmn:messageFlow id="Message_${safeId(edge.id)}"${edge.label ? ` name="${escapeXml(edge.label)}"` : ""} sourceRef="Participant_${safeId(sourcePoolId)}" targetRef="Participant_${safeId(targetPoolId)}" />`;
  }).join("");

  const processes = pools.map(pool => {
    const localLanes = lanes.filter(lane => lane.poolId === pool.id);
    const localNodes = localLanes.flatMap(lane => model.nodes.filter(node => node.laneId === lane.id));
    const localEdges = model.edges.filter(edge => {
      if (edge.type === "message") return false;
      const source = nodeById.get(edge.sourceId);
      const target = nodeById.get(edge.targetId);
      return source && target && laneById.get(source.laneId)?.poolId === pool.id && laneById.get(target.laneId)?.poolId === pool.id;
    });
    const laneSet = localLanes.map(lane => {
      const references = localNodes.filter(node => node.laneId === lane.id && !["data", "dataStore", "annotation"].includes(node.nodeType)).map(node => `<bpmn:flowNodeRef>${safeId(node.id)}</bpmn:flowNodeRef>`).join("");
      return `<bpmn:lane id="${safeId(lane.id)}" name="${escapeXml(lane.label)}">${references}</bpmn:lane>`;
    }).join("");
    return `<bpmn:process id="${processByPool.get(pool.id)}" name="${escapeXml(pool.label)}" isExecutable="false"><bpmn:laneSet id="LaneSet_${safeId(pool.id)}">${laneSet}</bpmn:laneSet>${localNodes.map(nodeXml).join("")}${localEdges.map(edgeXml).join("")}</bpmn:process>`;
  }).join("");

  const participantShapes = pools.map(pool => {
    const bounds = poolBounds.get(pool.id)!;
    return `<bpmndi:BPMNShape id="ParticipantShape_${safeId(pool.id)}" bpmnElement="Participant_${safeId(pool.id)}" isHorizontal="true"><dc:Bounds x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" /></bpmndi:BPMNShape>`;
  }).join("");
  const laneShapes = lanes.map(lane => {
    const pool = poolBounds.get(lane.poolId)!;
    const localIndex = lanes.filter(item => item.poolId === lane.poolId).findIndex(item => item.id === lane.id);
    return `<bpmndi:BPMNShape id="LaneShape_${safeId(lane.id)}" bpmnElement="${safeId(lane.id)}" isHorizontal="true"><dc:Bounds x="${pool.x}" y="${pool.y + POOL_HEADER_HEIGHT + localIndex * LANE_HEIGHT}" width="${pool.width}" height="${LANE_HEIGHT}" /></bpmndi:BPMNShape>`;
  }).join("");
  const nodeShapes = model.nodes.map(node => {
    const bounds = nodeBounds.get(node.id);
    if (!bounds) return "";
    return `<bpmndi:BPMNShape id="Shape_${safeId(node.id)}" bpmnElement="${safeId(node.id)}"><dc:Bounds x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" /></bpmndi:BPMNShape>`;
  }).join("");
  const edgeShapes = model.edges.map(edge => {
    const source = nodeBounds.get(edge.sourceId);
    const target = nodeBounds.get(edge.targetId);
    if (!source || !target) return "";
    const elementId = edge.type === "message" ? `Message_${safeId(edge.id)}` : safeId(edge.id);
    return `<bpmndi:BPMNEdge id="Edge_${safeId(edge.id)}" bpmnElement="${elementId}">${edgeWaypoints(source, target)}</bpmndi:BPMNEdge>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_MPSC_Fluxo" targetNamespace="https://www.mpsc.mp.br/bpmn">
  <bpmn:collaboration id="Collaboration_MPSC">${participants}${messageFlows}</bpmn:collaboration>
  ${processes}
  <bpmndi:BPMNDiagram id="Diagram_MPSC"><bpmndi:BPMNPlane id="Plane_MPSC" bpmnElement="Collaboration_MPSC">${participantShapes}${laneShapes}${nodeShapes}${edgeShapes}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
