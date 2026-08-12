/** Drives the die's interactions the way a user would, and reports what happened. */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const canvas = page.locator('#cold-boot canvas');
const box = (await canvas.boundingBox())!;
console.log(`canvas ${Math.round(box.width)}x${Math.round(box.height)} at y=${Math.round(box.y)}`);

// Sweep a grid of points over the die and record which open an inspector.
const results: string[] = [];
const points: [number, number][] = [];
for (let iy = 0; iy < 6; iy++) for (let ix = 0; ix < 8; ix++) points.push([0.20 + ix * 0.085, 0.20 + iy * 0.11]);
let hits = 0;
for (const [fx, fy] of points) {
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(400);
  const aside = page.locator('aside');
  if (await aside.count()) {
    const title = (await aside.locator('h3').innerText()).trim();
    const status = (await aside.locator('span').first().innerText()).trim();
    const rev = await aside.locator('dd').nth(1).innerText();
    const contrib = await aside.locator('dd').nth(4).innerText();
    hits++;
    if (hits <= 4) results.push(`hit -> ${title} | ${status} | revenue ${rev} | contribution ${contrib}`);
    await page.locator('aside button[aria-label="Close inspector"]').click();
    await page.waitForTimeout(200);
  }
}
results.forEach((r) => console.log('  ' + r));
console.log(`  hit rate: ${hits}/${points.length} sample points landed on a GPU`);

// Camera controls
await page.locator('button[aria-label="Zoom in"]').click();
await page.waitForTimeout(300);
await page.locator('button[aria-label="Zoom out"]').click();
await page.waitForTimeout(300);
await page.locator('button[aria-label="Reset view"]').click();
await page.waitForTimeout(300);
console.log('  camera controls: clicked without error');

// Drag to orbit
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.5, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);
console.log('  drag-to-orbit: completed without error');

// Wheel over the canvas must scroll the PAGE, not zoom the scene.
const before = await page.evaluate(() => window.scrollY);
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.mouse.wheel(0, 500);
await page.waitForTimeout(500);
const after = await page.evaluate(() => window.scrollY);
console.log(`  wheel over canvas: scrollY ${before} -> ${after} (${after > before ? 'page scrolled — no hijack' : 'SCROLL HIJACKED'})`);

await browser.close();
