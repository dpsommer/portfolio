import { ORIGIN } from '../core/camera.ts'
import type { FloorPoint } from '../core/camera.ts'
import type { Pixel } from '../core/types.ts'
import { rasterise } from '../room/room.ts'
import type { Segment } from '../room/room.ts'
import { windowToWorld } from '../window/pixels.ts'
import type { WindowPoint } from '../window/tracery.ts'
import { REST_POSE, owlLayers } from './owl.ts'
import type { OwlPose } from './owl.ts'

// The owl perched in the window's open lower right pane: between its feet is
// OWL_PERCH in window-local units, on the opening's bottom, standing OWL_DEPTH
// out from the wall on its inner edge.
export const OWL_PERCH = { s: 0.15, t: -0.6 }
const OWL_DEPTH = 0.03

const toWindow = ({ s, t }: WindowPoint): WindowPoint => ({ s: OWL_PERCH.s + s, t: OWL_PERCH.t + t, d: OWL_DEPTH })

// Pixels for the owl in `pose`, seen the same way as `roomPixels`.
export function owlPixels(
  canvasWidth: number,
  canvasHeight: number,
  pose: OwlPose = REST_POSE,
  yaw = 0,
  eye: FloorPoint = ORIGIN,
): Pixel[] {
  const view = { yaw, eye, width: canvasWidth, height: canvasHeight }
  const inCanvas = (p: Pixel) => p.x >= 0 && p.x < canvasWidth && p.y >= 0 && p.y < canvasHeight
  return owlLayers(pose)
    .flatMap(({ colour, lines }) =>
      rasterise(
        lines.map(([a, b]): Segment => [windowToWorld(toWindow(a)), windowToWorld(toWindow(b))]),
        colour,
        view,
      ),
    )
    .filter(inCanvas)
}
