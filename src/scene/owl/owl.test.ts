import { describe, expect, it } from 'vitest'
import { FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'
import type { MirrorPoint } from '../mirror/frame.ts'
import type { WindowLine } from '../window/tracery.ts'
import {
  BLINK_MS,
  NECK,
  OWL_HOLD_MS,
  OWL_LOOK_MS,
  OWL_TURN_MS,
  REST_POSE,
  REST_TURN,
  TILT_ANGLE,
  TILT_MS,
  owlIdle,
  owlLayers,
  owlLook,
  owlPose,
} from './owl.ts'
import type { OwlPose } from './owl.ts'

const FACING: OwlPose = { turn: 0, tilt: 0, blink: 0 }
const posed = (pose: Partial<OwlPose>): OwlPose => ({ ...FACING, ...pose })
const layersFor = (pose: Partial<OwlPose>) => {
  const [dim, worn, bright] = owlLayers(posed(pose))
  return { dim: dim.lines, worn: worn.lines, bright: bright.lines }
}
const allPoints = (pose: Partial<OwlPose>) => owlLayers(posed(pose)).flatMap(({ lines }) => lines.flat())

// A line as a key independent of its direction, rounded against float noise.
const round = (x: number) => Math.round(x * 1e6) / 1e6 + 0
const key = ([a, b]: WindowLine) => {
  const [p, q] = [a, b].map(({ s, t }) => `${round(s)},${round(t)}`).sort()
  return `${p}|${q}`
}
const mirrorLine = ([a, b]: WindowLine): WindowLine => [
  { s: -a.s, t: a.t },
  { s: -b.s, t: b.t },
]
const keys = (lines: WindowLine[]) => new Set(lines.map(key))
const missingFrom = (lines: WindowLine[], others: WindowLine[]) => {
  const other = keys(others)
  return lines.filter((line) => !other.has(key(line)))
}
// The pupils: single points, drawn as lines from a point to itself.
const pupils = (lines: WindowLine[]) => lines.filter(([a, b]) => a.s === b.s && a.t === b.t).map(([a]) => a)
// Turns a point `angle` anticlockwise about the neck.
const aboutNeck = ({ s, t }: MirrorPoint, angle: number) => {
  const [du, dw] = [s - NECK.s, t - NECK.t]
  return {
    s: NECK.s + du * Math.cos(angle) - dw * Math.sin(angle),
    t: NECK.t + du * Math.sin(angle) + dw * Math.cos(angle),
  }
}
const expectPointClose = (actual: MirrorPoint, expected: MirrorPoint) => {
  expect(actual.s).toBeCloseTo(expected.s, 9)
  expect(actual.t).toBeCloseTo(expected.t, 9)
}

describe('owlLayers', () => {
  it('draws dim chest feathers, then worn wings, feet and brows, then the bright outline and face', () => {
    const layers = owlLayers(REST_POSE)
    expect(layers.map(({ colour }) => colour)).toEqual([FOREGROUND_DIM, FOREGROUND_WORN, FOREGROUND])
    for (const { lines } of layers) expect(lines.length).toBeGreaterThan(0)
  })

  it('is symmetric about u 0 facing the visitor with its head upright', () => {
    for (const lines of Object.values(layersFor(FACING))) {
      expect(keys(lines.map(mirrorLine))).toEqual(keys(lines))
    }
  })

  it('is not symmetric at rest, its head turned', () => {
    const { bright } = layersFor(REST_POSE)
    expect(keys(bright.map(mirrorLine))).not.toEqual(keys(bright))
  })

  it('is about 0.16 wide and a little over 0.3 tall, standing on w 0', () => {
    for (const pose of [FACING, REST_POSE]) {
      const points = allPoints(pose)
      const us = points.map(({ s }) => s)
      const ws = points.map(({ t }) => t)
      expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(0.16, 2)
      expect(Math.min(...ws)).toBe(0)
      expect(Math.max(...ws)).toBeGreaterThan(0.3)
      expect(Math.max(...ws)).toBeLessThan(0.35)
    }
  })

  describe('turning its head', () => {
    const pupilsAt = (turn: number) => pupils(layersFor({ turn }).bright).sort((a, b) => a.s - b.s)

    it('shows two pupils, one either side of u 0, facing the visitor', () => {
      const [left, right] = pupilsAt(0)
      expect(pupilsAt(0)).toHaveLength(2)
      expect(left.s).toBeCloseTo(-right.s, 9)
      expect(right.s).toBeGreaterThan(0)
      expect(left.t).toBe(right.t)
    })

    it('moves both eyes toward +u as the turn grows, while both are seen', () => {
      const turns = [0, 0.3, REST_TURN, 0.9]
      const seen = turns.map(pupilsAt)
      for (const eyes of seen) expect(eyes).toHaveLength(2)
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i][0].s).toBeGreaterThan(seen[i - 1][0].s)
        expect(seen[i][1].s).toBeGreaterThan(seen[i - 1][1].s)
      }
    })

    it('stops drawing the far eye and its brow once it has turned past the side', () => {
      const near = pupilsAt(0.9)
      const turned = pupilsAt(1.2)
      expect(turned).toHaveLength(1)
      // The one left is the near eye, still left of where the far one was.
      expect(turned[0].s).toBeGreaterThan(near[0].s)
      expect(turned[0].s).toBeLessThan(near[1].s)
      expect(layersFor({ turn: 1.2 }).worn).toHaveLength(layersFor({ turn: 0.9 }).worn.length - 1)
    })

    it('leaves the body, wings, feet and chest where they are', () => {
      const facing = layersFor(FACING)
      const turned = layersFor({ turn: 0.9 })
      expect(turned.dim).toEqual(facing.dim)
      expect(missingFrom(facing.worn, turned.worn).length).toBeLessThanOrEqual(2)
    })
  })

  describe('blinking', () => {
    const open = layersFor(FACING).bright
    const shut = layersFor({ blink: 1 }).bright

    it('draws no pupils with its eyes shut', () => {
      expect(pupils(open)).toHaveLength(2)
      expect(pupils(shut)).toEqual([])
    })

    it('flattens each eye to a horizontal line through where its pupil was', () => {
      const lids = missingFrom(shut, open)
      expect(lids).toHaveLength(2)
      for (const [a, b] of lids) expect(a.t).toBe(b.t)
      const middles = lids.map(([a, b]) => ({ s: (a.s + b.s) / 2, t: a.t })).sort((p, q) => p.s - q.s)
      const centres = pupils(open).sort((p, q) => p.s - q.s)
      middles.forEach((middle, i) => expectPointClose(middle, centres[i]))
      for (const [a, b] of lids) expect(Math.abs(b.s - a.s)).toBeGreaterThan(0.01)
    })

    it('draws nothing of the open rings with its eyes shut, and leaves the rest of the owl alone', () => {
      const gone = missingFrom(open, shut)
      const removed = keys(gone)
      // All that's gone are the rings and pupils, which sit round the eyes.
      expect(gone.length).toBeGreaterThan(10)
      const centres = pupils(open)
      for (const line of gone) {
        for (const p of line) expect(Math.min(...centres.map((c) => Math.hypot(p.s - c.s, p.t - c.t)))).toBeLessThan(0.025)
      }
      expect(open.filter((line) => !removed.has(key(line)))).toHaveLength(open.length - gone.length)
      expect(layersFor({ blink: 1 }).worn).toEqual(layersFor(FACING).worn)
    })

    it('flattens the eyes when nearly shut too', () => {
      expect(missingFrom(layersFor({ blink: 0.95 }).bright, open)).toEqual(missingFrom(shut, open))
    })

    it('keeps the rings but hides the pupils past half shut', () => {
      const half = layersFor({ blink: 0.6 }).bright
      expect(pupils(half)).toEqual([])
      expect(missingFrom(half, open).length).toBeGreaterThan(2)
    })
  })

  describe('tilting its head', () => {
    const tilt = 0.3
    const upright = layersFor(FACING)
    const tilted = layersFor({ tilt })
    // The head's lines come after the body's in the bright layer, and the
    // brows after the wings and feet in the worn one.
    const changedFrom = (before: WindowLine[], after: WindowLine[]) =>
      before.findIndex((line, i) => key(line) !== key(after[i]))

    it('leaves the chest unchanged', () => {
      expect(tilted.dim).toEqual(upright.dim)
    })

    it.each([
      ['bright', 'body', 'head'],
      ['worn', 'wings and feet', 'brows'],
    ] as const)('in the %s layer keeps the %s and turns the %s about the neck', (layer, _kept, _turned) => {
      const before = upright[layer]
      const after = tilted[layer]
      expect(after).toHaveLength(before.length)
      const from = changedFrom(before, after)
      expect(from).toBeGreaterThan(0)
      expect(after.slice(0, from)).toEqual(before.slice(0, from))
      before.slice(from).forEach((line, i) => {
        line.forEach((p, j) => expectPointClose(after[from + i][j], aboutNeck(p, tilt)))
      })
    })

    it('leans the head toward -u for a positive tilt', () => {
      const from = changedFrom(upright.bright, tilted.bright)
      const meanU = (lines: WindowLine[]) => {
        const points = lines.slice(from).flat()
        return points.reduce((sum, { s }) => sum + s, 0) / points.length
      }
      expect(meanU(upright.bright)).toBeCloseTo(0, 9)
      expect(meanU(tilted.bright)).toBeLessThan(-0.01)
    })
  })
})

