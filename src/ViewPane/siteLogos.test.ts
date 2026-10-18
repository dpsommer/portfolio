import { describe, expect, it } from 'vitest'
import { LOGO_SIZE, parseLogo } from '../scene/mirror/plaque.ts'
import { MIRROR_SITES } from './mirrorSites.ts'
import { GITHUB_LOGO, LINKEDIN_LOGO } from './siteLogos.ts'

const LOGOS = [
  ['GitHub', GITHUB_LOGO],
  ['LinkedIn', LINKEDIN_LOGO],
] as const

describe.each(LOGOS)('the %s logo', (_, logo) => {
  // parseLogo throws for a map that isn't 16x16 or has an unknown character.
  it('parses without throwing', () => {
    expect(() => parseLogo(logo)).not.toThrow()
  })

  it('has some cells filled and some empty', () => {
    const filled = parseLogo(logo).length
    expect(filled).toBeGreaterThan(0)
    expect(filled).toBeLessThan(LOGO_SIZE * LOGO_SIZE)
  })
})

describe('site logos', () => {
  it('differ between the sites', () => {
    expect(GITHUB_LOGO).not.toEqual(LINKEDIN_LOGO)
  })

  it('belong to the matching mirror sites', () => {
    expect(MIRROR_SITES.map(({ name, logo }) => [name, logo])).toEqual(LOGOS)
  })
})
