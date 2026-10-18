import { drawPixels } from '../draw.ts'
import { clearPanel } from '../panels/panelCanvas.ts'
import { compassPixels } from './compass.ts'
import { navButtonPixels } from './navButtons.ts'
import type { NavButton } from './navButtons.ts'

// Draws the navigation panel: the compass turned to `yaw` and the direction
// buttons, dimming those in `enabled` that are false.
export function drawNavigationPanel(ctx: CanvasRenderingContext2D, yaw: number, enabled: Record<NavButton, boolean>) {
  clearPanel(ctx)
  drawPixels(ctx, compassPixels(yaw))
  drawPixels(ctx, navButtonPixels(enabled))
}
