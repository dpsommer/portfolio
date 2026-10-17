import { describe, expect, it } from 'vitest'
import { LOGO_SIZE, parseLogo } from '../scene/mirror/plaque.ts'
import { MIRROR_SITES } from './mirrorSites.ts'
import { GITHUB_LOGO, LINKEDIN_LOGO } from './siteLogos.ts'

const LOGOS = [
  ['GitHub', GITHUB_LOGO],
  ['LinkedIn', LINKEDIN_LOGO],
] as const

describe.each(LOGOS)('the %s logo', (_, logo) => {
  it('has 16 rows of 16 cells', () => {
    expect(logo).toHaveLength(LOGO_SIZE)
    for (const row of logo) expect(row).toHaveLength(LOGO_SIZE)
  })

  it('uses only the logo map characters', () => {
    for (const row of logo) expect(row).toMatch(/^[#+\-.]+$/)
  })

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
