// Genera design-mockups/final/index.html: galería de capturas por rol.
import { readdir, writeFile } from "node:fs/promises";

const ROOT = "../design-mockups/final";
const ROLE_LABEL = {
  "00-publico": "Público",
  "alumno": "Alumno",
  "instructor": "Instructor",
  "programacion": "Programación",
  "turno": "Turno (Operaciones)",
  "admin-sistema": "Admin (Sistema)",
  "administracion": "Administración / Contabilidad",
};
const nice = (s) => s.replace(/\.png$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const dirs = (await readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();

let sections = "";
let total = 0;
for (const dir of dirs) {
  const files = (await readdir(`${ROOT}/${dir}`)).filter((f) => f.endsWith(".png")).sort();
  total += files.length;
  const cards = files.map((f) => `
      <figure class="shot">
        <a href="./${dir}/${f}" target="_blank"><img loading="lazy" src="./${dir}/${f}" alt="${nice(f)}"></a>
        <figcaption>${nice(f)}</figcaption>
      </figure>`).join("");
  sections += `
    <section id="${dir}">
      <h2><span class="dot"></span>${ROLE_LABEL[dir] || dir} <span class="count">${files.length}</span></h2>
      <div class="grid">${cards}</div>
    </section>`;
}

const nav = dirs.map((d) => `<a href="#${d}">${ROLE_LABEL[d] || d}</a>`).join("");

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CAAA · Rediseño visual — Galería de capturas</title>
<style>
  :root{
    --navy:oklch(34% 0.095 262); --navy-deep:oklch(24% 0.065 262);
    --red:oklch(54% 0.205 25); --ink1:oklch(22% 0.02 262); --ink3:oklch(54% 0.012 262);
    --s0:oklch(99.2% 0.003 262); --s1:oklch(98.4% 0.004 262); --s2:oklch(96.5% 0.007 262);
    --line:oklch(92% 0.008 262);
  }
  *{box-sizing:border-box} body{margin:0;font-family:Inter,system-ui,Segoe UI,sans-serif;background:var(--s0);color:var(--ink1)}
  header{background:var(--navy-deep);color:#fff;padding:28px 40px;position:sticky;top:0;z-index:10;border-bottom:1px solid var(--navy)}
  header h1{margin:0;font-size:20px;letter-spacing:.04em;font-weight:800}
  header p{margin:6px 0 0;color:oklch(82% 0.02 262);font-size:13px}
  nav{display:flex;flex-wrap:wrap;gap:6px;padding:14px 40px;background:var(--s1);border-bottom:1px solid var(--line);position:sticky;top:81px;z-index:9}
  nav a{font-size:12px;font-weight:600;color:var(--ink3);text-decoration:none;padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:var(--s0)}
  nav a:hover{color:var(--red);border-color:var(--red)}
  main{padding:24px 40px 80px;max-width:1500px;margin:0 auto}
  section{margin:40px 0}
  h2{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700;border-bottom:1px solid var(--line);padding-bottom:10px}
  h2 .dot{width:8px;height:8px;border-radius:999px;background:var(--red)}
  h2 .count{margin-left:auto;font-size:12px;color:var(--ink3);font-weight:600}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:20px;margin-top:18px}
  .shot{margin:0;background:var(--s1);border:1px solid var(--line);border-radius:10px;overflow:hidden;transition:box-shadow .15s}
  .shot:hover{box-shadow:0 8px 24px oklch(22% .02 262 / .1)}
  .shot img{width:100%;display:block;border-bottom:1px solid var(--line);background:var(--s0)}
  figcaption{padding:10px 14px;font-size:13px;font-weight:600;color:var(--ink1)}
</style>
</head>
<body>
<header>
  <h1>CAAA · Rediseño visual</h1>
  <p>Carril aviónica de precisión · white-label · navy primario + rojo acento · ${total} capturas con datos reales</p>
</header>
<nav>${nav}</nav>
<main>${sections}</main>
</body>
</html>`;

await writeFile(`${ROOT}/index.html`, html, "utf8");
console.log("index.html generado con", total, "capturas");
