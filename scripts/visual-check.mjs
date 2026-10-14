// Local-only fixture check. No app auth bypass or production endpoint.
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
const artifact = new URL('../.artifacts/', import.meta.url);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
try {
  for (const [name,width,height] of [['desktop',1440,1100],['mobile',390,844]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.goto(new URL('overview-fixture.html',artifact).href);
    await page.evaluate(()=>document.fonts.ready);
    const sizing=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    if (sizing.document > sizing.viewport) throw new Error(`${name}: horizontal page overflow ${JSON.stringify(sizing)}`);
    await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,artifact)),fullPage:true});
    console.log(`${name}: ${width}px viewport; no horizontal overflow; screenshot saved`);
    await page.close();
  }
} finally { await browser.close(); }
