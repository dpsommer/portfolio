import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { BLOCKED_CURSOR, CURSORS, HAND_CURSOR, getCursorZone } from './cursors.ts'
import type { CursorZone } from './cursors.ts'
import { ABOUT_TEXT, CARD_HEALTH, CARD_NAME, PROFILE, PROFILE_DESCRIPTION } from './aboutText.ts'
import avatarSrc from '../assets/avatar.jpg'
import { MIRROR_SITES, openUrl } from './mirrorSites.ts'
import { CARET_BLINK_MS, SIGN_PAGES, TYPING_MS_PER_CHAR } from './signText.ts'
import { GLASS_CENTRE } from '../scene/mirror/frame.ts'
import type { MirrorPoint } from '../scene/mirror/frame.ts'
import { mirrorPixels, pullPixels, screenToMirror, screenToWall } from '../scene/mirror/pixels.ts'
import type { RippleState } from '../scene/mirror/pixels.ts'
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, quantisePreview } from '../scene/mirror/preview.ts'
import { AVATAR_CARD_SIZE, CARD_BOUNDS, drawSidePanel } from '../scene/character/card.ts'
import { quantisePicture } from '../scene/character/picture.ts'
import type { Picture } from '../scene/character/picture.ts'
import { AVATAR_PROFILE_SIZE, drawProfile } from '../scene/character/profile.ts'
import type { LogoMap, Plaque } from '../scene/mirror/plaque.ts'
import type { Preview, Shimmer } from '../scene/mirror/preview.ts'
import { isOnPull } from '../scene/mirror/pull.ts'
import { rippleDuration } from '../scene/mirror/ripple.ts'
import { TURN_YAW, turn } from '../scene/navigation/heading.ts'
import type { Heading, TurnDirection } from '../scene/navigation/heading.ts'
import { navButtonAt } from '../scene/navigation/navButtons.ts'
import type { KeyPress, NavButton } from '../scene/navigation/navButtons.ts'
import { drawNavigationPanel } from '../scene/navigation/navigationPanel.ts'
import { PLACES, backFrom, forwardFrom } from '../scene/navigation/places.ts'
import type { PlaceName } from '../scene/navigation/places.ts'
import { FOREGROUND } from '../scene/core/palette.ts'
import { drawPixels, drawScene } from '../scene/draw.ts'
import { caretInset, pixelBounds, selectionPixels } from '../scene/selection/selection.ts'
import { signPixels } from '../scene/sign/pixels.ts'
import type { Bounds } from '../scene/core/types.ts'
import { drawTextBox, textBoxLines } from '../scene/textBox/textBox.ts'
import './ViewPane.scss'

// Drawing resolution of the canvas; CSS scales it up to fit the screen.
export const VIEW_WIDTH = 320
export const VIEW_HEIGHT = 240
// The pane is split into the room in the upper left (70% of the pane's width),
// a panel below the room and a panel down the right. The lower panel is as
// tall as the side panel is wide. Panels are drawn at the same pixel scale as
// the room, and the 5-pixel bands dividing the areas come out of the panels.
const PANE_WIDTH = 457
const DIVIDER_THICKNESS = 5
export const SIDE_PANEL_WIDTH = PANE_WIDTH - VIEW_WIDTH - DIVIDER_THICKNESS
export const LOWER_PANEL_WIDTH = VIEW_WIDTH
export const LOWER_PANEL_HEIGHT = SIDE_PANEL_WIDTH
const PANE_HEIGHT = VIEW_HEIGHT + DIVIDER_THICKNESS + LOWER_PANEL_HEIGHT
export const SIDE_PANEL_HEIGHT = PANE_HEIGHT

// How long a quarter turn and a step forward take to animate.
export const TURN_DURATION_MS = 250
export const MOVE_DURATION_MS = 350
// How long a tug on the curtain pull and the mirror's change of site take.
export const SWITCH_DURATION_MS = 900
// The pull drops this far (mirror units) over the first PULL_DOWN_MS, springs
// back by PULL_UP_MS, and the glass shimmers over to the next site from then
// on.
const PULL_DROP = 0.1
const PULL_DOWN_MS = 150
const PULL_UP_MS = 600
// Meanwhile the logo plaque sinks into the wall over the first PLAQUE_SINK_MS,
// turns to the next site's logo by PLAQUE_TURN_END_MS, then pushes back out.
const PLAQUE_SINK_MS = 200
const PLAQUE_TURN_END_MS = 650
// The navigation key for a turn or step goes down over the first KEY_PRESS_MS
// and comes back up over the last KEY_PRESS_MS.
const KEY_PRESS_MS = 60

// The sign's board and text, seen from in front of it facing north; not its nail and cords.
const SIGN_BOUNDS = pixelBounds(
  signPixels(VIEW_WIDTH, VIEW_HEIGHT, 0, PLACES.sign).filter((p) => p.colour === FOREGROUND),
)

