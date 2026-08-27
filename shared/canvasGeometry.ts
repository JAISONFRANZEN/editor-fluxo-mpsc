export function calculateCanvasDropX({
  clientX,
  canvasLeft,
  scrollLeft,
  zoomPercent,
  nodeWidth = 190,
}: {
  clientX: number;
  canvasLeft: number;
  scrollLeft: number;
  zoomPercent: number;
  nodeWidth?: number;
}) {
  const zoom = Math.max(0.25, zoomPercent / 100);
  return Math.max(30, Math.round((clientX - canvasLeft + scrollLeft) / zoom - nodeWidth / 2));
}

export function snapCanvasX(value: number, enabled = true, gridSize = 20) {
  return enabled ? Math.max(30, Math.round(value / gridSize) * gridSize) : Math.max(30, value);
}
