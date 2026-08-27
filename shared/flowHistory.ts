import type { FlowModel } from "./flowModel";

function clone(model: FlowModel) {
  return JSON.parse(JSON.stringify(model)) as FlowModel;
}

export function pushFlowHistory(history: FlowModel[], priorModel: FlowModel, limit = 40) {
  return [...history.slice(-(limit - 1)), clone(priorModel)];
}

export function popFlowHistory(history: FlowModel[]) {
  const previous = history[history.length - 1];
  return previous ? { model: clone(previous), history: history.slice(0, -1) } : null;
}
