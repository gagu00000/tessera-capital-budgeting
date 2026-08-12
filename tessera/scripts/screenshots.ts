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

/**
 * The application sets `scroll-behavior: smooth` on `html`, which is right for
 * a person clicking the nav and wrong for automation: every
 * `scrollIntoViewIfNeeded` becomes an animated scroll, so the target element is
 * still genuinely moving when Playwright applies its "element is stable"
 * precondition. On the short sections that resolves eventually; on the tall
 * ones the scroll animation outlasts the timeout and the capture hangs
 * outright. Forcing instant scrolling for the capture run removes the race —
 * it affects how the harness navigates, not how any figure looks.
 */
const INSTANT_SCROLL_CSS = 'html { scroll-behavior: auto !important; }';

/** Ceiling on how far the viewport may be grown to fit a target (CSS px). */
const MAX_CAPTURE_HEIGHT = 3000;

/**
 * Scrolling and ordinary clicking are driven through in-page JavaScript rather
 * than through Playwright's `locator` actions.
 *
 * Playwright guards every action with an actionability check that waits for the
 * target's bounding box to stop moving. On a long page whose sections animate
 * as they enter the viewport, that check is a poor fit: scrolling to a section
 * re-triggers entrance animations elsewhere, so an action a few thousand pixels
 * away can spend tens of seconds waiting, or time out entirely, for reasons
 * that have nothing to do with whether the click will land. The application
 * itself is not slow — the same state change measured in-page completes in
 * under 3 ms.
 *
 * The die in the hero is the exception: three.js picks objects by raycasting
 * real pointer events, so those clicks stay on `page.mouse`.
 */
async function scrollToSection(page: Page, selector: string) {
  await page.evaluate((sel) => {
    document.querySelector(sel)!.scrollIntoView({ block: 'start', behavior: 'instant' });
    window.scrollBy(0, -24); // a little headroom above the section
  }, selector);
}

/** Clicks `css` if it is present. Returns whether anything was clicked. */
async function clickSelector(page: Page, css: string, required = true) {
  const clicked = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.click();
    return el !== null;
  }, css);
  if (required && !clicked) throw new Error(`no element matching ${css}`);
  return clicked;
}

async function clickByText(page: Page, pattern: string, exact = false) {
  await page.evaluate(
    ({ pattern, exact }) => {
      const re = new RegExp(exact ? `^\\s*${pattern}\\s*$` : pattern, 'i');
      const button = [...document.querySelectorAll('button')].find((b) =>
        re.test(b.textContent ?? ''),
      );
      if (!button) throw new Error(`no button matching ${pattern}`);
      button.click();
    },
    { pattern, exact },
  );
}

/**
 * Captures one element, growing the viewport first if the target is taller than
 * the window so that the whole element is on screen. The capture itself is a
 * page screenshot with an explicit clip rather than an element screenshot,
 * which keeps it out of the actionability path described above.
 */
async function capture(page: Page, selector: string, path: string, keepNav: boolean) {
  await scrollToSection(page, selector);
  await page.waitForTimeout(1200); // let the whileInView animations play out

  const height = await page.evaluate(
    (sel) => document.querySelector(sel)!.getBoundingClientRect().height,
    selector,
  );
  const grow = height > VIEWPORT.height;
  if (grow) {
    await page.setViewportSize({
      width: VIEWPORT.width,
      height: Math.min(Math.ceil(height) + 80, MAX_CAPTURE_HEIGHT),
    });
    await scrollToSection(page, selector);
    await page.waitForTimeout(1200); // settle the relayout the resize caused
  }

  const style = keepNav ? null : await page.addStyleTag({ content: HIDE_NAV_CSS });
  // A viewport screenshot's clip is measured from the top-left of the viewport,
  // not of the document, so these stay as `getBoundingClientRect` reports them.
  // Intersecting with the viewport keeps the clip inside the captured image: a
  // section taller than MAX_CAPTURE_HEIGHT yields as much as fits rather than
  // an error.
  const clip = await page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect();
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    const right = Math.min(window.innerWidth, r.right);
    const bottom = Math.min(window.innerHeight, r.bottom);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }, selector);
  await page.screenshot({ path, clip, animations: 'disabled' });
  if (style) await style.evaluate((el) => el.remove());

  if (grow) {
    await page.setViewportSize(VIEWPORT);
    await page.waitForTimeout(600);
  }
}

async function selectAlternative(page: Page, match: string) {
  await clickByText(page, match);
  await page.waitForTimeout(500);
}


/**
 * Clicks around the die until a GPU matching `wantIdle` is selected. Tile
 * positions depend on the live camera, so a fixed coordinate cannot be relied
 * on — sweeping until the inspector reports the right kind of unit can.
 */
