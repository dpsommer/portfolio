export type Pixel = {
  x: number
  y: number
  colour: string
}

// A rectangle in canvas pixels, edges inclusive.
export type Bounds = { left: number; top: number; right: number; bottom: number }
