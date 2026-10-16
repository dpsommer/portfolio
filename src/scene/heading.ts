// The four directions the visitor can face, in left-turn order.
export const HEADINGS = ['north', 'west', 'south', 'east'] as const

export type Heading = (typeof HEADINGS)[number]
export type TurnDirection = 'left' | 'right'

// Camera yaw (radians, anticlockwise) for a quarter turn in each direction.
export const TURN_YAW: Record<TurnDirection, number> = { left: Math.PI / 2, right: -Math.PI / 2 }

export function turn(heading: Heading, direction: TurnDirection): Heading {
  const step = direction === 'left' ? 1 : HEADINGS.length - 1
  return HEADINGS[(HEADINGS.indexOf(heading) + step) % HEADINGS.length]
}
