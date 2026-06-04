// Andamiaje de capturas (DEV-ONLY). Playwright headless → PNG por pantalla.
// Uso: node capture.mjs <usuario> <password> <outDir> <json-de-rutas>
// Las rutas: [{ name, path, waitMs?, click? (selector), preMs? }]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const [, , user, pass, outDir, routesJson] = process.argv;
const routes = JSON.parse(routesJson);
const BASE = "http://localhost:5179";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1300 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

async function shoot(name) {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("OK", name);
}

// Login
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await shoot("00-login");

if (user && user !== "-") {
  await page.fill("#login-user", user);
  await page.fill("#login-pass", pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
    page.click(".login__submit"),
  ]);
  await page.waitForTimeout(2500);
}

for (const r of routes) {
  try {
    await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(r.preMs ?? 1800);
    // secuencia de clics por texto (para abrir modales): clickText puede ser
    // string o array de strings (se hacen en orden).
    const steps = r.clickText ? (Array.isArray(r.clickText) ? r.clickText : [r.clickText]) : [];
    for (const t of steps) {
      const el = page.getByText(t, { exact: false }).first();
      await el.click({ timeout: 5000 }).catch((e) => console.log("clickText miss", r.name, t, e.message));
      await page.waitForTimeout(r.waitMs ?? 1100);
    }
    if (r.click) {
      await page.click(r.click, { timeout: 4000 }).catch((e) => console.log("click miss", r.name, e.message));
      await page.waitForTimeout(r.waitMs ?? 900);
    }
    await shoot(r.name);
  } catch (e) {
    console.log("FAIL", r.name, e.message);
  }
}

await browser.close();
console.log("DONE");
