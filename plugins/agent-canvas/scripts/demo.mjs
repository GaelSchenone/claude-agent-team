#!/usr/bin/env node
// Demo del canvas con datos inventados: levanta el servidor en un puerto aparte y le manda, con los mismos
// eventos que mandan los hooks de Claude Code, una sesión donde el tech-lead reparte trabajo entre varios agentes.
// No usa Claude Code, no gasta tokens y no toca tu canvas real (puerto 7789).
//
//   node scripts/demo.mjs            -> http://127.0.0.1:7790
//   DEMO_PORT=7795 node scripts/demo.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.DEMO_PORT || 7790);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "..", "canvas", "server.mjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SID = "demo-" + Math.random().toString(16).slice(2, 10);
const CWD = "/work/tienda-web";
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agent-canvas-demo-"));
const ROOT_TX = path.join(DIR, `${SID}.jsonl`);
const subTx = (id) => path.join(DIR, SID, "subagents", `agent-${id}.jsonl`);
fs.mkdirSync(path.join(DIR, SID, "subagents"), { recursive: true });
fs.writeFileSync(ROOT_TX, "");

const OPUS = "claude-opus-5-5", SONNET = "claude-sonnet-5-5", HAIKU = "claude-haiku-5-5";

const append = (file, obj) => fs.appendFileSync(file, JSON.stringify(obj) + "\n");
const usage = (file, model, ctx, out, cost) => {
  append(file, { type: "assistant", message: { model, usage: { input_tokens: ctx - out - 3000, cache_read_input_tokens: 2000, cache_creation_input_tokens: 1000, output_tokens: out } } });
  if (cost != null) append(file, { type: "cost-state", totalCostUSD: cost });
};

let n = 0;
const tid = () => `toolu_demo_${String(++n).padStart(3, "0")}`;
const base = { session_id: SID, cwd: CWD, transcript_path: ROOT_TX };
const who = (a) => (a ? { agent_id: a.id, agent_type: a.type } : {});

