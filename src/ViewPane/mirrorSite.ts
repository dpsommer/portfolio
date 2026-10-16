import githubPreview from '../assets/github-preview.png'

// The profile the mirror shows and links to. The preview is a screenshot of the
// page (captured with `npm run capture:preview`), drawn on the glass.
export const MIRROR_SITE = {
  name: 'GitHub',
  url: 'https://github.com/dpsommer/',
  preview: githubPreview,
}

// Sends the browser to `url` in the same tab. Its own function so tests can mock it.
export function openUrl(url: string) {
  window.location.assign(url)
}
