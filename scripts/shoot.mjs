/**
 * Screenshot harness. Drives the Chrome already installed on this machine
 * through puppeteer-core, so there is no second browser to download and no
 * dependency on the user's own Chrome profile being free.
 *
 *   node scripts/shoot.mjs <url> <out-prefix> [--text]
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const [, , url, prefix, ...flags] = process.argv;
if (!url || !prefix) {
  console.error("usage: node scripts/shoot.mjs <url> <out-prefix> [--text]");
  process.exit(1);
}
mkdirSync(dirname(prefix), { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
});

for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  }
  // Let fonts settle and any entrance animation finish before capturing.
  await new Promise((r) => setTimeout(r, 2500));

  await page.screenshot({ path: `${prefix}-${vp.name}.png` });
  await page.screenshot({
    path: `${prefix}-${vp.name}-full.png`,
    fullPage: true,
  });

  if (flags.includes("--text") && !vp.mobile) {
    const text = await page.evaluate(() =>
      document.body.innerText.replace(/\n{3,}/g, "\n\n"),
    );
    writeFileSync(`${prefix}.txt`, text, "utf8");
  }
  await page.close();
  console.log(`captured ${vp.name}`);
}

await browser.close();
