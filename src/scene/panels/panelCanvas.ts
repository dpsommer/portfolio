import { BACKGROUND, FOREGROUND, FOREGROUND_DIM, FOREGROUND_WORN } from '../core/palette.ts'

// Logic shared by the display panels beside the room: the navigation panel
// below it and the side panel to its right.

// Clears a panel's canvas to the background.
export function clearPanel(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, width, height)
}

// Weathers a panel pixel's `colour` the way the sign is: a few pixels drop out
// (null) and some fade a tone. `roll` is the pixel's own random number, from
// something that doesn't change between frames, so the wear doesn't shimmer.
export function weather(colour: string, roll: number, dropChance: number, fadeChance: number): string | null {
  if (roll < dropChance) return null
  if (roll < dropChance + fadeChance) return colour === FOREGROUND ? FOREGROUND_WORN : FOREGROUND_DIM
  return colour
}
