import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({
  path: "docs/screenshots/dashboard-1600.png",
  fullPage: false,
});
await browser.close();
console.log("screenshot saved to docs/screenshots/dashboard-1600.png");
