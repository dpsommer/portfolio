import { describe, expect, it } from 'vitest'
import { BACKGROUND, FOREGROUND, FOREGROUND_WORN } from './palette.ts'
import {
  BOARD_HEIGHT,
  BOARD_SLOPE,
  BOARD_WIDTH,
  signBoardBounds,
  signpostBackingPixels,
  signpostPixels,
} from './signpost.ts'

const WIDTH = 320
const HEIGHT = 240

// The post is 6 pixels wide, centred on the canvas.
function geometry(width: number, height: number) {
  const pixels = signpostPixels(width, height)
  const centreX = Math.floor(width / 2)
  const boardLeft = centreX - BOARD_WIDTH / 2
  return {
    pixels,
    boardLeft,
    boardRight: boardLeft + BOARD_WIDTH - 1,
    postLeft: centreX - 3,
    postRight: centreX + 2,
    groundY: Math.max(...pixels.map((p) => p.y)),
  }
}

// The board's top and bottom edges, measured just either side of the post.
function boardEdgesBesidePost(width: number, height: number) {
  const { postLeft, postRight, groundY, pixels } = geometry(width, height)
  const besidePost = pixels.filter(
    (p) => ((p.x >= postLeft - 3 && p.x < postLeft) || (p.x > postRight && p.x <= postRight + 3)) && p.y !== groundY,
  )
  const ys = besidePost.map((p) => p.y)
  return { top: Math.min(...ys), bottom: Math.max(...ys) }
}

