import type { LogoMap } from '../scene/mirror/plaque.ts'

// Pixel versions of each site's logo, for the plaque below the curtain pull.
// The map format is described in `src/scene/mirror/plaque.ts`.

// The Octocat mark, inverted as on GitHub's dark theme: a light disc with the
// cat cut out of it.
export const GITHUB_LOGO: LogoMap = [
  '.....######.....',
  '...##########...',
  '..############..',
  '.###.######.###.',
  '.###..####..###.',
  '###..........###',
  '###..........###',
  '###..........###',
  '###..........###',
  '####........####',
  '##.##......#####',
  '.#.###....#####.',
  '.##........####.',
  '..###......###..',
  '...##......##...',
  '.....#....#.....',
]

// LinkedIn's rounded square with "in" cut out of it.
export const LINKEDIN_LOGO: LogoMap = [
  '.##############.',
  '################',
  '################',
  '##..############',
  '##..############',
  '################',
  '##..##..#...####',
  '##..##.......###',
  '##..##..###..###',
  '##..##..###..###',
  '##..##..###..###',
  '##..##..###..###',
  '##..##..###..###',
  '##..##..###..###',
  '################',
  '.##############.',
]
