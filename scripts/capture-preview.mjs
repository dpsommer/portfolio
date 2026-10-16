// Captures the profile pages shown in the mirror. Browsers can't draw a
// cross-origin page into a canvas, so each preview is a committed screenshot,
// quantised to the scene's palette at runtime. Run with `npm run capture:preview`.
import { chromium } from 'playwright'

// Keep in step with MIRROR_SITES in src/ViewPane/mirrorSites.ts. Pages without
// a dark mode are inverted so they match the dark scene.
const PAGES = [
  { url: 'https://github.com/dpsommer/', output: 'src/assets/github-preview.png', invert: false },
  {
    url: 'https://ca.linkedin.com/in/duncan-sommerville-a0086b65',
    output: 'src/assets/linkedin-preview.png',
    invert: true,
  },
]
// A phone-width portrait viewport puts a profile in one column, like the glass.
const WIDTH = 390
// The glass's width / height (0.66 / 0.96 mirror units).
const GLASS_ASPECT = 0.66 / 0.96
// Inverts the page's colours, then inverts pictures back so photos look normal.
// The root fills the viewport so space below a short page is inverted too.
const INVERT_CSS = `
  html { filter: invert(1) hue-rotate(180deg); min-height: 100vh; background: #fff; }
  img, video, svg image, [style*="background-image"] { filter: invert(1) hue-rotate(180deg); }
`

// Closes a sign-in prompt covering the page, if there is one.
async function dismissModal(page) {
  const dismiss = page.locator('.modal__dismiss, [data-tracking-control-name*="dismiss"]').first()
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click()
  else await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

const browser = await chromium.launch()
try {
  for (const { url, output, invert } of PAGES) {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: Math.round(WIDTH / GLASS_ASPECT) },
      colorScheme: 'dark',
      deviceScaleFactor: 2,
    })
    await page.goto(url, { waitUntil: 'networkidle' })
    await dismissModal(page)
    if (invert) await page.addStyleTag({ content: INVERT_CSS })
    await page.screenshot({ path: output })
    console.log(`Saved ${output}`)
    await page.close()
  }
} finally {
  await browser.close()
}
