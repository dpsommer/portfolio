type Point = { x: number; y: number }

// Integer points on the line from (x0, y0) to (x1, y1), inclusive (Bresenham).
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  x1 = Math.round(x1)
  y1 = Math.round(y1)
  const points: Point[] = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const stepX = x0 < x1 ? 1 : -1
  const stepY = y0 < y1 ? 1 : -1
  let error = dx + dy
  for (;;) {
    points.push({ x: x0, y: y0 })
    if (x0 === x1 && y0 === y1) return points
    const doubled = 2 * error
    if (doubled >= dy) {
      error += dy
      x0 += stepX
    }
    if (doubled <= dx) {
      error += dx
      y0 += stepY
    }
  }
}

// Like linePoints, but with random gaps so the line only hints at itself.
// `minRun`/`maxRun` bound the drawn stretches; gaps are 2–6 pixels.
export function brokenLinePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  random: () => number,
  minRun = 4,
  maxRun = 16,
): Point[] {
  const points = linePoints(x0, y0, x1, y1)
  const kept: Point[] = []
  let drawing = random() < 0.7
  let remaining = 0
  for (const point of points) {
    if (remaining === 0) {
      drawing = !drawing
      remaining = drawing
        ? minRun + Math.floor(random() * (maxRun - minRun + 1))
        : 2 + Math.floor(random() * 5)
    }
    if (drawing) kept.push(point)
    remaining--
  }
  return kept
}