async function post(ev) {
  ev._ts = Date.now();
  try {
    await fetch(`http://127.0.0.1:${PORT}/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ev) });
  } catch { /* el servidor todavía no está */ }
}

// Una herramienta: aviso de inicio y, después de `ms`, el resultado (o el error).
function tool(a, name, input, resp, ms = 1200, fail = "") {
  const id = tid();
  const ev = { ...base, ...who(a), tool_name: name, tool_input: input, tool_use_id: id };
  return [
    [0, () => post({ ...ev, hook_event_name: "PreToolUse" })],
    [ms / 1000, () => post(fail ? { ...ev, hook_event_name: "PostToolUseFailure", error: fail } : { ...ev, hook_event_name: "PostToolUse", tool_response: resp })],
  ];
}

const AG = {
  explorer: { id: "a1b2c3d4e5f60001", type: "agent-team:explorer", model: HAIKU },
  architect: { id: "a1b2c3d4e5f60002", type: "agent-team:architect", model: OPUS },
  backend: { id: "a1b2c3d4e5f60003", type: "agent-team:backend", model: SONNET },
  frontend: { id: "a1b2c3d4e5f60004", type: "agent-team:frontend", model: SONNET },
  qa: { id: "a1b2c3d4e5f60005", type: "agent-team:qa", model: SONNET },
  reviewer: { id: "a1b2c3d4e5f60006", type: "agent-team:reviewer", model: OPUS },
};

const timeline = []; // [segundo, función]
const at = (sec, fn) => timeline.push([sec, fn]);
const seq = (start, steps) => { // steps: lista de [[offset, fn], ...] en secuencia
  let t = start;
  for (const [gap, list] of steps) { t += gap; for (const [off, fn] of list) at(t + off, fn); }
};

function launch(sec, key, description, prompt) {
  const a = AG[key], id = tid();
  const ev = { ...base, tool_name: "Agent", tool_input: { description, subagent_type: a.type, prompt }, tool_use_id: id };
  at(sec, () => post({ ...ev, hook_event_name: "PreToolUse" }));
  at(sec + 0.15, () => post({ ...base, hook_event_name: "SubagentStart", agent_id: a.id, agent_type: a.type }));
  at(sec + 0.3, () => post({ ...ev, hook_event_name: "PostToolUse", tool_response: { isAsync: true, status: "async_launched", agentId: a.id, agentType: a.type, resolvedModel: a.model, description } }));
  at(sec + 0.4, () => usage(subTx(a.id), a.model, 9000, 300));
}
const stop = (sec, key, msg) => {
  const a = AG[key];
  at(sec - 0.2, () => usage(subTx(a.id), a.model, 21000 + Math.floor(Math.random() * 9000), 1900));
  at(sec, () => post({ ...base, hook_event_name: "SubagentStop", agent_id: a.id, agent_type: a.type, agent_transcript_path: subTx(a.id), last_assistant_message: msg }));
};
const task = (sec, input, resp) => {
  const id = tid(), ev = { ...base, tool_name: input.taskId ? "TaskUpdate" : "TaskCreate", tool_input: input, tool_use_id: id };
  at(sec, () => post({ ...ev, hook_event_name: "PreToolUse" }));
  at(sec + 0.2, () => post({ ...ev, hook_event_name: "PostToolUse", tool_response: resp || "ok" }));
};

// ── Hilo principal ─────────────────────────────────────────────
at(0, () => post({ ...base, hook_event_name: "SessionStart", model: OPUS, source: "startup" }));
at(0.3, () => usage(ROOT_TX, OPUS, 18000, 420, 0.06));
at(0.5, () => post({ ...base, hook_event_name: "UserPromptSubmit", prompt: "Agregá un filtro por categoría a la tienda (API y pantalla) y dejá los tests en verde. Usá el equipo." }));
task(1.2, { subject: "Mapear el catálogo y definir el contrato", description: "Entender cómo se listan los productos hoy" }, "Task #1 created successfully");
task(1.7, { subject: "Implementar API y pantalla del filtro", description: "Backend y frontend en paralelo" }, "Task #2 created successfully");
task(2.2, { subject: "Probar y revisar", description: "Tests nuevos y revisión del diff" }, "Task #3 created successfully");
task(2.8, { taskId: "1", status: "in_progress" });

launch(3.4, "explorer", "Mapear el catálogo y los filtros actuales", "Listá cómo se arman hoy el listado de productos y los filtros. Solo lectura.");
seq(3.9, [
  [0, tool(AG.explorer, "Glob", { pattern: "src/**/*.{ts,tsx}" }, { content: "api/products.ts\nweb/ProductList.tsx\nweb/Filters.tsx\ndb/schema.sql" }, 900)],
  [1.3, tool(AG.explorer, "Grep", { pattern: "category", path: "src" }, { content: "api/products.ts:12:  // TODO: category\ndb/schema.sql:7:  category TEXT NOT NULL" }, 1000)],
  [1.4, tool(AG.explorer, "Read", { file_path: "api/products.ts" }, { file: { content: "export async function listProducts(q) {\n  return db.all('SELECT * FROM products');\n}" } }, 800)],
]);
launch(4.6, "architect", "Definir el contrato de GET /api/products", "Proponé cómo se agrega ?category= sin romper a los clientes actuales.");
seq(5.4, [
  [0, tool(AG.architect, "Read", { file_path: "docs/contracts/api.md" }, { file: { content: "GET /api/products -> [{id,name,price,category}]" } }, 900)],
  [1.8, tool(AG.architect, "Write", { file_path: "docs/contracts/products-filter.md", content: "# GET /api/products?category=\nFiltro opcional, sin parámetro devuelve todo.\n" }, "File created successfully", 1100)],
]);
stop(8.6, "explorer", "El listado vive en api/products.ts y no filtra nada. La columna category ya existe en la tabla. Falta el parámetro en la API y un selector en web/Filters.tsx.");
task(9.0, { taskId: "1", status: "completed" });
at(9.1, () => usage(ROOT_TX, OPUS, 41000, 1800, 0.31));
stop(11.2, "architect", "Contrato listo en docs/contracts/products-filter.md: ?category= opcional, 400 si la categoría no existe, sin cambios para quien no lo manda.");
task(11.6, { taskId: "2", status: "in_progress" });

launch(12.0, "backend", "Implementar el filtro por categoría en la API", "Agregá ?category= a listProducts según docs/contracts/products-filter.md.");
launch(12.5, "frontend", "Agregar el selector de categorías", "Sumá un selector en Filters.tsx que mande ?category= al listado.");
at(12.8, () => usage(ROOT_TX, OPUS, 63000, 2400, 0.74));
seq(12.9, [
  [0, tool(AG.backend, "Read", { file_path: "api/products.ts" }, { file: { content: "export async function listProducts(q) { ... }" } }, 800)],
  [1.6, tool(AG.backend, "Edit", { file_path: "api/products.ts", old_string: "return db.all('SELECT * FROM products');", new_string: "const c = q.category;\n  return c ? db.all('SELECT * FROM products WHERE category = ?', c) : db.all('SELECT * FROM products');" }, "The file api/products.ts has been updated.", 1000)],
  [1.6, tool(AG.backend, "Bash", { command: "npm test -- products", description: "Correr los tests de productos" }, null, 1600, "1 test failing: categoría inexistente debería dar 400")],
  [2.0, tool(AG.backend, "Edit", { file_path: "api/products.ts", old_string: "const c = q.category;", new_string: "const c = q.category;\n  if (c && !CATEGORIES.includes(c)) throw httpError(400, 'categoría inválida');" }, "The file api/products.ts has been updated.", 900)],
  [1.4, tool(AG.backend, "Bash", { command: "npm test -- products", description: "Correr los tests de productos" }, { stdout: "PASS api/products.test.js\nTests: 6 passed, 6 total" }, 1700)],
]);
seq(13.6, [
  [0, tool(AG.frontend, "Read", { file_path: "web/Filters.tsx" }, { file: { content: "export function Filters() { return <div/>; }" } }, 800)],
  [2.0, tool(AG.frontend, "Write", { file_path: "web/CategoryFilter.tsx", content: "export function CategoryFilter({ value, onChange }) { /* selector */ }\n" }, "File created successfully", 1100)],
  [2.2, tool(AG.frontend, "Edit", { file_path: "web/Filters.tsx", old_string: "return <div/>;", new_string: "return <CategoryFilter value={cat} onChange={setCat} />;" }, "The file web/Filters.tsx has been updated.", 1000)],
]);
stop(22.6, "backend", "API lista: ?category= filtra, devuelve 400 si la categoría no existe y los 6 tests de productos pasan.");
stop(23.8, "frontend", "Selector agregado en web/CategoryFilter.tsx y conectado desde Filters.tsx. No toqué estilos globales.");
task(24.2, { taskId: "2", status: "completed" });
task(24.6, { taskId: "3", status: "in_progress" });
at(24.8, () => usage(ROOT_TX, OPUS, 88000, 3100, 1.38));

launch(25.2, "qa", "Escribir y correr los tests del filtro", "Cubrí con tests el filtro por categoría (caso feliz, inexistente y sin parámetro).");
seq(25.8, [
  [0, tool(AG.qa, "Write", { file_path: "tests/products.filter.test.js", content: "test('filtra por categoría', () => {});\n" }, "File created successfully", 1000)],
  [2.2, tool(AG.qa, "Bash", { command: "node --test tests/", description: "Correr toda la suite" }, { stdout: "# tests 14\n# pass 14\n# fail 0" }, 1800)],
]);
stop(29.8, "qa", "Agregué 3 tests del filtro. Suite completa: 14 de 14 en verde.");

launch(30.2, "reviewer", "Revisar el diff contra el contrato", "Revisá los cambios contra docs/contracts/products-filter.md. Solo lectura.");
seq(30.9, [
  [0, tool(AG.reviewer, "Bash", { command: "git diff --stat", description: "Ver qué cambió" }, { stdout: " api/products.ts | 6 +++++-\n web/CategoryFilter.tsx | 9 +++++++++\n 2 files changed" }, 1200)],
]);
stop(34.0, "reviewer", "Sin hallazgos críticos. Sugerencia menor: cachear la lista de categorías en lugar de leerla por request.");
task(34.4, { taskId: "3", status: "completed" });
at(34.6, () => usage(ROOT_TX, OPUS, 104000, 3900, 1.9));
at(35.0, () => post({ ...base, hook_event_name: "Stop", last_assistant_message: "Listo. El filtro ?category= está en la API y en la pantalla, con 14 de 14 tests en verde y una sugerencia menor del revisor (cachear categorías)." }));

// ── Ejecución ──────────────────────────────────────────────────
async function waitServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); if (r.ok) return true; } catch { /* todavía no */ }
    await sleep(150);
  }
  return false;
}

const server = spawn(process.execPath, [SERVER], { env: { ...process.env, AGENT_CANVAS_PORT: String(PORT) }, stdio: "ignore" });
const cleanup = () => { try { server.kill(); } catch { /* ya cerró */ } fs.rmSync(DIR, { recursive: true, force: true }); };
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("exit", cleanup);

if (!(await waitServer())) { console.error(`No pude levantar el canvas en el puerto ${PORT} (¿está ocupado?).`); process.exit(1); }
console.log(`Demo del canvas en http://127.0.0.1:${PORT}  (datos inventados, dura ~35 s; Ctrl+C para salir)`);

const t0 = Date.now();
timeline.sort((a, b) => a[0] - b[0]);
for (const [sec, fn] of timeline) {
  const wait = sec * 1000 - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  await fn();
}
console.log("Escenario terminado. El canvas sigue abierto; Ctrl+C para salir.");
setInterval(() => {}, 1 << 30);
