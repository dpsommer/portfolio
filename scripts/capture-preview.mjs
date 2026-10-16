// Captures the GitHub profile page shown in the mirror. Browsers can't draw a
// cross-origin page into a canvas, so the preview is a committed screenshot,
// quantised to the scene's palette at runtime. Run with `npm run capture:preview`.
import { chromium } from 'playwright'

const URL = 'https://github.com/dpsommer/'
const OUTPUT = 'src/assets/github-preview.png'
// A phone-width portrait viewport puts the profile in one column, like the glass.
const WIDTH = 390
// The glass's width / height (0.66 / 0.96 mirror units).
const GLASS_ASPECT = 0.66 / 0.96

const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: Math.round(WIDTH / GLASS_ASPECT) },
    colorScheme: 'dark',
    deviceScaleFactor: 2,
  })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.screenshot({ path: OUTPUT })
  console.log(`Saved ${OUTPUT}`)
} finally {
  await browser.close()
}