describe('signpostPixels', () => {
  it('is deterministic', () => {
    expect(signpostPixels(WIDTH, HEIGHT)).toEqual(signpostPixels(WIDTH, HEIGHT))
  })

  it('draws something', () => {
    expect(signpostPixels(WIDTH, HEIGHT).length).toBeGreaterThan(0)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of signpostPixels(WIDTH, HEIGHT)) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it('only uses foreground colours', () => {
    for (const { colour } of signpostPixels(WIDTH, HEIGHT)) {
      expect([FOREGROUND, FOREGROUND_WORN]).toContain(colour)
    }
  })

  it('is worn, with some pixels in the worn colour', () => {
    const colours = signpostPixels(WIDTH, HEIGHT).map((p) => p.colour)
    expect(colours).toContain(FOREGROUND_WORN)
    expect(colours).toContain(FOREGROUND)
  })

  it('is roughly centred horizontally', () => {
    const xs = signpostPixels(WIDTH, HEIGHT).map((p) => p.x)
    const centre = (Math.min(...xs) + Math.max(...xs)) / 2
    expect(Math.abs(centre - WIDTH / 2)).toBeLessThanOrEqual(2)
  })

  it('tilts the board so its right side sits higher than its left', () => {
    const pixels = signpostPixels(WIDTH, HEIGHT)
    const boardLeft = WIDTH / 2 - BOARD_WIDTH / 2
    const boardRight = boardLeft + BOARD_WIDTH - 1
    // Compare a few columns in from each end, away from the chipped corner.
    const topAt = (x: number) => Math.min(...pixels.filter((p) => p.x === x).map((p) => p.y))
    const leftTop = topAt(boardLeft + 10)
    const rightTop = topAt(boardRight - 10)
    const expectedRise = Math.round(-BOARD_SLOPE * (BOARD_WIDTH - 21))
    expect(BOARD_SLOPE).toBeLessThan(0)
    expect(leftTop - rightTop).toBeGreaterThanOrEqual(expectedRise - 1)
    expect(leftTop - rightTop).toBeLessThanOrEqual(expectedRise + 1)
  })

  it.each([
    [320, 240],
    [640, 480],
  ])('centres the board roughly vertically at %ix%i', (width, height) => {
    const { boardLeft, boardRight, postLeft, postRight, groundY, pixels } = geometry(width, height)
    const boardYs = pixels
      .filter((p) => p.x >= boardLeft + 10 && p.x <= boardRight - 10)
      .filter((p) => p.x < postLeft || p.x > postRight)
      .filter((p) => p.y !== groundY)
      .map((p) => p.y)
    const middle = (Math.min(...boardYs) + Math.max(...boardYs)) / 2
    expect(Math.abs(middle - height / 2)).toBeLessThanOrEqual(5)
  })

  it('has the post sticking up above the top of the board', () => {
    const { postLeft, postRight, pixels } = geometry(WIDTH, HEIGHT)
    const { top: boardTop } = boardEdgesBesidePost(WIDTH, HEIGHT)
    const postTop = Math.min(...pixels.filter((p) => p.x >= postLeft && p.x <= postRight).map((p) => p.y))
    expect(boardTop - postTop).toBeGreaterThanOrEqual(4)
  })

  it('caps the top of the post with a full row across its width', () => {
    const { postLeft, postRight, pixels } = geometry(WIDTH, HEIGHT)
    const inPost = pixels.filter((p) => p.x >= postLeft && p.x <= postRight)
    const postTop = Math.min(...inPost.map((p) => p.y))
    const capXs = new Set(inPost.filter((p) => p.y === postTop).map((p) => p.x))
    expect(capXs.size).toBe(postRight - postLeft + 1)
  })

  it('does not draw the post over the face of the board', () => {
    const { postLeft, postRight, pixels } = geometry(WIDTH, HEIGHT)
    const { top, bottom } = boardEdgesBesidePost(WIDTH, HEIGHT)
    // Just inside the inner frame, above and below the text, the board is blank.
    const blankRows = [top + 4, top + 5, top + 6, top + 7, bottom - 7, bottom - 6, bottom - 5, bottom - 4]
    const overBoard = pixels.filter((p) => p.x >= postLeft && p.x <= postRight && blankRows.includes(p.y))
    expect(overBoard).toEqual([])
  })

  it('scales its position with the canvas size', () => {
    const xs = signpostPixels(640, 480).map((p) => p.x)
    const centre = (Math.min(...xs) + Math.max(...xs)) / 2
    expect(Math.abs(centre - 320)).toBeLessThanOrEqual(2)
  })
})

describe('signpostBackingPixels', () => {
  it('is deterministic', () => {
    expect(signpostBackingPixels(WIDTH, HEIGHT)).toEqual(signpostBackingPixels(WIDTH, HEIGHT))
  })

  it('only uses the background colour', () => {
    const pixels = signpostBackingPixels(WIDTH, HEIGHT)
    expect(pixels.length).toBeGreaterThan(0)
    for (const { colour } of pixels) expect(colour).toBe(BACKGROUND)
  })

  it('uses integer coordinates within the canvas', () => {
    for (const { x, y } of signpostBackingPixels(WIDTH, HEIGHT)) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(HEIGHT)
    }
  })

  it.each([
    [320, 240],
    [640, 480],
  ])('covers every board and post pixel of the signpost on a %ix%i canvas', (width, height) => {
    const backing = new Set(signpostBackingPixels(width, height).map((p) => `${p.x},${p.y}`))
    const sign = signpostPixels(width, height)
    const groundY = Math.max(...sign.map((p) => p.y))
    const boardAndPost = sign.filter((p) => p.y !== groundY)
    expect(boardAndPost.length).toBeGreaterThan(0)
    for (const p of boardAndPost) expect(backing.has(`${p.x},${p.y}`)).toBe(true)
  })

  it('leaves the chipped top-right corner uncovered', () => {
    const pixels = signpostBackingPixels(WIDTH, HEIGHT)
    const backing = new Set(pixels.map((p) => `${p.x},${p.y}`))
    const right = Math.max(...pixels.map((p) => p.x))
    const topAt = (x: number) => Math.min(...pixels.filter((p) => p.x === x).map((p) => p.y))
    // Away from the chip, the board's top edge is a column or so higher than at the corner.
    const topNearRight = topAt(right - 10)
    expect(topAt(right)).toBeGreaterThan(topNearRight)
    expect(backing.has(`${right},${topNearRight}`)).toBe(false)
  })
})