describe('owlIdle', () => {
  // Each blink starts after its gap: 3200, 4100, 2600 and 5000 ms, each after
  // the last blink ends. The cycle is the gaps and four blinks.
  const BLINK_STARTS = [3200, 7480, 10260, 15440]
  const CYCLE = 15620

  it.each(BLINK_STARTS)('is shut midway through the blink starting at %i ms', (start) => {
    expect(owlIdle(start + BLINK_MS / 2).blink).toBe(1)
  })

  it.each(BLINK_STARTS)('repeats the blink starting at %i ms every cycle', (start) => {
    expect(owlIdle(CYCLE + start + BLINK_MS / 2).blink).toBe(1)
    expect(owlIdle(2 * CYCLE + start + BLINK_MS / 2).blink).toBe(1)
  })

  it.each([0, 1000, 3199, 3200 + BLINK_MS, 5000, 7479, 7480 + BLINK_MS, 12000, 15439, CYCLE, CYCLE + 3199])(
    'is open between blinks, at %i ms',
    (elapsed) => {
      expect(owlIdle(elapsed).blink).toBe(0)
    },
  )

  it('half closes a sixth of the way in and half opens five sixths in', () => {
    expect(owlIdle(3200 + BLINK_MS / 6).blink).toBeCloseTo(0.5, 9)
    expect(owlIdle(3200 + (5 * BLINK_MS) / 6).blink).toBeCloseTo(0.5, 9)
  })

  it('stays shut through the middle third', () => {
    for (const into of [BLINK_MS / 3, BLINK_MS / 2, (2 * BLINK_MS) / 3]) expect(owlIdle(3200 + into).blink).toBe(1)
  })

  it.each([
    ['+', 0, 1],
    ['-', 1, -1],
    ['+', 2, 1],
    ['-', 3, -1],
  ])('tilts %s TILT_ANGLE midway through the tilt in period %i', (_, period, side) => {
    expect(owlIdle(period * 7000 + 4000 + TILT_MS / 2).tilt).toBeCloseTo(side * TILT_ANGLE, 9)
  })

  it('eases into the tilt, part way a quarter through', () => {
    const quarter = owlIdle(4000 + TILT_MS / 4).tilt
    expect(quarter).toBeGreaterThan(0)
    expect(quarter).toBeLessThan(TILT_ANGLE)
  })

  it.each([0, 3999, 4000 + TILT_MS, 6999, 7000 + 3999, 7000 + 4000 + TILT_MS])('holds the head upright at %i ms', (elapsed) => {
    expect(owlIdle(elapsed).tilt).toBe(0)
  })
})