// Whether a point in canvas pixels is inside inclusive bounds.
function isInside(bounds: Bounds, x: number, y: number): boolean {
  const { left, top, right, bottom } = bounds
  return x >= left && x < right + 1 && y >= top && y < bottom + 1
}

// Whether a point in canvas pixels is over the mirror's glass, seen from the
// nook facing west, the view it's clicked from. The frame doesn't count.
function isOverGlass(x: number, y: number): boolean {
  return screenToMirror(x, y, VIEW_WIDTH, VIEW_HEIGHT, TURN_YAW.left, PLACES.nook) !== null
}

// Whether a point in canvas pixels is over the curtain pull, seen from the same view.
function isOverPull(x: number, y: number): boolean {
  const point = screenToWall(x, y, VIEW_WIDTH, VIEW_HEIGHT, TURN_YAW.left, PLACES.nook)
  return point !== null && isOnPull(point)
}

// The things that can be used, by clicking or by selecting them with Tab and
// pressing Enter or Space: those in the room, and the character card in the
// side panel.
type RoomInteractable = 'sign' | 'mirror' | 'pull'
type Interactable = RoomInteractable | 'card'

// What can be used from `place` facing `heading`, in Tab order. Each thing in
// the room is only usable from where it was designed to be seen. The card is
// always usable and comes last; while the profile view covers the room it's
// the only thing.
function interactablesIn(place: PlaceName, heading: Heading, profileOpen: boolean): Interactable[] {
  if (profileOpen) return ['card']
  if (place === 'sign' && heading === 'north') return ['sign', 'card']
  if (place === 'nook' && heading === 'west') return ['mirror', 'pull', 'card']
  return ['card']
}

// Where each thing in the room is on the canvas in the view it's used from,
// for the selection carets: the sign's board, the mirror with its frame, and
// the pull's handle. The card's carets are on the side panel (CARD_BOUNDS).
const INTERACTABLE_BOUNDS: Record<RoomInteractable, Bounds> = {
  sign: SIGN_BOUNDS,
  mirror: pixelBounds(mirrorPixels(VIEW_WIDTH, VIEW_HEIGHT, TURN_YAW.left, PLACES.nook)),
  pull: pixelBounds(
    pullPixels(VIEW_WIDTH, VIEW_HEIGHT, 0, TURN_YAW.left, PLACES.nook).filter((p) => p.colour === FOREGROUND),
  ),
}

const TURNS: Partial<Record<CursorZone, TurnDirection>> = { 'turn-left': 'left', 'turn-right': 'right' }

