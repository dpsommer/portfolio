import { describe, expect, it, vi } from 'vitest'
import {
  BACK_Z,
  CEILING_Y,
  FLOOR_Y,
  FOCAL_RATIO,
  NOOK_FRONT_Z,
  NOOK_X,
  ORIGIN,
} from '../core/camera.ts'
import type { FloorPoint } from '../core/camera.ts'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import type { Pixel } from '../core/types.ts'
import { PLACES } from '../navigation/places.ts'
import { MIRROR_WALL, WALLS, roomPixels } from '../room/room.ts'
import type { WallName } from '../room/room.ts'
import { MIRROR_BOUNDS, isOnGlass } from './frame.ts'
import type { MirrorPoint } from './frame.ts'
import {
  mirrorPixels,
  plaquePixels,
  previewPixels,
  pullPixels,
  ripplePixels,
  screenToMirror,
  screenToWall,
} from './pixels.ts'
import { LOGO_SIZE, PLAQUE_BOUNDS } from './plaque.ts'
import type { LogoMap, Plaque } from './plaque.ts'
import { GLASS_CELLS, PREVIEW_COLOURS, PREVIEW_HEIGHT, PREVIEW_WIDTH } from './preview.ts'
import type { Shimmer } from './preview.ts'
import { PULL_S, isOnPull } from './pull.ts'
import { rippleDuration, rippleRings } from './ripple.ts'

// rippleRings passes through, so tests can feed ripplePixels set rings with mockReturnValueOnce.
vi.mock('./ripple.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ripple.ts')>()
  return { ...actual, rippleRings: vi.fn(actual.rippleRings) }
})