describe('owlLook', () => {
  it('starts and ends at the resting turn', () => {
    expect(owlLook(0)).toBeCloseTo(REST_TURN, 9)
    expect(owlLook(OWL_LOOK_MS - 1)).toBeCloseTo(REST_TURN, 3)
  })

  it('faces the visitor throughout the hold', () => {
    for (const elapsed of [OWL_TURN_MS, OWL_TURN_MS + OWL_HOLD_MS / 2, OWL_TURN_MS + OWL_HOLD_MS]) {
      expect(owlLook(elapsed)).toBeCloseTo(0, 9)
    }
  })

  it('turns steadily toward the visitor, then steadily back', () => {
    const toward = [0, 50, 100, 150, 200, 250, 300].map((t) => owlLook(t) as number)
    const back = [1500, 1550, 1600, 1650, 1700, 1750, 1799].map((t) => owlLook(t) as number)
    for (let i = 1; i < toward.length; i++) expect(toward[i]).toBeLessThan(toward[i - 1])
    for (let i = 1; i < back.length; i++) expect(back[i]).toBeGreaterThan(back[i - 1])
  })

  it.each([-1, OWL_LOOK_MS, OWL_LOOK_MS + 500])('is null outside the look, at %i ms', (elapsed) => {
    expect(owlLook(elapsed)).toBeNull()
  })
})

describe('owlPose', () => {
  const MID_BLINK = 3200 + BLINK_MS / 2
  const MID_TILT = 4000 + TILT_MS / 2

  it('rests turned away, with the idle blink and tilt, with no look playing', () => {
    expect(owlPose(MID_BLINK, null)).toEqual({ turn: REST_TURN, tilt: 0, blink: 1 })
    expect(owlPose(MID_TILT, null)).toEqual({ turn: REST_TURN, tilt: owlIdle(MID_TILT).tilt, blink: 0 })
  })

  it('takes the look\'s turn while it plays, keeping the idle animation', () => {
    expect(owlPose(MID_TILT, OWL_TURN_MS / 2)).toEqual({ ...owlIdle(MID_TILT), turn: owlLook(OWL_TURN_MS / 2) })
    expect(owlPose(MID_BLINK, OWL_TURN_MS + 1).turn).toBeCloseTo(0, 9)
  })

  it.each([-1, OWL_LOOK_MS])('rests turned away with a look not playing, %i ms in', (lookElapsed) => {
    expect(owlPose(0, lookElapsed).turn).toBe(REST_TURN)
  })

  describe('held still', () => {
    it('neither blinks nor tilts', () => {
      expect(owlPose(MID_BLINK, null, true)).toEqual(REST_POSE)
      expect(owlPose(MID_TILT, null, true)).toEqual(REST_POSE)
    })

    it.each([0, 1, OWL_LOOK_MS / 2, OWL_LOOK_MS - 1])('faces the visitor straight away through a look, %i ms in', (lookElapsed) => {
      expect(owlPose(MID_BLINK, lookElapsed, true)).toEqual({ turn: 0, tilt: 0, blink: 0 })
    })

    it.each([-1, OWL_LOOK_MS])('rests turned away with a look not playing, %i ms in', (lookElapsed) => {
      expect(owlPose(MID_TILT, lookElapsed, true)).toEqual(REST_POSE)
    })
  })
})