// Which navigation buttons can be used from `place` facing `heading`.
function enabledButtons(place: PlaceName, heading: Heading): Record<NavButton, boolean> {
  return {
    forward: forwardFrom(place, heading) !== null,
    back: backFrom(place, heading) !== null,
    left: true,
    right: true,
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const easeInOut = (t: number) => (1 - Math.cos(Math.PI * t)) / 2

// How far the pull is tugged down `elapsed` ms into a change of site.
function pullDropAt(elapsed: number): number {
  if (elapsed < PULL_DOWN_MS) return PULL_DROP * easeInOut(elapsed / PULL_DOWN_MS)
  if (elapsed < PULL_UP_MS) return PULL_DROP * (1 - easeInOut((elapsed - PULL_DOWN_MS) / (PULL_UP_MS - PULL_DOWN_MS)))
  return 0
}

// How far down (0 to 1) the navigation key for a turn or step of `duration`
// ms is, `elapsed` ms in.
function keyPressAt(elapsed: number, duration: number): number {
  return Math.max(0, Math.min(1, elapsed / KEY_PRESS_MS, (duration - elapsed) / KEY_PRESS_MS))
}

// The plaque `elapsed` ms into a change of site from `fromLogo` to `toLogo`.
// The logo swaps when the block is edge-on, half-way through its turn.
function plaqueAt(elapsed: number, fromLogo: LogoMap, toLogo: LogoMap): Plaque {
  if (elapsed < PLAQUE_SINK_MS) return { logo: fromLogo, depth: easeInOut(elapsed / PLAQUE_SINK_MS) }
  if (elapsed < PLAQUE_TURN_END_MS) {
    const turn = easeInOut((elapsed - PLAQUE_SINK_MS) / (PLAQUE_TURN_END_MS - PLAQUE_SINK_MS))
    return { logo: turn < 0.5 ? fromLogo : toLogo, depth: 1, turn }
  }
  const out = Math.min(1, (elapsed - PLAQUE_TURN_END_MS) / (SWITCH_DURATION_MS - PLAQUE_TURN_END_MS))
  return { logo: toLogo, depth: 1 - easeInOut(out) }
}

// The keys that work the navigation buttons: the arrow keys, and WASD (either
// case, so Caps Lock doesn't stop them).
const MOVE_KEYS: Record<string, NavButton> = {
  ArrowUp: 'forward',
  ArrowDown: 'back',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'forward',
  s: 'back',
  a: 'left',
  d: 'right',
  W: 'forward',
  S: 'back',
  A: 'left',
  D: 'right',
}

// The keys that move the sign's text on, as a click does: Enter and Space.
const TEXT_KEYS = ['Enter', ' ']

// Whether a key event is aimed at something that takes typing, so arrow keys
// should be left to it.
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

// What the navigation panel shows while a turn or step plays: the buttons
// usable once it's done, and the key for it, held down meanwhile.
type PanelPress = { enabled: Record<NavButton, boolean>; pressed: NavButton }
type Pointer = { zone: CursorZone; overSign: boolean; overMirror: boolean; overPull: boolean }
// The sign's text in the lower panel, while it's open: which of SIGN_PAGES
// shows, and whether a click cut its typing short.
type Dialogue = { page: number; skipped: boolean }
// What the camera is drawing: where it stands, which way it faces, and what's
// playing on the mirror wall.
type View = {
  x: number
  z: number
  yaw: number
  ripple?: RippleState
  shimmer?: Shimmer
  pullDrop?: number
  plaque?: Plaque
}
// The selected thing and how far in its carets are mid-bounce.
type Selection = { target: Interactable; inset: number }
// What's drawn beyond the view: the current site's preview on the glass and
// logo on the plaque, and the carets around the selected thing, if any.
type SiteLook = { preview: Preview | null; logo: LogoMap; selection: Selection | null }

function drawView(
  ctx: CanvasRenderingContext2D,
  { x, z, yaw, ripple, shimmer, pullDrop, plaque }: View,
  { preview, logo, selection }: SiteLook,
) {
  drawScene(ctx, yaw, { x, z }, { preview, ripple, shimmer, pullDrop, plaque: plaque ?? { logo } })
  if (selection && selection.target !== 'card') {
    const { width, height } = ctx.canvas
    drawPixels(ctx, selectionPixels(INTERACTABLE_BOUNDS[selection.target], selection.inset, width, height))
  }
}

// Loads an image scaled to cover `cols` × `rows` cells, cropping whichever
// dimension overflows, and turns its pixels into tones with `quantise`.
// Resolves to null without a 2D canvas.
function loadPicture<T>(
  src: string,
  cols: number,
  rows: number,
  quantise: (rgba: Uint8ClampedArray, width: number, height: number) => T,
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = cols
      canvas.height = rows
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return resolve(null)
      const scale = Math.max(cols / image.width, rows / image.height)
      const width = image.width * scale
      const height = image.height * scale
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, (cols - width) / 2, (rows - height) / 2, width, height)
      const { data } = ctx.getImageData(0, 0, cols, rows)
      resolve(quantise(data, cols, rows))
    }
    image.onerror = reject
    image.src = src
  })
}

// The avatar at the card's size and the profile view's, each quantised at
// its own size so both stay sharp.
type Avatars = { card: Picture | null; profile: Picture | null }

// The About Me text is longer than the sign's, so it's drawn at the font's own size.
const ABOUT_SCALE = 1
const ABOUT_LINES = textBoxLines(LOWER_PANEL_WIDTH, ABOUT_TEXT, ABOUT_SCALE)

function ViewPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lowerPanelRef = useRef<HTMLCanvasElement>(null)
  const sidePanelRef = useRef<HTMLCanvasElement>(null)
  // Whether the mouse is over the character card in the side panel.
  const [overCard, setOverCard] = useState(false)
  const [pointer, setPointer] = useState<Pointer>({
    zone: 'forward',
    overSign: false,
    overMirror: false,
    overPull: false,
  })
  const [place, setPlace] = useState<PlaceName>('start')
  const [heading, setHeading] = useState<Heading>('north')
  // The navigation button under the mouse in the lower panel, if any.
  const [panelButton, setPanelButton] = useState<NavButton | null>(null)
  const [animating, setAnimating] = useState(false)
  // While the sign's text is open, the lower panel shows it in place of the
  // navigation panel, and a click anywhere in the pane moves it on.
  const [dialogue, setDialogue] = useState<Dialogue | null>(null)
  // While the profile view is open it covers the room and the lower panel
  // shows the About Me text. The ref is for callbacks set up on mount.
  const [profileOpen, setProfileOpen] = useState(false)
  const profileOpenRef = useRef(false)
  profileOpenRef.current = profileOpen
  // Whether the room canvas last showed the profile view.
  const drawnProfileRef = useRef(false)
  const avatarsRef = useRef<Avatars>({ card: null, profile: null })
  // Whether the open page has finished typing, and the text box's frame.
  const pageDoneRef = useRef(false)
  const textFrameRef = useRef<number | null>(null)
  // Which of MIRROR_SITES the mirror shows. The ref is for drawing mid-animation.
  const [site, setSite] = useState(0)
  const siteRef = useRef(0)
  // The drawn view. Yaw isn't wrapped, so each turn animates the short way round.
  const viewRef = useRef<View>({ x: PLACES.start.x, z: PLACES.start.z, yaw: 0 })
  const frameRef = useRef<number | null>(null)
  // Each site's picture for the mirror, once loaded.
  const previewsRef = useRef<(Preview | null)[]>(MIRROR_SITES.map(() => null))
  // The thing selected with Tab, if any. The ref is for drawing mid-animation
  // and holds the carets' bounce too.
  const [selected, setSelected] = useState<Interactable | null>(null)
  const selectionRef = useRef<Selection | null>(null)
  // The selection last drawn, and the carets' bounce frame.
  const drawnSelectionRef = useRef<Interactable | null>(null)
  const caretFrameRef = useRef<number | null>(null)
  const select = (target: Interactable | null) => {
    selectionRef.current = target && { target, inset: 0 }
    setSelected(target)
  }
  const currentLook = (): SiteLook => ({
    preview: previewsRef.current[siteRef.current],
    logo: MIRROR_SITES[siteRef.current].logo,
    selection: selectionRef.current,
  })

  // Draws the side panel: the card, with its carets while it's selected.
  const drawSide = () => {
    const ctx = sidePanelRef.current?.getContext('2d')
    const selection = selectionRef.current
    if (ctx) drawSidePanel(ctx, CARD_NAME, CARD_HEALTH, avatarsRef.current.card, selection?.target === 'card' ? selection.inset : null)
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawView(ctx, viewRef.current, currentLook())
    drawSide()
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // The navigation panel's compass follows the drawn yaw and its buttons the
  // current place and heading. Turns and moves redraw it every frame too.
  const drawPanel = (enabled: Record<NavButton, boolean>, press?: KeyPress) => {
    const ctx = lowerPanelRef.current?.getContext('2d')
    if (ctx) drawNavigationPanel(ctx, viewRef.current.yaw, enabled, press)
  }
  useEffect(() => {
    if (!dialogue && !profileOpen) drawPanel(enabledButtons(place, heading))
  }, [place, heading, dialogue, profileOpen])

  // Opening the profile view draws it over the room and puts the About Me
  // text, all at once, in the lower panel. Closing it brings the room back;
  // the effect above brings back the navigation panel.
  useEffect(() => {
    if (profileOpen === drawnProfileRef.current) return
    drawnProfileRef.current = profileOpen
    const ctx = canvasRef.current?.getContext('2d')
    if (!profileOpen) {
      if (ctx) drawView(ctx, viewRef.current, currentLook())
      return
    }
    if (ctx) drawProfile(ctx, PROFILE, avatarsRef.current.profile)
    const lowerCtx = lowerPanelRef.current?.getContext('2d')
    if (lowerCtx) drawTextBox(lowerCtx, ABOUT_LINES, ABOUT_LINES.join('').length, false, ABOUT_SCALE)
  }, [profileOpen])

  // Types the open page out a character at a time, then blinks the caret
  // until the page is moved on. A skipped page, or reduced motion, shows the
  // whole page at once; reduced motion keeps the caret on.
  useEffect(() => {
    if (!dialogue) return
    const ctx = lowerPanelRef.current?.getContext('2d')
    const lines = textBoxLines(LOWER_PANEL_WIDTH, SIGN_PAGES[dialogue.page])
    const length = lines.join('').length
    if (!ctx || prefersReducedMotion()) {
      pageDoneRef.current = true
      if (ctx) drawTextBox(ctx, lines, length, true)
      return
    }
    pageDoneRef.current = false
    const start = performance.now()
    const doneAt = dialogue.skipped ? 0 : Math.max(0, length - 1) * TYPING_MS_PER_CHAR
    let drawn = ''
    const step = (now: number) => {
      const elapsed = Math.max(0, now - start)
      const shown = dialogue.skipped ? length : Math.min(length, Math.floor(elapsed / TYPING_MS_PER_CHAR) + 1)
      pageDoneRef.current = shown === length
      const caretOn = shown === length && Math.floor((elapsed - doneAt) / CARET_BLINK_MS) % 2 === 0
      // Only redraw when a character or the caret changes.
      const state = `${shown},${caretOn}`
      if (state !== drawn) drawTextBox(ctx, lines, shown, caretOn)
      drawn = state
      textFrameRef.current = requestAnimationFrame(step)
    }
    step(start)
    return () => {
      if (textFrameRef.current !== null) cancelAnimationFrame(textFrameRef.current)
      textFrameRef.current = null
    }
  }, [dialogue])

  // Shows the carets around the selected thing, or clears them, and bounces
  // them every so often while it stays selected. Mid-animation the next frame
  // draws them instead. With reduced motion they stay still.
  // The card's carets are on the side panel, the rest on the room.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    const sideCtx = sidePanelRef.current?.getContext('2d')
    // Redraws wherever the carets of any of `targets` are, once each.
    const redraw = (...targets: (Interactable | null)[]) => {
      if (targets.includes('card')) drawSide()
      const inRoom = targets.some((target) => target !== null && target !== 'card')
      if (inRoom && ctx && frameRef.current === null && !profileOpenRef.current) {
        drawView(ctx, viewRef.current, currentLook())
      }
    }
    if (selected !== drawnSelectionRef.current) redraw(drawnSelectionRef.current, selected)
    drawnSelectionRef.current = selected
    if (!selected || prefersReducedMotion() || !(selected === 'card' ? sideCtx : ctx)) return
    const start = performance.now()
    const step = (now: number) => {
      const selection = selectionRef.current
      const inset = caretInset(Math.max(0, now - start))
      if (selection && inset !== selection.inset) {
        selectionRef.current = { ...selection, inset }
        redraw(selection.target)
      }
      caretFrameRef.current = requestAnimationFrame(step)
    }
    caretFrameRef.current = requestAnimationFrame(step)
    return () => {
      if (caretFrameRef.current !== null) cancelAnimationFrame(caretFrameRef.current)
      caretFrameRef.current = null
    }
  }, [selected])

  // A click while the sign's text is open finishes typing the page, or goes
  // on to the next page, or after the last one closes the text and brings
  // back the navigation panel.
  function advanceDialogue() {
    if (!dialogue) return
    if (!pageDoneRef.current) setDialogue({ ...dialogue, skipped: true })
    else if (dialogue.page + 1 < SIGN_PAGES.length) setDialogue({ page: dialogue.page + 1, skipped: false })
    else setDialogue(null)
  }

  // Without its picture a site shows empty glass.
  useEffect(() => {
    let cancelled = false
    MIRROR_SITES.forEach(({ preview: src }, index) => {
      loadPicture(src, PREVIEW_WIDTH, PREVIEW_HEIGHT, quantisePreview)
        .then((preview) => {
          if (cancelled || !preview) return
          previewsRef.current[index] = preview
          const ctx = canvasRef.current?.getContext('2d')
          // Mid-animation, the next frame picks it up; the profile view hides the room.
          if (ctx && index === siteRef.current && frameRef.current === null && !profileOpenRef.current) {
            drawView(ctx, viewRef.current, currentLook())
          }
        })
        .catch(() => {})
    })
    const avatarSizes = { card: AVATAR_CARD_SIZE, profile: AVATAR_PROFILE_SIZE }
    for (const key of ['card', 'profile'] as const) {
      loadPicture(avatarSrc, avatarSizes[key], avatarSizes[key], quantisePicture)
        .then((avatar) => {
          if (cancelled || !avatar) return
          avatarsRef.current[key] = avatar
          if (key === 'card') drawSide()
          const ctx = canvasRef.current?.getContext('2d')
          if (key === 'profile' && ctx && profileOpenRef.current) drawProfile(ctx, PROFILE, avatar)
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [])

  // Runs `frame` on each animation frame for `duration` ms with the elapsed
  // time, ending with a call at exactly `duration` and then `done`. Input waits
  // until it's finished.
  function runAnimation(
    ctx: CanvasRenderingContext2D,
    duration: number,
    frame: (elapsed: number) => View,
    done?: () => void,
    panel?: PanelPress,
  ) {
    setAnimating(true)
    const start = performance.now()
    const step = (now: number) => {
      const elapsed = Math.min(duration, now - start)
      viewRef.current = frame(elapsed)
      drawView(ctx, viewRef.current, currentLook())
      if (panel) {
        // The key stays usable-looking while it's held, even if it won't be
        // usable where the move ends; the last frame shows it as it will be.
        const enabled = elapsed < duration ? { ...panel.enabled, [panel.pressed]: true } : panel.enabled
        drawPanel(enabled, { button: panel.pressed, depth: keyPressAt(elapsed, duration) })
      }
      if (elapsed < duration) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        frameRef.current = null
        setAnimating(false)
        done?.()
      }
    }
    frameRef.current = requestAnimationFrame(step)
  }

  // Animates the drawn view to `to`, or jumps there with reduced motion or no
  // canvas. The navigation panel turns along with it, pressing `panel`'s key.
  function animateTo(to: View, duration: number, panel: PanelPress) {
    const from = viewRef.current
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || prefersReducedMotion()) {
      viewRef.current = to
      if (ctx) drawView(ctx, to, currentLook())
      return
    }
    runAnimation(
      ctx,
      duration,
      (elapsed) => {
        if (elapsed >= duration) return to
        const eased = easeInOut(elapsed / duration)
        return {
          x: from.x + (to.x - from.x) * eased,
          z: from.z + (to.z - from.z) * eased,
          yaw: from.yaw + (to.yaw - from.yaw) * eased,
        }
      },
      undefined,
      panel,
    )
  }

  // Turns a quarter turn in `direction`, as the room's edges and the panel's
  // turn buttons do. Either way the panel's key for it goes down.
  function turnView(direction: TurnDirection) {
    const next = turn(heading, direction)
    setHeading(next)
    // Whatever was selected in the room is out of view now; the card isn't.
    if (selected !== 'card') select(null)
    animateTo({ ...viewRef.current, yaw: viewRef.current.yaw + TURN_YAW[direction] }, TURN_DURATION_MS, {
      enabled: enabledButtons(place, next),
      pressed: direction,
    })
  }

  // Moves to `next` without turning, stepping forward or back as `key` says,
  // and presses that key on the panel.
  function moveTo(next: PlaceName, key: 'forward' | 'back') {
    setPlace(next)
    if (selected !== 'card') select(null)
    animateTo({ ...viewRef.current, x: PLACES[next].x, z: PLACES[next].z }, MOVE_DURATION_MS, {
      enabled: enabledButtons(next, heading),
      pressed: key,
    })
  }

  // Plays a ripple on the mirror from the canvas position (x, y), if it's on
  // the glass, then goes to the site it shows.
  function rippleAt(x: number, y: number) {
    const view = viewRef.current
    const origin = screenToMirror(x, y, VIEW_WIDTH, VIEW_HEIGHT, view.yaw, view)
    if (origin) rippleFrom(origin)
  }

  // Plays a ripple on the mirror from `origin` on the glass, then goes to the
  // site it shows. With reduced motion or no canvas it goes straight there.
  function rippleFrom(origin: MirrorPoint) {
    const view = viewRef.current
    const { url } = MIRROR_SITES[siteRef.current]
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || prefersReducedMotion()) {
      openUrl(url)
      return
    }
    const duration = rippleDuration(origin)
    runAnimation(
      ctx,
      duration,
      (elapsed) =>
        elapsed < duration ? { ...view, ripple: { origin, elapsedMs: elapsed } } : { ...view, ripple: undefined },
      () => openUrl(url),
    )
  }

  // Tugs the curtain pull, shimmers the mirror over to the next site and turns
  // the plaque to its logo. With reduced motion or no canvas the site just
  // changes.
  function switchSite() {
    const view = viewRef.current
    const from = currentLook()
    siteRef.current = (siteRef.current + 1) % MIRROR_SITES.length
    setSite(siteRef.current)
    const ctx = canvasRef.current?.getContext('2d')
    const to = currentLook()
    if (!ctx || prefersReducedMotion()) {
      if (ctx) drawView(ctx, view, to)
      return
    }
    runAnimation(ctx, SWITCH_DURATION_MS, (elapsed) => {
      if (elapsed >= SWITCH_DURATION_MS) return { ...view, shimmer: undefined, pullDrop: undefined, plaque: undefined }
      const progress = Math.max(0, (elapsed - PULL_DOWN_MS) / (SWITCH_DURATION_MS - PULL_DOWN_MS))
      return {
        ...view,
        pullDrop: pullDropAt(elapsed),
        shimmer: { from: from.preview, progress },
        plaque: plaqueAt(elapsed, from.logo, to.logo),
      }
    })
  }

  // Uses `target`, as a click on it or Enter or Space with it selected does.
  // From the keyboard the mirror ripples from the middle of its glass. The
  // card opens the profile view, or closes it if it's open.
  function interact(target: Interactable) {
    if (target === 'sign') setDialogue({ page: 0, skipped: false })
    else if (target === 'mirror') rippleFrom(GLASS_CENTRE)
    else if (target === 'pull') switchSite()
    else {
      // Opening it selects the card, however it was opened, so its carets show
      // what the view belongs to. Whatever was selected in the room is covered.
      if (!profileOpen && selected !== 'card') select('card')
      setProfileOpen(!profileOpen)
    }
  }

  // Tab and Shift+Tab step through what can be used in the view, forward or
  // back. Past either end the selection clears and the key is left to the
  // browser, so focus can move on rather than being trapped in the pane.
  // Returns whether the key was used.
  function stepSelection(backward: boolean): boolean {
    const list = interactablesIn(place, heading, profileOpen)
    const index = selected ? list.indexOf(selected) : backward ? list.length : -1
    const next = list[index + (backward ? -1 : 1)] ?? null
    select(next)
    return next !== null
  }

  // The first thing in the room that can be used from the current view, if
  // any: what Enter or Space uses with nothing selected.
  function firstInRoom(): Interactable | null {
    return interactablesIn(place, heading, profileOpen).find((target) => target !== 'card') ?? null
  }

  // Mouse position in the canvas's drawing pixels, from fractions of its
  // on-screen size so hit areas scale with the pane.
  function canvasPointAt(event: MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function pointerAt(event: MouseEvent<HTMLCanvasElement>): Pointer | null {
    const point = canvasPointAt(event)
    if (!point) return null
    const { x, y } = point
    return {
      zone: getCursorZone(x / VIEW_WIDTH, y / VIEW_HEIGHT, VIEW_WIDTH / VIEW_HEIGHT),
      overSign: isInside(SIGN_BOUNDS, x, y),
      overMirror: isOverGlass(x, y),
      overPull: isOverPull(x, y),
    }
  }

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    const next = pointerAt(event)
    // Only re-render when the cursor would change.
    if (
      next &&
      (next.zone !== pointer.zone ||
        next.overSign !== pointer.overSign ||
        next.overMirror !== pointer.overMirror ||
        next.overPull !== pointer.overPull)
    )
      setPointer(next)
  }

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    const point = canvasPointAt(event)
    const at = pointerAt(event)
    // While the sign's text is open the click is for it, handled by the frame.
    // The profile view covers the room, so it takes no clicks.
    if (!point || !at || animating || dialogue || profileOpen) return
    if (at.overSign && isSignView) {
      interact('sign')
      return
    }
    if (at.overMirror && isMirrorView) {
      rippleAt(point.x, point.y)
      return
    }
    if (at.overPull && isMirrorView) {
      interact('pull')
      return
    }
    const direction = TURNS[at.zone]
    if (direction) {
      turnView(direction)
      return
    }
    // Does nothing when there's no way back, like the dimmed down button.
    if (at.zone === 'back') {
      pressNavButton('back')
      return
    }
    const next = forwardFrom(place, heading)
    // A click on the sign, mirror or pull is for it, even if there's a way forward behind it.
    if (!next || showHand) return
    moveTo(next, 'forward')
  }

  function panelButtonAt(event: MouseEvent<HTMLCanvasElement>): NavButton | null {
    const point = canvasPointAt(event)
    return point && navButtonAt(point.x, point.y)
  }

  function handlePanelMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    const next = panelButtonAt(event)
    if (next !== panelButton) setPanelButton(next)
  }

  // The panel's buttons do what clicking the room does: turn left or right,
  // or step forward, plus stepping back without turning. Clicks and the arrow
  // keys both work them.
  function pressNavButton(button: NavButton) {
    if (animating || dialogue || profileOpen || !enabledButtons(place, heading)[button]) return
    if (button === 'left' || button === 'right') {
      turnView(button)
      return
    }
    const next = button === 'forward' ? forwardFrom(place, heading) : backFrom(place, heading)
    if (next) moveTo(next, button)
  }

  function handlePanelClick(event: MouseEvent<HTMLCanvasElement>) {
    if (dialogue || profileOpen) return
    const button = panelButtonAt(event)
    if (button) pressNavButton(button)
  }

  function handleSideMouseMove(event: MouseEvent<HTMLCanvasElement>) {
    const point = canvasPointAt(event)
    const next = point !== null && isInside(CARD_BOUNDS, point.x, point.y)
    if (next !== overCard) setOverCard(next)
  }

  // A click on the card opens or closes the profile view. While the sign's
  // text is open the click is for it, handled by the frame.
  function handleSideClick(event: MouseEvent<HTMLCanvasElement>) {
    const point = canvasPointAt(event)
    if (!point || animating || dialogue || !isInside(CARD_BOUNDS, point.x, point.y)) return
    if (profileOpen) closeProfile()
    else interact('card')
  }

  // Closes the profile view and clears the selection, as a click on the card
  // or Escape does. Enter or Space on the card closes it through `interact`
  // instead, keeping the card selected so the next press opens it again.
  function closeProfile() {
    setProfileOpen(false)
    select(null)
  }

  // Keys work anywhere on the page, unless they're for a text field or part
  // of a shortcut:
  // - Enter and Space move the sign's text on while it's open.
  // - Otherwise Tab and Shift+Tab select what can be used in the view, Escape
  //   closes the profile view or else clears the selection, and Enter and
  //   Space use the selected thing, or else the first thing in the room ahead.
  // - The arrow keys work the navigation buttons.
  // Held arrow keys repeat, so a held key keeps turning or stepping as each
  // animation ends; a held Enter or Space acts only once. It subscribes again
  // on every render so the handler sees the current place, heading, text and
  // selection.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return
      if (dialogue && TEXT_KEYS.includes(event.key)) {
        // Space would otherwise scroll the page.
        event.preventDefault()
        if (!event.repeat) advanceDialogue()
        return
      }
      if (!dialogue && event.key === 'Tab') {
        // Mid-animation the view isn't settled, so the key waits, but still
        // doesn't move focus out of the pane.
        if (animating) {
          event.preventDefault()
          return
        }
        if (stepSelection(event.shiftKey)) event.preventDefault()
        return
      }
      if (profileOpen && event.key === 'Escape') {
        closeProfile()
        return
      }
      if (selected && event.key === 'Escape') {
        select(null)
        return
      }
      if (TEXT_KEYS.includes(event.key)) {
        // With nothing selected the first thing in the room ahead is selected
        // and used. The card isn't in the room, so a view with nothing else
        // leaves the key alone.
        const target = selected ?? firstInRoom()
        if (!target) return
        event.preventDefault()
        if (event.repeat || animating) return
        if (!selected) select(target)
        // The text this opens for the sign is moved on by the next press.
        interact(target)
        return
      }
      const button = MOVE_KEYS[event.key]
      if (!button) return
      // Arrow keys would otherwise scroll the page, and letters type into it.
      event.preventDefault()
      pressNavButton(button)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  // A name for `target`, for screen readers.
  const interactableLabels: Record<Interactable, string> = {
    sign: 'Welcome sign',
    mirror: `Mirror: ${MIRROR_SITES[site].name}`,
    pull: 'Curtain pull',
    card: `Character card: ${CARD_NAME}`,
  }

  // The sign, mirror and pull are only clickable from where they were designed to be seen.
  const isMirrorView = place === 'nook' && heading === 'west'
  const isSignView = place === 'sign' && heading === 'north'
  const showHand =
    !animating &&
    !profileOpen &&
    ((pointer.overSign && isSignView) ||
      ((pointer.overMirror || pointer.overPull) && isMirrorView))
  const canMoveForward = forwardFrom(place, heading) !== null
  const canMoveBack = backFrom(place, heading) !== null
  // While the sign's text is open, a click anywhere in the pane moves it on.
  // The profile view takes no clicks, so it shows the blocked hand.
  const cursor =
    dialogue || showHand
      ? HAND_CURSOR
      : profileOpen || (pointer.zone === 'forward' && !canMoveForward) || (pointer.zone === 'back' && !canMoveBack)
        ? BLOCKED_CURSOR
        : CURSORS[pointer.zone]
  // Every panel shows the blocked hand unless something under it can be used,
  // or the sign's text is open.
  const panelCursor =
    dialogue || (panelButton !== null && !animating && !profileOpen && enabledButtons(place, heading)[panelButton])
      ? HAND_CURSOR
      : BLOCKED_CURSOR
  // The side panel inherits the frame's cursor, except over the card while it can be used.
  const sideCursor = overCard && !animating && !dialogue ? HAND_CURSOR : undefined
  return (
    // The frame, dividers and side panel inherit the blocked hand, or the
    // pointing hand while the sign's text is open; the room and lower panel
    // set their own cursors. Clicks anywhere in the pane bubble up here to
    // move the sign's text on. The click that opens it does too, but this
    // handler is from the render before it opened, so it doesn't count.
    <div
      className="view-pane-frame"
      style={{ cursor: dialogue ? HAND_CURSOR : BLOCKED_CURSOR }}
      onClick={advanceDialogue}
    >
      <canvas
        ref={canvasRef}
        className="view-pane"
        width={VIEW_WIDTH}
        height={VIEW_HEIGHT}
        role="img"
        aria-label="Dungeon view"
        data-place={place}
        data-heading={heading}
        data-site={MIRROR_SITES[site].name}
        data-view={profileOpen ? 'profile' : 'room'}
        style={{ cursor }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
      <div className="view-pane-divider view-pane-divider--horizontal" />
      <canvas
        ref={lowerPanelRef}
        className="view-pane-lower"
        width={LOWER_PANEL_WIDTH}
        height={LOWER_PANEL_HEIGHT}
        aria-hidden="true"
        style={{ cursor: panelCursor }}
        onMouseMove={handlePanelMouseMove}
        onMouseLeave={() => setPanelButton(null)}
        onClick={handlePanelClick}
      />
      <div className="view-pane-divider view-pane-divider--vertical" />
      <canvas
        ref={sidePanelRef}
        className="view-pane-side"
        width={SIDE_PANEL_WIDTH}
        height={SIDE_PANEL_HEIGHT}
        aria-hidden="true"
        style={{ cursor: sideCursor }}
        onMouseMove={handleSideMouseMove}
        onMouseLeave={() => setOverCard(false)}
        onClick={handleSideClick}
      />
      {/* The panels are hidden from assistive tech, so the sign's and About Me text are read from here. */}
      <p className="view-pane-status" role="status">
        {dialogue
          ? SIGN_PAGES[dialogue.page]
          : profileOpen
            ? PROFILE_DESCRIPTION
            : selected
              ? interactableLabels[selected]
              : ''}
      </p>
    </div>
  )
}

export default ViewPane