async function selectGpu(page: Page, wantIdle: boolean) {
  const box = (await page.locator('#cold-boot canvas').boundingBox())!;
  /**
   * Bounds of the cluster within the canvas, as fractions. They reach well down
   * the canvas on purpose: the idle modules are the last five of the thirty-two,
   * so they sit in the near row at the bottom of the frame, and a sweep that
   * stopped higher up could only ever find sold ones.
   */
  for (let iy = 0; iy < 8; iy++) {
    for (let ix = 0; ix < 12; ix++) {
      await page.mouse.click(box.x + box.width * (0.25 + ix * 0.05), box.y + box.height * (0.24 + iy * 0.095));
      await page.waitForTimeout(120);
      /**
       * Read in one evaluate rather than as separate locator calls. Clicking an
       * already-selected tile toggles the inspector shut, and while it plays its
       * exit animation the `<aside>` is still in the DOM with its contents
       * unmounted — so a `count()` that sees a panel followed by a query for the
       * status text inside it can wait forever for a span that will never arrive.
       */
      const status = await page.evaluate(
        () => document.querySelector('aside')?.querySelector('span')?.textContent ?? null,
      );
      if (status !== null) {
        if (status.trim().startsWith('Idle') === wantIdle) {
          // The idle orbit will have drifted the camera while we were hunting;
          // return it to the default view so the figure composes consistently.
          await clickSelector(page, 'button[aria-label="Reset view"]');
          await page.waitForTimeout(600);
          return;
        }
        // Best-effort: the panel may already be mid-exit, taking its button with it.
        await clickSelector(page, 'aside button[aria-label="Close inspector"]', false);
        await page.waitForTimeout(80);
      }
    }
  }
  throw new Error(`could not select a ${wantIdle ? 'idle' : 'sold'} GPU`);
}


/**
 * Puts the cluster back to its default framing and holds it there.
 *
 * The idle orbit means the hero sits at a different angle every second, so a
 * capture taken whenever the script happened to get there was neither well
 * composed nor reproducible — which is the whole point of driving these by
 * script. The orbit stops for good once the viewer takes control, so a token
 * drag ends it; the reset that follows restores the exact default camera.
 *
 * The drag is deliberately placed to the right of the cluster, on empty
 * substrate, so it cannot land on a module and select one.
 */
async function restView(page: Page) {
  const box = (await page.locator('#cold-boot canvas').boundingBox())!;
  const x = box.x + box.width * 0.93;
  const y = box.y + box.height * 0.5;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 4, y, { steps: 2 });
  await page.mouse.up();

  await clickSelector(page, 'button[aria-label="Reset view"]');
  await page.waitForTimeout(900); // let the orbit damping settle onto HOME
}

/** Runs all three structured advisory surfaces plus the explainer. */
async function runAdvisory(page: Page) {
  await scrollToSection(page, '#advisory');
  await page.waitForTimeout(400);
  for (const label of [
    'Ask Claude for a recommendation',
    'Ask Claude to build the risk register',
    'Ask Claude to compare the alternatives',
  ]) {
    await clickByText(page, label);
    await page.waitForTimeout(600);
  }
  await clickByText(page, 'Net Present Value', true);
  await page.waitForTimeout(900);
}

const SHOTS: Shot[] = [
  {
    file: 'fig01_hero_cold_boot.png',
    caption: 'Landing view — interactive GPU cluster with live model readout',
    section: 'cold-boot',
    setup: restView,
    keepNav: true,
  },
  {
    file: 'fig02_gpu_inspector_idle.png',
    caption: 'Clicking an idle GPU: full capital and fixed-cost share against zero revenue',
    section: 'cold-boot',
    setup: (page) => selectGpu(page, true),
  },
  {
    file: 'fig03_decision_briefing.png',
    caption: 'Investment decision and the four alternatives under appraisal',
    section: 'decision',
  },
  {
    file: 'fig04_assumption_console.png',
    caption: 'Assumption console — all required inputs, with derived WACC',
    section: 'assumptions',
  },
  {
    file: 'fig05_cashflow_ledger.png',
    caption: 'Initial, annual operating and terminal cash flows',
    section: 'ledger',
  },
  {
    file: 'fig06_metrics_grid.png',
    caption: 'Decision metrics for Alternative A, with runtime verification',
    section: 'metrics',
  },
  {
    file: 'fig07_breakeven.png',
    caption: 'Break-even analysis — cash, accounting and NPV thresholds',
    section: 'breakeven',
  },
  {
    file: 'fig08_sensitivity_tornado.png',
    caption: 'Tornado chart with switching values, and the two-way grid',
    section: 'sensitivity',
  },
  {
    file: 'fig09_scenario_triptych.png',
    caption: 'Best, base and worst case, with the outcome range',
    section: 'scenarios',
  },
  {
    file: 'fig10_ai_verdict_vs_rules.png',
    caption: 'Claude vs the deterministic rule-based verdict, side by side',
    section: 'advisory-verdict',
    setup: runAdvisory,
  },
  {
    file: 'fig11_ai_comparison_explainer.png',
    caption: 'Claude comparing the alternatives, and the on-demand metric explainer',
    section: 'advisory-analysis',
  },
  {
    file: 'fig12_metrics_hybrid.png',
    caption: 'Decision metrics for Alternative C, the hybrid option',
    section: 'metrics',
    setup: (page) => selectAlternative(page, 'Hybrid'),
  },
  {
    file: 'fig13_ratio_metrics_suppressed.png',
    caption: 'Alternative B — ratio metrics suppressed because the option employs almost no capital',
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
  await page.addStyleTag({ content: INSTANT_SCROLL_CSS });
  // Let fonts settle and the entrance animations finish before capturing.
  await page.waitForTimeout(2500);

  for (const shot of SHOTS) {
    if (shot.setup) await shot.setup(page);

    const path = resolve(OUT_DIR, shot.file);

    if (shot.section) {
      await capture(page, `#${shot.section}`, path, shot.keepNav ?? false);
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
