// scripts/screenshot.mjs
// Takes a screenshot of the live site at a real iPhone viewport size,
// so layout bugs (overlap, squished sidebars, missing safe-area padding)
// show up in a PNG Claude (or you) can actually look at.
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const SITE_URL = process.env.SCREENSHOT_URL || "https://pastel-chat-app.vercel.app";
const OUT_DIR = "screenshots";

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();

// iPhone 14 viewport (390x844 CSS px, matches the brief's target size)
const iphone = devices["iPhone 14"];
const context = await browser.newContext({ ...iphone });
const page = await context.newPage();

await page.goto(SITE_URL, { waitUntil: "networkidle" });
// Small settle time for fonts/animations before capturing
await page.waitForTimeout(800);

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
await page.screenshot({
  path: `${OUT_DIR}/auth-screen-${timestamp}.png`,
  fullPage: true,
});
// Also keep a stable, overwritten "latest" file for easy fetching
await page.screenshot({
  path: `${OUT_DIR}/auth-screen-latest.png`,
  fullPage: true,
});

await browser.close();
console.log("Screenshot saved.");
