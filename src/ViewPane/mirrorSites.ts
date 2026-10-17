import githubPreview from '../assets/github-preview.png'
import linkedinPreview from '../assets/linkedin-preview.png'
import { GITHUB_LOGO, LINKEDIN_LOGO } from './siteLogos.ts'

// The profiles the mirror shows and links to, in the order the curtain pull
// steps through them. Each preview is a screenshot of the page (captured with
// `npm run capture:preview`, whose page list should match), drawn on the glass.
// Each logo shows on the plaque below the pull.
export const MIRROR_SITES = [
  { name: 'GitHub', url: 'https://github.com/dpsommer/', preview: githubPreview, logo: GITHUB_LOGO },
  {
    name: 'LinkedIn',
    url: 'https://ca.linkedin.com/in/duncan-sommerville-a0086b65',
    preview: linkedinPreview,
    logo: LINKEDIN_LOGO,
  },
]

// Sends the browser to `url` in the same tab. Its own function so tests can mock it.
export function openUrl(url: string) {
  window.location.assign(url)
}
