// Captura final organizada por rol (DEV-ONLY). node capture-all.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:5179";
const OUT = "../design-mockups/final";

const GROUPS = [
  { role: "00-publico", user: null, routes: [{ name: "login", path: "/login" }] },
  { role: "alumno", user: "u4", routes: [
    { name: "dashboard", path: "/alumno/dashboard" },
    { name: "agendar-vuelos", path: "/alumno/agendar" },
    { name: "aula-virtual", path: "/alumno/aula-virtual" },
    { name: "loadsheet-wizard", path: "/alumno/dashboard", clickText: "Plan de vuelo", waitMs: 1600 },
    { name: "perfil", path: "/perfil" },
  ]},
  { role: "instructor", user: "u6", routes: [
    { name: "dashboard", path: "/instructor" },
    { name: "aula-virtual", path: "/instructor/aula-virtual" },
  ]},
  { role: "programacion", user: "u2", routes: [
    { name: "dashboard", path: "/programacion/dashboard" },
    { name: "agendar-vuelo", path: "/programacion/agendar" },
  ]},
  { role: "turno", user: "u9", routes: [
    { name: "dashboard-operativo", path: "/turno" },
  ]},
  { role: "admin-sistema", user: "u1", routes: [
    { name: "dashboard-calendario", path: "/admin/dashboard" },
    { name: "mantenimiento", path: "/admin/mantenimiento" },
    { name: "modal-iniciar-mantenimiento", path: "/admin/mantenimiento", clickText: "Iniciar mantenimiento", waitMs: 1400 },
    { name: "alumnos", path: "/admin/alumnos" },
    { name: "perfiles", path: "/admin/perfiles" },
    { name: "auditoria", path: "/admin/auditoria" },
    { name: "cancelaciones", path: "/admin/cancelaciones" },
  ]},
  { role: "administracion", user: "u_admin_fin", routes: [
    { name: "dashboard", path: "/administracion/dashboard" },
    { name: "cuentas", path: "/administracion/alumnos" },
    { name: "cuenta-detalle", path: "/administracion/cuentas/1" },
    { name: "modal-registrar-abono", path: "/administracion/cuentas/1", clickText: "Registrar abono", waitMs: 1100 },
    { name: "alumno-ficha", path: "/administracion/alumnos/1" },
    { name: "usuarios", path: "/administracion/usuarios" },
    { name: "modal-nuevo-alumno", path: "/administracion/usuarios", clickText: "Nuevo alumno", waitMs: 1100 },
    { name: "contabilidad-ingresos", path: "/administracion/contabilidad" },
    { name: "contabilidad-egresos", path: "/administracion/contabilidad?tab=egresos" },
    { name: "contabilidad-nomina", path: "/administracion/contabilidad?tab=nomina" },
    { name: "contabilidad-tarifas", path: "/administracion/contabilidad?tab=tarifas" },
    { name: "cursos", path: "/administracion/cursos" },
    { name: "documentacion", path: "/administracion/documentacion" },
    { name: "medicos", path: "/administracion/medicos" },
    { name: "aula-virtual", path: "/administracion/aula-virtual" },
    { name: "reportes", path: "/administracion/reportes" },
  ]},
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1300 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

for (const g of GROUPS) {
  await mkdir(`${OUT}/${g.role}`, { recursive: true });
  // logout + login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear()).catch(() => {});
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  if (g.user) {
    await page.fill("#login-user", g.user);
    await page.fill("#login-pass", "demo123");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
      page.click(".login__submit"),
    ]);
    await page.waitForTimeout(2200);
  }
  for (const r of g.routes) {
    try {
      await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(r.preMs ?? 1700);
      if (r.clickText) {
        await page.getByText(r.clickText, { exact: false }).first()
          .click({ timeout: 5000 }).catch((e) => console.log("clickText miss", g.role, r.name, e.message));
        await page.waitForTimeout(r.waitMs ?? 1100);
      }
      await page.screenshot({ path: `${OUT}/${g.role}/${r.name}.png` });
      console.log("OK", g.role, r.name);
    } catch (e) {
      console.log("FAIL", g.role, r.name, e.message);
    }
  }
}

await browser.close();
console.log("DONE");
