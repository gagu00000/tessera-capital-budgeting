/**
 * Captures the report screenshots from the running application.
 *
 * Driven by Playwright rather than taken by hand so that every figure in the
 * written report is reproducible: same viewport, same device pixel ratio, same
 * scroll position, same model state. Re-running this script after a change
 * regenerates every figure consistently.
 *
 *   npm run dev                 (in one terminal)
 *   npx vite-node scripts/screenshots.ts
 */

import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.TESSERA_URL ?? 'http://localhost:5173';
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../screenshots');

const VIEWPORT = { width: 1600, height: 1000 };
const SCALE = 2; // retina, so figures stay sharp when scaled into the report

interface Shot {
  file: string;
  caption: string;
  /** Section id to capture. Omit for a full-page capture. */
  section?: string;
  /** Runs before capture — used to put the app into the right state. */
  setup?: (page: Page) => Promise<void>;
  /**
   * The navigation bar is fixed, so it composites over the top of whichever
   * section is being captured. It is hidden for section captures and kept for
   * the landing view, where it is part of what is being shown.
   */
  keepNav?: boolean;
}

const HIDE_NAV_CSS = 'nav { visibility: hidden !important; }';

async function selectAlternative(page: Page, match: string) {
  await page.getByRole('button', { name: new RegExp(match, 'i') }).first().click();
  await page.waitForTimeout(500);
}

const SHOTS: Shot[] = [
  {
    file: 'fig01_hero_cold_boot.png',
    caption: 'Application landing view with live model readout',
    section: 'cold-boot',
    keepNav: true,
  },
  {
    file: 'fig02_decision_briefing.png',
    caption: 'Investment decision and the four alternatives under appraisal',
    section: 'decision',
  },
  {
    file: 'fig03_assumption_console.png',
    caption: 'Assumption console — all required inputs, with derived WACC',
    section: 'assumptions',
  },
  {
    file: 'fig04_cashflow_ledger.png',
    caption: 'Initial, annual operating and terminal cash flows',
    section: 'ledger',
  },
  {
    file: 'fig05_metrics_grid.png',
    caption: 'Decision metrics for Alternative A, with runtime verification',
    section: 'metrics',
  },
  {
    file: 'fig06_metrics_hybrid.png',
    caption: 'Decision metrics for Alternative C, the hybrid option',
    section: 'metrics',
    setup: (page) => selectAlternative(page, 'Hybrid'),
  },
  {
    file: 'fig07_ratio_metrics_suppressed.png',
    caption:
      'Alternative B — ratio metrics suppressed because the option employs almost no capital',
    section: 'metrics',
    setup: (page) => selectAlternative(page, 'Rent 3-yr'),
  },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  // Let fonts settle and the entrance animations finish before capturing.
  await page.waitForTimeout(2500);

  for (const shot of SHOTS) {
    if (shot.setup) await shot.setup(page);

    const path = resolve(OUT_DIR, shot.file);

    if (shot.section) {
      await page.locator(`#${shot.section}`).scrollIntoViewIfNeeded();
      // Give the whileInView animations time to play out.
      await page.waitForTimeout(1200);

      const style = shot.keepNav ? null : await page.addStyleTag({ content: HIDE_NAV_CSS });
      await page.locator(`#${shot.section}`).screenshot({ path });
      if (style) await style.evaluate((el) => el.remove());
    } else {
      await page.screenshot({ path, fullPage: true });
    }
    console.log(`  ${shot.file.padEnd(38)} ${shot.caption}`);
  }

  await browser.close();
  console.log(`\n${SHOTS.length} figures written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