const WIDTH = 320
const HEIGHT = 240
// Focal length in pixels at 320 wide (128).
const FOCAL = (FOCAL_RATIO * WIDTH) / 2
// Screen column of a point `across` units right of the view's centre line, `depth` ahead.
const columnAt = (across: number, depth: number) => Math.round(WIDTH / 2 + (FOCAL * across) / depth)
// Screen row of a point at height `y` (relative to the eye), `depth` ahead.
const rowAt = (y: number, depth: number) => Math.round(HEIGHT / 2 - (FOCAL * y) / depth)

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`
// The distinct pixels drawn, ignoring order and duplicates.
const pixelSet = (pixels: Pixel[]) => new Set(pixels.map((p) => `${key(p)},${p.colour}`))
const wallEnd = ({ start, along, length }: (typeof WALLS)[WallName]) => ({
  x: start.x + along.x * length,
  z: start.z + along.z * length,
})
const worn = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND_WORN)
const dim = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND_DIM)

// The inclusive extent of a set of pixels.
const extent = (pixels: Pixel[]) => ({
  left: Math.min(...pixels.map((p) => p.x)),
  top: Math.min(...pixels.map((p) => p.y)),
  right: Math.max(...pixels.map((p) => p.x)),
  bottom: Math.max(...pixels.map((p) => p.y)),
})

// The nook's place: WALL_VIEW_DISTANCE in front of the nook's back wall, level with the start.
const NOOK_EYE: FloorPoint = { x: PLACES.nook.x, z: PLACES.nook.z }

describe('mirrorPixels', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  // The mirror's wall is straight ahead of the nook's place facing west.
  const depth = PLACES.nook.x - NOOK_X
  const wallTop = rowAt(CEILING_Y, depth)
  const wallBottom = rowAt(FLOOR_Y, depth)
  const fromNook = mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)
  const extent = (pixels: Pixel[]) => ({
    left: Math.min(...pixels.map((p) => p.x)),
    right: Math.max(...pixels.map((p) => p.x)),
    top: Math.min(...pixels.map((p) => p.y)),
    bottom: Math.max(...pixels.map((p) => p.y)),
  })

  it('hangs on the nook\'s back wall, which faces the nook\'s place', () => {
    const wall = WALLS[MIRROR_WALL]
    expect(MIRROR_WALL).toBe('nook-back')
    expect(wall.start.x).toBe(NOOK_X)
    expect(wall.start.z).toBe(BACK_Z)
    expect(wallEnd(wall)).toEqual({ x: NOOK_X, z: NOOK_FRONT_Z })
  })

  it('fits within its wall', () => {
    expect(MIRROR_BOUNDS.right - MIRROR_BOUNDS.left).toBeLessThan(WALLS[MIRROR_WALL].length)
  })

  it('draws the mirror from the nook facing west', () => {
    expect(fromNook.length).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    expect(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)).toEqual(fromNook)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of fromNook) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it('uses the dim, worn and full foreground colours', () => {
    expect(new Set(fromNook.map((p) => p.colour))).toEqual(new Set([FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND]))
  })

  it('is centred horizontally from the nook facing west', () => {
    const { left, right } = extent(fromNook)
    expect(Math.abs((left + right) / 2 - WIDTH / 2)).toBeLessThanOrEqual(2)
  })

  it('matches the projected width of its bounds from the nook', () => {
    const { left, right } = extent(fromNook)
    // Facing west, the wall's +z runs left on screen, so s runs left to right.
    expect(right - left).toBeCloseTo(columnAt(MIRROR_BOUNDS.right, depth) - columnAt(MIRROR_BOUNDS.left, depth), -1)
  })

  it('spans most of the wall\'s projected height without reaching the floor or ceiling', () => {
    const { top, bottom } = extent(fromNook)
    expect(top).toBeGreaterThan(wallTop)
    expect(bottom).toBeLessThan(wallBottom)
    expect((bottom - top) / (wallBottom - wallTop)).toBeGreaterThan(0.8)
  })

  it('is centred vertically near the middle of the view', () => {
    const { top, bottom } = extent(fromNook)
    expect(Math.abs((top + bottom) / 2 - HEIGHT / 2)).toBeLessThan(HEIGHT * 0.05)
  })

  it('draws nothing from the nook facing east, with the mirror behind the camera', () => {
    expect(mirrorPixels(WIDTH, HEIGHT, EAST, NOOK_EYE)).toEqual([])
  })

  it('defaults to the start facing north', () => {
    expect(mirrorPixels(WIDTH, HEIGHT)).toEqual(mirrorPixels(WIDTH, HEIGHT, 0, ORIGIN))
  })

  it('draws a smaller mirror from the start facing west', () => {
    const fromStart = mirrorPixels(WIDTH, HEIGHT, WEST)
    expect(fromStart.length).toBeGreaterThan(0)
    const near = extent(fromNook)
    const far = extent(fromStart)
    expect(far.bottom - far.top).toBeLessThan(near.bottom - near.top)
    expect(far.right - far.left).toBeLessThan(near.right - near.left)
  })

  it('keeps room detail off the glass from the nook facing west', () => {
    // The glass edge is the worn mirror layer; stay a pixel inside its extent.
    const glass = extent(worn(fromNook))
    const onGlass = roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE).filter(
      (p) => p.x > glass.left + 1 && p.x < glass.right - 1 && p.y > glass.top + 1 && p.y < glass.bottom - 1,
    )
    expect(onGlass).toEqual([])
  })

  it('still draws bricks on the rest of the mirror\'s wall', () => {
    const frame = extent(fromNook)
    const bricks = dim(roomPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)).filter(
      (p) => p.y > wallTop && p.y < wallBottom && (p.x < frame.left || p.x > frame.right),
    )
    expect(bricks.length).toBeGreaterThan(0)
  })
})

describe('ripplePixels', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  const CENTRE: MirrorPoint = { s: 0, t: 0 }
  const duration = rippleDuration(CENTRE)
  // Every ring has started and the first is part-way out.
  const MID_MS = 900
  const fromNook = (origin: MirrorPoint, elapsedMs: number) =>
    ripplePixels(WIDTH, HEIGHT, { origin, elapsedMs }, WEST, NOOK_EYE)

  it('draws pixels mid-ripple from the nook facing west', () => {
    expect(fromNook(CENTRE, MID_MS).length).toBeGreaterThan(0)
  })

  it('keeps every pixel within the mirror\'s bounds from the nook facing west', () => {
    const { left, top, right, bottom } = extent(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE))
    for (const origin of [CENTRE, { s: 0.3, t: -0.45 }, { s: -0.2, t: 0.4 }]) {
      for (let ms = 100; ms < rippleDuration(origin); ms += 100) {
        const outside = fromNook(origin, ms).filter(({ x, y }) => x < left || x > right || y < top || y > bottom)
        expect(outside).toEqual([])
      }
    }
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of fromNook(CENTRE, MID_MS)) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it('centres a small ring on the click', () => {
    const pixels = fromNook(CENTRE, 400)
    const xs = pixels.map((p) => p.x)
    const ys = pixels.map((p) => p.y)
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - WIDTH / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - HEIGHT / 2)).toBeLessThanOrEqual(1)
  })

  it('draws nothing at the click', () => {
    expect(fromNook(CENTRE, 0)).toEqual([])
  })

  it('draws nothing past the duration', () => {
    expect(fromNook(CENTRE, duration + 1)).toEqual([])
  })

  it('draws nothing from the nook facing east, with the mirror behind the camera', () => {
    expect(ripplePixels(WIDTH, HEIGHT, { origin: CENTRE, elapsedMs: MID_MS }, EAST, NOOK_EYE)).toEqual([])
  })

  it('is deterministic', () => {
    expect(fromNook(CENTRE, duration - 100)).toEqual(fromNook(CENTRE, duration - 100))
  })

  it('draws strong rings in the worn colour', () => {
    // Early on both rings are near the click, so strong.
    expect(rippleRings(CENTRE, 300).every(({ strength }) => strength > 0.6)).toBe(true)
    const colours = new Set(fromNook(CENTRE, 300).map((p) => p.colour))
    expect(colours).toEqual(new Set([FOREGROUND_WORN]))
  })

  it('draws weak rings in the dim colour', () => {
    const late = duration - 100
    expect(rippleRings(CENTRE, late).every(({ strength }) => strength < 0.6)).toBe(true)
    const pixels = fromNook(CENTRE, late)
    expect(pixels.length).toBeGreaterThan(0)
    expect(new Set(pixels.map((p) => p.colour))).toEqual(new Set([FOREGROUND_DIM]))
  })

  describe('with a set ring', () => {
    const RADIUS = 0.2
    // A lone ring of RADIUS around the centre with the given strength.
    const ringWith = (strength: number) => {
      vi.mocked(rippleRings).mockReturnValueOnce([{ radius: RADIUS, strength }])
      return fromNook(CENTRE, MID_MS)
    }
    const key = (p: Pixel) => `${p.x},${p.y}`

    it('draws a ring stronger than 0.6 in the worn colour', () => {
      expect(new Set(ringWith(0.61).map((p) => p.colour))).toEqual(new Set([FOREGROUND_WORN]))
    })

    it('draws a ring of 0.6 or weaker in the dim colour', () => {
      expect(new Set(ringWith(0.6).map((p) => p.colour))).toEqual(new Set([FOREGROUND_DIM]))
    })

    it('keeps every pixel of a ring at strength 0.35 or more', () => {
      const solid = ringWith(1).map(key)
      expect(ringWith(0.35).map(key)).toEqual(solid)
      expect(ringWith(0.5).map(key)).toEqual(solid)
    })

    it('keeps fewer pixels of a fainter ring, all from the solid ring', () => {
      const solid = new Set(ringWith(0.5).map(key))
      const faded = ringWith(0.1).map(key)
      expect(faded.length).toBeGreaterThan(0)
      expect(faded.length).toBeLessThan(solid.size * 0.5)
      for (const k of faded) expect(solid.has(k)).toBe(true)
    })

    it('keeps fewer pixels the fainter the ring gets', () => {
      const counts = [0.3, 0.2, 0.1, 0.02].map((strength) => ringWith(strength).length)
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThan(counts[i - 1])
    })

    it('drops the same pixels each time', () => {
      expect(ringWith(0.15)).toEqual(ringWith(0.15))
    })
  })
})

describe('screenToMirror', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  // One canvas pixel on the mirror's wall from the nook, in mirror units.
  const PIXEL = 1 / FOCAL
  const fromNook = (x: number, y: number) => screenToMirror(x, y, WIDTH, HEIGHT, WEST, NOOK_EYE)

  it('maps the centre of the view to the centre of the glass from the nook facing west', () => {
    const point = fromNook(WIDTH / 2, HEIGHT / 2)!
    expect(point.s).toBeCloseTo(0)
    expect(point.t).toBeCloseTo(0)
  })

  it('maps one pixel to about 1/128 of a mirror unit', () => {
    expect(PIXEL).toBeCloseTo(1 / 128)
    expect(fromNook(WIDTH / 2 + 10, HEIGHT / 2)!.s).toBeCloseTo(10 * PIXEL)
    expect(fromNook(WIDTH / 2, HEIGHT / 2 - 10)!.t).toBeCloseTo(10 * PIXEL)
  })

  it('maps right on screen to +s', () => {
    expect(fromNook(WIDTH / 2 + 20, HEIGHT / 2)!.s).toBeGreaterThan(0)
  })

  it('maps up on screen to +t', () => {
    expect(fromNook(WIDTH / 2, HEIGHT / 2 - 20)!.t).toBeGreaterThan(0)
  })

  it('returns points on the glass', () => {
    for (const [x, y] of [[130, 90], [200, 170], [160, 60], [190, 120]]) {
      const point = fromNook(x, y)
      expect(point).not.toBeNull()
      expect(isOnGlass(point!)).toBe(true)
    }
  })

  it.each([
    ['the right side of the frame', WIDTH / 2 + 47, HEIGHT / 2],
    ['the left side of the frame', WIDTH / 2 - 47, HEIGHT / 2],
    ['the crest', WIDTH / 2, 42],
    ['a top shoulder corner, outside the arch', WIDTH / 2 + 38, HEIGHT / 2 - 58],
  ])('returns null on %s, inside the mirror\'s bounds', (_, x, y) => {
    const { left, top, right, bottom } = extent(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE))
    expect(x >= left && x <= right && y >= top && y <= bottom).toBe(true)
    expect(fromNook(x, y)).toBeNull()
  })

  it('returns null beside the mirror', () => {
    expect(fromNook(40, HEIGHT / 2)).toBeNull()
  })

  it('returns null above the wall', () => {
    expect(fromNook(WIDTH / 2, 0)).toBeNull()
  })

  it('returns null from the nook facing east, with the mirror behind the camera', () => {
    expect(screenToMirror(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, EAST, NOOK_EYE)).toBeNull()
  })

  it('returns null from the start facing north, with the mirror off to the side', () => {
    expect(screenToMirror(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT)).toBeNull()
  })

  it('maps the projected centre of the glass back to the centre from the start facing west', () => {
    const point = screenToMirror(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, WEST)!
    expect(point.s).toBeCloseTo(0)
    expect(point.t).toBeCloseTo(0)
  })

  it('lands each ripple pixel near its ring', () => {
    // Round-trips a ring through ripplePixels and back.
    const origin = { s: 0, t: 0 }
    const radii = rippleRings(origin, 500).map(({ radius }) => radius)
    const pixels = ripplePixels(WIDTH, HEIGHT, { origin, elapsedMs: 500 }, WEST, NOOK_EYE)
    expect(pixels.length).toBeGreaterThan(0)
    for (const { x, y } of pixels) {
      const point = fromNook(x, y)!
      const distance = Math.hypot(point.s, point.t)
      expect(Math.min(...radii.map((r) => Math.abs(distance - r)))).toBeLessThan(2 * PIXEL)
    }
  })
})

describe('previewPixels', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  const CELLS = PREVIEW_WIDTH * PREVIEW_HEIGHT
  const filled = (tone: number) => new Uint8Array(CELLS).fill(tone)
  // Stripes of every tone, a few cells wide, so a ripple's shift shows.
  const striped = Uint8Array.from({ length: CELLS }, (_, i) => Math.floor((i % PREVIEW_WIDTH) / 3) % 4)
  const fromNook = (preview: Uint8Array, ripple?: { origin: MirrorPoint; elapsedMs: number }) =>
    previewPixels(WIDTH, HEIGHT, preview, WEST, NOOK_EYE, ripple)
  const within = (bounds: { left: number; top: number; right: number; bottom: number }, p: Pixel) =>
    p.x >= bounds.left && p.x <= bounds.right && p.y >= bounds.top && p.y <= bounds.bottom

  it('draws one pixel per glass cell in the full foreground from the nook facing west', () => {
    const pixels = fromNook(filled(3))
    expect(pixels).toHaveLength(GLASS_CELLS.length)
    expect(new Set(pixels.map((p) => p.colour))).toEqual(new Set([FOREGROUND]))
  })

  it('draws each cell at its own pixel from the nook facing west', () => {
    expect(new Set(fromNook(filled(3)).map(key)).size).toBe(GLASS_CELLS.length)
  })

  it('keeps every pixel within the mirror\'s bounds from the nook facing west', () => {
    const bounds = extent(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE))
    expect(fromNook(filled(3)).every((p) => within(bounds, p))).toBe(true)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of fromNook(filled(3))) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it.each([1, 2, 3])('colours tone %i with its preview colour', (tone) => {
    expect(new Set(fromNook(filled(tone)).map((p) => p.colour))).toEqual(new Set([PREVIEW_COLOURS[tone]]))
  })

  it('draws nothing for an all-background preview', () => {
    expect(fromNook(filled(0))).toEqual([])
  })

  it('skips background cells', () => {
    expect(fromNook(striped).length).toBeLessThan(GLASS_CELLS.length)
    expect(fromNook(striped).every((p) => p.colour !== PREVIEW_COLOURS[0])).toBe(true)
  })

  it('draws nothing from the nook facing east, with the mirror behind the camera', () => {
    expect(previewPixels(WIDTH, HEIGHT, filled(3), EAST, NOOK_EYE)).toEqual([])
  })

  it('draws fewer pixels from the start facing west, all within that view\'s mirror bounds', () => {
    const pixels = previewPixels(WIDTH, HEIGHT, filled(3), WEST, ORIGIN)
    const bounds = extent(mirrorPixels(WIDTH, HEIGHT, WEST, ORIGIN))
    expect(pixels.length).toBeGreaterThan(0)
    expect(new Set(pixels.map(key)).size).toBeLessThan(GLASS_CELLS.length)
    expect(pixels.every((p) => within(bounds, p))).toBe(true)
  })

  it('defaults to the start facing north, where the mirror is out of view', () => {
    expect(previewPixels(WIDTH, HEIGHT, filled(3))).toEqual(previewPixels(WIDTH, HEIGHT, filled(3), 0, ORIGIN))
  })

  it('changes some pixels of a patterned preview mid-ripple', () => {
    const centre = { s: 0, t: 0 }
    const still = pixelSet(fromNook(striped))
    const rippled = pixelSet(fromNook(striped, { origin: centre, elapsedMs: rippleDuration(centre) / 2 }))
    expect(rippled).not.toEqual(still)
  })

  it('draws the plain preview once the ripple is over', () => {
    const centre = { s: 0, t: 0 }
    const after = fromNook(striped, { origin: centre, elapsedMs: rippleDuration(centre) + 1 })
    expect(after).toEqual(fromNook(striped))
  })

  it('draws the plain preview at the moment of the click, before any ring has set off', () => {
    const centre = { s: 0, t: 0 }
    expect(fromNook(striped, { origin: centre, elapsedMs: 0 })).toEqual(fromNook(striped))
  })

  it('is deterministic', () => {
    const ripple = { origin: { s: 0.1, t: -0.2 }, elapsedMs: 900 }
    expect(fromNook(striped, ripple)).toEqual(fromNook(striped, ripple))
  })
})

describe('screenToWall', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  const PIXEL = 1 / FOCAL
  const fromNook = (x: number, y: number) => screenToWall(x, y, WIDTH, HEIGHT, WEST, NOOK_EYE)

  it('maps the centre of the view to the mirror\'s centre from the nook facing west', () => {
    const point = fromNook(WIDTH / 2, HEIGHT / 2)!
    expect(point.s).toBeCloseTo(0)
    expect(point.t).toBeCloseTo(0)
  })

  it('maps right on screen to +s and up to +t, about 1/128 of a unit per pixel', () => {
    const point = fromNook(WIDTH / 2 + 30, HEIGHT / 2 - 20)!
    expect(point.s).toBeCloseTo(30 * PIXEL)
    expect(point.t).toBeCloseTo(20 * PIXEL)
  })

  it.each([
    ['the right side of the frame', WIDTH / 2 + 47, HEIGHT / 2],
    ['the crest', WIDTH / 2, 42],
    ['beside the mirror', 40, HEIGHT / 2],
  ])('returns a point on %s, where screenToMirror returns null', (_, x, y) => {
    const point = fromNook(x, y)
    expect(point).not.toBeNull()
    expect(point!.s).toBeCloseTo((x - WIDTH / 2) * PIXEL)
    expect(point!.t).toBeCloseTo((HEIGHT / 2 - y) * PIXEL)
    expect(screenToMirror(x, y, WIDTH, HEIGHT, WEST, NOOK_EYE)).toBeNull()
  })

  it('finds the pull where it\'s drawn from the nook facing west', () => {
    const handle = pullPixels(WIDTH, HEIGHT, 0, WEST, NOOK_EYE).filter((p) => p.colour === FOREGROUND)
    expect(handle.length).toBeGreaterThan(0)
    for (const { x, y } of handle) expect(isOnPull(fromNook(x + 0.5, y + 0.5)!)).toBe(true)
  })

  it('maps the pull\'s cord column to PULL_S', () => {
    expect(fromNook(WIDTH / 2 + PULL_S * FOCAL, HEIGHT / 2)!.s).toBeCloseTo(PULL_S)
  })

  it.each([
    ['above the ceiling', WIDTH / 2, 0],
    ['below the floor', WIDTH / 2, HEIGHT - 1],
    ['left of the wall', 10, HEIGHT / 2],
    ['right of the wall', WIDTH - 10, HEIGHT / 2],
  ])('returns null %s', (_, x, y) => {
    expect(fromNook(x, y)).toBeNull()
  })

  it('returns null from the nook facing east, with the wall behind the camera', () => {
    expect(screenToWall(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, EAST, NOOK_EYE)).toBeNull()
  })

  it('returns null from the start facing north, with the wall off to the side', () => {
    expect(screenToWall(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT)).toBeNull()
  })

  it('maps the view\'s centre to the mirror\'s centre from the start facing west', () => {
    const point = screenToWall(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, WEST)!
    expect(point.s).toBeCloseTo(0)
    expect(point.t).toBeCloseTo(0)
  })

  it('agrees with screenToMirror: the same point on the glass, null elsewhere', () => {
    let onGlass = 0
    for (let x = 0; x < WIDTH; x += 7) {
      for (let y = 0; y < HEIGHT; y += 7) {
        const wall = fromNook(x, y)
        const mirror = screenToMirror(x, y, WIDTH, HEIGHT, WEST, NOOK_EYE)
        if (wall && isOnGlass(wall)) {
          onGlass++
          expect(mirror).toEqual(wall)
        } else {
          expect(mirror).toBeNull()
        }
      }
    }
    expect(onGlass).toBeGreaterThan(0)
  })
})

describe('pullPixels', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  const fromNook = (drop = 0) => pullPixels(WIDTH, HEIGHT, drop, WEST, NOOK_EYE)
  const handle = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND)

  it('draws the pull from the nook facing west', () => {
    expect(fromNook().length).toBeGreaterThan(0)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of fromNook()) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it('uses the worn and full foreground colours', () => {
    expect(new Set(fromNook().map((p) => p.colour))).toEqual(new Set([FOREGROUND_WORN, FOREGROUND]))
  })

  it('is deterministic', () => {
    expect(fromNook(0.05)).toEqual(fromNook(0.05))
  })

  it('defaults to no drop', () => {
    expect(pullPixels(WIDTH, HEIGHT, undefined, WEST, NOOK_EYE)).toEqual(fromNook(0))
  })

  it('hangs right of the mirror from the nook facing west', () => {
    const mirror = extent(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE))
    expect(extent(fromNook()).left).toBeGreaterThan(mirror.right)
  })

  it('hangs at the cord\'s column, from the ceiling to around eye height', () => {
    const { left, top, right, bottom } = extent(fromNook())
    const cord = columnAt(PULL_S, 1)
    expect(left).toBeLessThan(cord)
    expect(right).toBeGreaterThan(cord)
    expect(top).toBe(rowAt(CEILING_Y, 1))
    expect(bottom).toBeGreaterThan(HEIGHT / 2 - 5)
    expect(bottom).toBeLessThan(HEIGHT / 2 + 10)
  })

  it('lowers the handle about 128 pixels per mirror unit of drop', () => {
    const rest = extent(handle(fromNook()))
    const dropped = extent(handle(fromNook(0.1)))
    expect(Math.abs(dropped.bottom - rest.bottom - 0.1 * FOCAL)).toBeLessThanOrEqual(1)
    expect(Math.abs(dropped.top - rest.top - 0.1 * FOCAL)).toBeLessThanOrEqual(1)
  })

  it('keeps the cord\'s top at the ceiling when dropped', () => {
    expect(extent(fromNook(0.1)).top).toBe(extent(fromNook()).top)
  })

  it('draws more cord when dropped', () => {
    const cord = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND_WORN)
    expect(cord(fromNook(0.1)).length).toBeGreaterThan(cord(fromNook()).length)
  })

  it('draws nothing from the nook facing east, with the pull behind the camera', () => {
    expect(pullPixels(WIDTH, HEIGHT, 0, EAST, NOOK_EYE)).toEqual([])
  })

  it('draws a smaller pull from the start facing west', () => {
    const fromStart = pullPixels(WIDTH, HEIGHT, 0, WEST)
    expect(fromStart.length).toBeGreaterThan(0)
    const near = extent(fromNook())
    const far = extent(fromStart)
    expect(far.bottom - far.top).toBeLessThan(near.bottom - near.top)
  })
})

describe('plaquePixels', () => {
  const WEST = Math.PI / 2
  const EAST = (3 * Math.PI) / 2
  // A full logo, and one with only its left half filled.
  const FULL: LogoMap = Array.from({ length: LOGO_SIZE }, () => '#'.repeat(LOGO_SIZE))
  const HALF: LogoMap = Array.from({ length: LOGO_SIZE }, () => '#'.repeat(LOGO_SIZE / 2) + '.'.repeat(LOGO_SIZE / 2))
  const fromNook = (plaque: Plaque) => plaquePixels(WIDTH, HEIGHT, plaque, WEST, NOOK_EYE)
  const resting = fromNook({ logo: FULL })
  const logo = (pixels: Pixel[]) => pixels.filter((p) => p.colour === FOREGROUND)
  const width = (pixels: Pixel[]) => extent(pixels).right - extent(pixels).left

  it('draws the plaque from the nook facing west', () => {
    expect(resting.length).toBeGreaterThan(0)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of resting) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it('is deterministic', () => {
    expect(fromNook({ logo: FULL, depth: 0.5, turn: 0.3 })).toEqual(fromNook({ logo: FULL, depth: 0.5, turn: 0.3 }))
  })

  it('defaults to flush and facing out', () => {
    expect(resting).toEqual(fromNook({ logo: FULL, depth: 0, turn: 0 }))
  })

  it('draws the niche dim, the face worn and a full logo in the full foreground', () => {
    expect(new Set(resting.map((p) => p.colour))).toEqual(new Set([FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND]))
  })

  it('draws a 16 pixel square logo at rest, one pixel per cell', () => {
    const { left, top, right, bottom } = extent(logo(resting))
    expect(right - left + 1).toBe(LOGO_SIZE)
    expect(bottom - top + 1).toBe(LOGO_SIZE)
    expect(pixelSet(logo(resting)).size).toBe(LOGO_SIZE * LOGO_SIZE)
  })

  it('sits within PLAQUE_BOUNDS on screen, centred under the cord', () => {
    const { left, top, right, bottom } = extent(resting)
    expect(Math.abs(left - columnAt(PLAQUE_BOUNDS.left, 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(right - columnAt(PLAQUE_BOUNDS.right, 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(top - rowAt(PLAQUE_BOUNDS.top, 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(bottom - rowAt(PLAQUE_BOUNDS.bottom, 1))).toBeLessThanOrEqual(1)
    expect(Math.abs((left + right) / 2 - columnAt(PULL_S, 1))).toBeLessThanOrEqual(1)
  })

  it('sits below the pull, even with the handle tugged down', () => {
    const top = extent(resting).top
    expect(top).toBeGreaterThan(extent(pullPixels(WIDTH, HEIGHT, 0, WEST, NOOK_EYE)).bottom)
    expect(top).toBeGreaterThan(extent(pullPixels(WIDTH, HEIGHT, 0.1, WEST, NOOK_EYE)).bottom)
  })

  it('sits right of the mirror', () => {
    expect(extent(resting).left).toBeGreaterThan(extent(mirrorPixels(WIDTH, HEIGHT, WEST, NOOK_EYE)).right)
  })

  it('draws a narrower face and logo when sunk', () => {
    const sunk = fromNook({ logo: FULL, depth: 1 })
    expect(width(worn(sunk))).toBeLessThan(width(worn(resting)))
    // Sunk, the full logo is in shadow, a step down to worn.
    expect(logo(sunk)).toEqual([])
  })

  it('keeps the niche the same when sunk', () => {
    expect(extent(fromNook({ logo: FULL, depth: 1 }))).toEqual(extent(resting))
  })

  it('draws a narrower face and logo while turning', () => {
    const turning = fromNook({ logo: FULL, turn: 0.3 })
    expect(width(worn(turning))).toBeLessThan(width(worn(resting)))
    expect(width(logo(turning))).toBeLessThan(width(logo(resting)))
  })

  it('draws the face and logo as one column edge-on', () => {
    const edgeOn = fromNook({ logo: FULL, turn: 0.5 })
    expect(width(worn(edgeOn))).toBeLessThanOrEqual(1)
    expect(width(logo(edgeOn))).toBe(0)
  })

  it('draws different pixels for different logos', () => {
    expect(fromNook({ logo: HALF })).not.toEqual(resting)
    expect(logo(fromNook({ logo: HALF })).length).toBeLessThan(logo(resting).length)
  })

  it('draws only the niche and face for an empty logo', () => {
    const empty = fromNook({ logo: Array.from({ length: LOGO_SIZE }, () => '.'.repeat(LOGO_SIZE)) })
    expect(new Set(empty.map((p) => p.colour))).toEqual(new Set([FOREGROUND_DIM, FOREGROUND_WORN]))
  })

  it('draws worn and dim logo cells in their colours', () => {
    const map = Array.from({ length: LOGO_SIZE }, (_, r) => (r < 8 ? '+' : '-').repeat(LOGO_SIZE))
    const inside = extent(logo(resting))
    const cells = fromNook({ logo: map }).filter(
      (p) => p.x >= inside.left && p.x <= inside.right && p.y >= inside.top && p.y <= inside.bottom,
    )
    expect(new Set(cells.map((p) => p.colour))).toEqual(new Set([FOREGROUND_WORN, FOREGROUND_DIM]))
  })

  it('draws nothing from the nook facing east, with the plaque behind the camera', () => {
    expect(plaquePixels(WIDTH, HEIGHT, { logo: FULL }, EAST, NOOK_EYE)).toEqual([])
  })

  it('draws a smaller plaque from the start facing west', () => {
    const fromStart = plaquePixels(WIDTH, HEIGHT, { logo: FULL }, WEST)
    expect(fromStart.length).toBeGreaterThan(0)
    expect(width(fromStart)).toBeLessThan(width(resting))
  })

  it('defaults to facing north from the start', () => {
    expect(plaquePixels(WIDTH, HEIGHT, { logo: FULL })).toEqual(plaquePixels(WIDTH, HEIGHT, { logo: FULL }, 0, ORIGIN))
  })
})

describe('previewPixels with a shimmer', () => {
  const WEST = Math.PI / 2
  const CELLS = PREVIEW_WIDTH * PREVIEW_HEIGHT
  const filled = (tone: number) => new Uint8Array(CELLS).fill(tone)
  const striped = Uint8Array.from({ length: CELLS }, (_, i) => Math.floor((i % PREVIEW_WIDTH) / 3) % 4)
  const fromNook = (preview: Uint8Array | null, shimmer?: Shimmer, ripple?: { origin: MirrorPoint; elapsedMs: number }) =>
    previewPixels(WIDTH, HEIGHT, preview, WEST, NOOK_EYE, ripple, shimmer)
  const colours = (pixels: Pixel[]) => new Set(pixels.map((p) => p.colour))

  it('draws nothing for a null preview without a shimmer', () => {
    expect(fromNook(null)).toEqual([])
  })

  it('draws the old preview alone at progress 0', () => {
    expect(fromNook(filled(2), { from: striped, progress: 0 })).toEqual(fromNook(striped))
  })

  it('draws the new preview alone at progress 1', () => {
    expect(fromNook(striped, { from: filled(2), progress: 1 })).toEqual(fromNook(striped))
  })

  it('mixes both previews mid-shimmer, with some cells flashing brighter', () => {
    const pixels = fromNook(filled(2), { from: filled(1), progress: 0.5 })
    expect(pixels).toHaveLength(GLASS_CELLS.length)
    // Dim cells are still the old preview, worn cells the new one (or the old
    // one flashing); full foreground only comes from the new one flashing.
    expect(colours(pixels)).toEqual(new Set([FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND]))
  })

  it('fades in from empty glass when there was no old preview', () => {
    expect(fromNook(filled(3), { from: null, progress: 0 })).toEqual([])
    const middle = fromNook(filled(3), { from: null, progress: 0.5 })
    expect(middle.length).toBeGreaterThan(0)
    expect(middle.length).toBeLessThan(GLASS_CELLS.length)
    expect(fromNook(filled(3), { from: null, progress: 1 })).toEqual(fromNook(filled(3)))
  })

  it('fades out to empty glass for a null preview', () => {
    expect(fromNook(null, { from: filled(3), progress: 0 })).toEqual(fromNook(filled(3)))
    const middle = fromNook(null, { from: filled(3), progress: 0.5 })
    expect(middle.length).toBeGreaterThan(0)
    expect(middle.length).toBeLessThan(GLASS_CELLS.length)
    expect(fromNook(null, { from: filled(3), progress: 1 })).toEqual([])
  })

  it('ignores a ripple while shimmering', () => {
    const centre = { s: 0, t: 0 }
    const ripple = { origin: centre, elapsedMs: rippleDuration(centre) / 2 }
    expect(fromNook(striped, { from: null, progress: 1 }, ripple)).toEqual(fromNook(striped))
  })

  it('is deterministic', () => {
    const shimmer = { from: striped, progress: 0.4 }
    expect(fromNook(filled(2), shimmer)).toEqual(fromNook(filled(2), shimmer))
  })
})
