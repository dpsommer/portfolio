// A minimal first-person camera over the room. World units: the main room is 2
// wide (x from -1 to 1), y is up and +z is north, the starting heading. The
// camera is always at eye height (y 0): it stands at an `eye` position on the
// floor plan and only turns about y (yaw).

export type Vec3 = { x: number; y: number; z: number }
export type ScreenPoint = { x: number; y: number }
// A position on the floor plan, seen from above.
export type FloorPoint = { x: number; z: number }

// The starting position.
export const ORIGIN: FloorPoint = { x: 0, z: 0 }

// Focal length as a fraction of half the canvas width (about a 102° field of view).
export const FOCAL_RATIO = 0.8

export const ROOM_HALF_WIDTH = 1
// Floor and ceiling heights relative to the eye. Height to width matches the
// canvas's 3:4, so the wall edges run into the corners of the view.
export const FLOOR_Y = -0.75
export const CEILING_Y = 0.75
// How far each place the visitor stands is from the nearby walls framing it, so
// close-up walls look the same size everywhere. The start is this far from the
// side walls and the back wall.
export const WALL_VIEW_DISTANCE = 1
// How far a step forward from the start goes towards the far wall, to the
// place in front of the sign: as far as the step west into the nook.
export const SIGN_STEP = 4 / 3
// The far (north) wall, WALL_VIEW_DISTANCE beyond the place in front of the
// sign. It's a whole number of 1/3-unit floor tiles from the back wall.
export const FAR_Z = SIGN_STEP + WALL_VIEW_DISTANCE
// The wall behind the starting position.
export const BACK_Z = -WALL_VIEW_DISTANCE
// A nook to the left of the starting position: the near part of the left wall
// is pushed back to NOOK_X, from the back wall up to NOOK_FRONT_Z. It's four
// 1/3-unit floor tiles deep, so its place (WALL_VIEW_DISTANCE from its back
// wall) stands a tile inside the opening and the floor grid ends at its walls.
export const NOOK_X = -ROOM_HALF_WIDTH - 4 / 3
export const NOOK_FRONT_Z = WALL_VIEW_DISTANCE

// Points closer than this to the camera plane are clipped away.
export const NEAR = 0.1

// Moves a world point into camera space for a camera at `eye`, turned `yaw`
// radians to the left (anticlockwise seen from above). Camera space: x right,
// z forward.
export function toCamera(point: Vec3, yaw: number, eye: FloorPoint = ORIGIN): Vec3 {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const x = point.x - eye.x
  const z = point.z - eye.z
  return { x: x * cos + z * sin, y: point.y, z: z * cos - x * sin }
}

// Perspective projection of a camera-space point onto a canvas. Assumes z > 0.
export function projectPoint(point: Vec3, width: number, height: number): ScreenPoint {
  const focal = (FOCAL_RATIO * width) / 2
  return {
    x: width / 2 + (focal * point.x) / point.z,
    y: height / 2 - (focal * point.y) / point.z,
  }
}

// Clips a camera-space segment to z >= NEAR, or returns null if it is entirely behind.
export function clipToNearPlane(a: Vec3, b: Vec3): [Vec3, Vec3] | null {
  if (a.z < NEAR && b.z < NEAR) return null
  if (a.z >= NEAR && b.z >= NEAR) return [a, b]
  const t = (NEAR - a.z) / (b.z - a.z)
  const cut = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR }
  return a.z < NEAR ? [cut, b] : [a, cut]
}

// Screen endpoints of a world-space segment seen from `eye` at `yaw`, or null if
// it is behind the camera.
export function projectSegment(
  a: Vec3,
  b: Vec3,
  yaw: number,
  width: number,
  height: number,
  eye: FloorPoint = ORIGIN,
): [ScreenPoint, ScreenPoint] | null {
  const clipped = clipToNearPlane(toCamera(a, yaw, eye), toCamera(b, yaw, eye))
  if (!clipped) return null
  return [projectPoint(clipped[0], width, height), projectPoint(clipped[1], width, height)]
}