describe('signBoardBounds', () => {
  // Backing pixels of the board alone, without the post running above and below it.
  function boardBackingPixels(width: number, height: number) {
    const { postLeft, postRight } = geometry(width, height)
    return signpostBackingPixels(width, height).filter((p) => p.x < postLeft || p.x > postRight)
  }

  it('matches the expected rectangle on a 320x240 canvas', () => {
    expect(signBoardBounds(WIDTH, HEIGHT)).toEqual({ left: 100, top: 95, right: 219, bottom: 144 })
  })

  it('is deterministic', () => {
    expect(signBoardBounds(WIDTH, HEIGHT)).toEqual(signBoardBounds(WIDTH, HEIGHT))
  })

  it('uses integer coordinates', () => {
    for (const value of Object.values(signBoardBounds(WIDTH, HEIGHT))) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })

  it('spans the board width', () => {
    const { left, right } = signBoardBounds(WIDTH, HEIGHT)
    expect(right - left + 1).toBe(BOARD_WIDTH)
  })

  it('is taller than the board because of the tilt', () => {
    const { top, bottom } = signBoardBounds(WIDTH, HEIGHT)
    expect(bottom - top + 1).toBeGreaterThan(BOARD_HEIGHT)
  })

  it('has its top above the untilted board top', () => {
    const untiltedTop = Math.floor((HEIGHT - BOARD_HEIGHT) / 2)
    expect(signBoardBounds(WIDTH, HEIGHT).top).toBeLessThan(untiltedTop)
  })

  it('has its bottom below the untilted board bottom', () => {
    const untiltedBottom = Math.floor((HEIGHT - BOARD_HEIGHT) / 2) + BOARD_HEIGHT - 1
    expect(signBoardBounds(WIDTH, HEIGHT).bottom).toBeGreaterThan(untiltedBottom)
  })

  it.each([
    [320, 240],
    [640, 480],
  ])('contains every board pixel on a %ix%i canvas', (width, height) => {
    const { left, top, right, bottom } = signBoardBounds(width, height)
    const board = boardBackingPixels(width, height)
    expect(board.length).toBeGreaterThan(0)
    for (const { x, y } of board) {
      expect(x).toBeGreaterThanOrEqual(left)
      expect(x).toBeLessThanOrEqual(right)
      expect(y).toBeGreaterThanOrEqual(top)
      expect(y).toBeLessThanOrEqual(bottom)
    }
  })

  it('fits the board tightly', () => {
    const { left, top, right, bottom } = signBoardBounds(WIDTH, HEIGHT)
    const board = boardBackingPixels(WIDTH, HEIGHT)
    const xs = board.map((p) => p.x)
    const ys = board.map((p) => p.y)
    expect(Math.min(...xs)).toBe(left)
    expect(Math.max(...xs)).toBe(right)
    expect(Math.max(...ys)).toBe(bottom)
    // The chipped corner may remove the very highest pixel.
    expect(Math.min(...ys) - top).toBeLessThanOrEqual(1)
  })

  it('includes the board\'s lower-left and upper-right corners', () => {
    const { left, top, right, bottom } = signBoardBounds(WIDTH, HEIGHT)
    const board = new Set(boardBackingPixels(WIDTH, HEIGHT).map((p) => `${p.x},${p.y}`))
    expect(board.has(`${left},${bottom}`)).toBe(true)
    // The top-right corner is chipped, so check the top edge just left of the chip.
    const topRow = boardBackingPixels(WIDTH, HEIGHT).filter((p) => p.y <= top + 1)
    expect(topRow.length).toBeGreaterThan(0)
    expect(Math.max(...topRow.map((p) => p.x))).toBeGreaterThan(right - 10)
  })

  it('scales and stays centred on a 640x480 canvas', () => {
    const { left, top, right, bottom } = signBoardBounds(640, 480)
    expect(right - left + 1).toBe(BOARD_WIDTH)
    expect(Math.abs((left + right) / 2 - 320)).toBeLessThanOrEqual(1)
    expect(Math.abs((top + bottom) / 2 - 240)).toBeLessThanOrEqual(2)
  })

  it('moves with the canvas by the change in its centre', () => {
    const small = signBoardBounds(WIDTH, HEIGHT)
    const large = signBoardBounds(640, 480)
    expect(large).toEqual({
      left: small.left + 160,
      top: small.top + 120,
      right: small.right + 160,
      bottom: small.bottom + 120,
    })
  })
})
