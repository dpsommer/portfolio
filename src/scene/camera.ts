// A minimal first-person camera over a box-shaped room. World units: the room
// is 2 wide (x from -1 to 1), y is up and +z is north, the starting heading.
// The camera sits at the origin at eye height and only turns about y (yaw).

export type Vec3 = { x: number; y: number; z: number }
export type ScreenPoint = { x: number; y: number }

// Focal length as a fraction of half the canvas width (about a 102° field of view).
export const FOCAL_RATIO = 0.8
// Size of the far wall on screen as a fraction of the view, facing north.
export const FAR_WALL_SCALE = 0.45

export const ROOM_HALF_WIDTH = 1
// Floor and ceiling heights relative to the eye. Height to width matches the
// canvas's 3:4, so the wall edges run into the corners of the view.
export const FLOOR_Y = -0.75
export const CEILING_Y = 0.75
// The far (north) wall's distance gives it FAR_WALL_SCALE on screen.
export const FAR_Z = (FOCAL_RATIO * ROOM_HALF_WIDTH) / FAR_WALL_SCALE
// The wall behind the starting position.
export const BACK_Z = -1

// Points closer than this to the camera plane are clipped away.
export const NEAR = 0.1

// Rotates a world point into camera space for a camera turned `yaw` radians to
// the left (anticlockwise seen from above). Camera space: x right, z forward.
export function toCamera(point: Vec3, yaw: number): Vec3 {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: point.z * cos - point.x * sin,
  }
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

// Screen endpoints of a world-space segment seen at `yaw`, or null if it is behind the camera.
export function projectSegment(
  a: Vec3,
  b: Vec3,
  yaw: number,
  width: number,
  height: number,
): [ScreenPoint, ScreenPoint] | null {
  const clipped = clipToNearPlane(toCamera(a, yaw), toCamera(b, yaw))
  if (!clipped) return null
  return [projectPoint(clipped[0], width, height), projectPoint(clipped[1], width, height)]
}
