import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createState } from "../plugins/agent-canvas/canvas/state.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => fs.readFileSync(path.join(here, "fixtures", f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
// Cada evento lleva su marca de tiempo (la agrega el emisor al recibirlo), asignada ANTES de mezclar el orden.
const stamp = (events) => events.map((e, i) => (e._ts ? e : { ...e, _ts: 1_000_000 + i * 50 }));
const run = (events) => {
  const ev = stamp(events); const last = Math.max(...ev.map((e) => e._ts));
  const s = createState({ now: () => last + 1_000 });
  ev.forEach((e) => s.ingest(e)); return s;
};
const by = (list, pred) => list.find(pred);

test("modo asíncrono: raíz, subagente enlazado, modelo y estados finales", () => {
  const s = run(load("events.jsonl"));
  const l = s.listSessions();
  const root = by(l, (n) => !n.parentID);
  const kid = by(l, (n) => n.parentID);
  assert.ok(root && kid, "hay raíz e hijo");
  assert.equal(l.length, 2);
  assert.equal(kid.parentID, root.id, "el hijo cuelga de la raíz");
  assert.equal(kid.agent, "Explore");
  assert.equal(kid.model, "claude-haiku-5-5", "el modelo sale de resolvedModel");
  assert.equal(kid.status, "done");
  assert.equal(root.status, "done", "SessionEnd cierra la sesión");
  assert.match(root.title, /demo/);
});

test("el chat de la raíz: prompt, tools y mensaje final; el task-notification no se muestra como usuario", () => {
  const s = run(load("events.jsonl"));
  const root = by(s.listSessions(), (n) => !n.parentID);
  const m = s.messages(root.id);
  const kinds = m.items.map((i) => i.kind);
  assert.equal(kinds.filter((k) => k === "user").length, 1, "solo el prompt real");
  assert.ok(m.items.some((i) => i.kind === "assistant" && i.text === "listo"));
  const bash = by(m.items, (i) => i.kind === "tool" && i.tool === "bash");
  assert.equal(bash.status, "completed");
  assert.equal(bash.arg, "echo hola");
  assert.ok(bash.pid && bash.mid);
});

test("detalle de una terminal: comando, salida y aviso de que no hay salida en vivo", () => {
  const s = run(load("events.jsonl"));
  const root = by(s.listSessions(), (n) => !n.parentID);
  const bash = by(s.messages(root.id).items, (i) => i.tool === "bash");
  const d = s.toolDetail(root.id, bash.pid);
  assert.equal(d.output, "hola");
  assert.equal(d.input.command, "echo hola");
  assert.equal(d.status, "completed");
  assert.equal(d.noLive, true);
});

test("la herramienta Agent queda 'en curso' mientras corre en segundo plano y enlaza al hijo", () => {
  const ev = load("events.jsonl");
  // Corte justo después de que el subagente ARRANCA su bash y antes de que termine.
  const upto = ev.findIndex((e) => e.hook_event_name === "PostToolUse" && e.agent_id);
  const s = run(stamp(ev).slice(0, upto));
  const l = s.listSessions();
  const root = by(l, (n) => !n.parentID), kid = by(l, (n) => n.parentID);
  assert.equal(kid.status, "busy");
  assert.equal(root.status, "busy");
  const agentTool = by(s.messages(root.id).items, (i) => i.tool === "task");
  assert.equal(agentTool.status, "running", "el PostToolUse async_launched no la completa");
  assert.equal(s.toolDetail(root.id, agentTool.pid).sessionId, kid.id, "botón 'ver agente'");
  assert.equal(by(s.listSessions(), (n) => !n.parentID).tool, "esperando agentes");
  assert.equal(by(s.listSessions(), (n) => n.parentID).tool, "bash", "tool actual del hijo");
});

test("al terminar el subagente se completa la tool Agent con su mensaje final", () => {
  const s = run(load("events.jsonl"));
  const root = by(s.listSessions(), (n) => !n.parentID);
  const t = by(s.messages(root.id).items, (i) => i.tool === "task");
  assert.equal(t.status, "completed");
  assert.match(s.toolDetail(root.id, t.pid).output, /a\.js/);
  const kid = by(s.listSessions(), (n) => n.parentID);
  const km = s.messages(kid.id);
  assert.equal(km.items[0].kind, "user", "el encargo aparece como primer mensaje del hijo");
  assert.ok(km.items.some((i) => i.kind === "assistant" && /a\.js/.test(i.text)));
});

test("modo síncrono: la tool Agent llega completa, con estadísticas", () => {
  const s = run(load("events-sync.jsonl"));
  const l = s.listSessions();
  const root = by(l, (n) => !n.parentID), kid = by(l, (n) => n.parentID);
  assert.equal(kid.agent, "qa");
  assert.equal(kid.parentID, root.id);
  const t = by(s.messages(root.id).items, (i) => i.tool === "task");
  assert.equal(t.status, "completed");
  const d = s.toolDetail(root.id, t.pid);
  assert.equal(d.sessionId, kid.id);
  assert.match(d.output, /Estrategia de pruebas/);
  assert.match(d.output, /tokens/);
});

// Mezcla local del orden: simula hooks asíncronos que se pisan por unos milisegundos.
function jitter(arr, seed) {
  let x = seed; const rnd = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const a = arr.slice();
  for (let i = 0; i < a.length - 1; i++) if (rnd() < 0.4) { const j = Math.min(a.length - 1, i + 1 + Math.floor(rnd() * 2)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const signature = (s) => {
  const l = s.listSessions();
  const nodes = l.map((n) => `${n.agent}|${n.parentID ? "child" : "root"}|${n.status}|${n.model}`).sort();
  const tools = [];
  for (const n of l) for (const i of s.messages(n.id).items) if (i.kind === "tool") tools.push(`${i.tool}:${i.status}`);
  return JSON.stringify({ nodes, tools: tools.sort() });
};
for (const f of ["events.jsonl", "events-sync.jsonl"]) {
  test(`tolerancia a desorden (${f}): 300 mezclas dan el mismo resultado final`, () => {
    const ev = stamp(load(f)); const ref = signature(run(ev)); let bad = 0, first = null;
    for (let seed = 1; seed <= 300; seed++) {
      const sig = signature(run(jitter(ev, seed)));
      if (sig !== ref) { bad++; first ||= { seed, sig }; }
    }
    assert.equal(bad, 0, `difirió en ${bad}/300 mezclas. Ejemplo: ${first && first.sig}\nreferencia: ${ref}`);
  });
}

test("límites: salida enorme y entradas largas se recortan; una sesión no tumba a otra", () => {
  const s = createState();
  const base = { session_id: "S1", cwd: "/x", hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "t1", tool_input: { command: "x".repeat(50_000) } };
  s.ingest(base);
  s.ingest({ ...base, hook_event_name: "PostToolUse", tool_response: { stdout: "A".repeat(300_000) + "FIN", stderr: "" } });
  const d = s.toolDetail("S1", "t1");
  assert.equal(d.output.length, 200_000);
  assert.ok(d.output.endsWith("FIN"), "en terminales se conserva el final");
  assert.equal(d.input.command.length, 20_000);
  assert.equal(d.truncated, true);
  assert.equal(d.inputTruncated, true);
  s.ingest({ session_id: "S2", cwd: "/y", hook_event_name: "UserPromptSubmit", prompt: "hola" });
  assert.equal(s.listSessions().filter((n) => !n.parentID).length, 2);
  assert.equal(s.toolDetail("NOEXISTE", "t1"), null);
  assert.deepEqual(s.messages("NOEXISTE").items, []);
});

test("Edit genera un diff y las claves de Claude Code se traducen", () => {
  const s = createState();
  const e = { session_id: "S1", cwd: "/x", tool_name: "Edit", tool_use_id: "e1", tool_input: { file_path: "/x/a.js", old_string: "uno", new_string: "dos" } };
  s.ingest({ ...e, hook_event_name: "PreToolUse" });
  s.ingest({ ...e, hook_event_name: "PostToolUse", tool_response: { filePath: "/x/a.js" } });
  const d = s.toolDetail("S1", "e1");
  assert.equal(d.input.filePath, "/x/a.js");
  assert.match(d.diff, /-uno/);
  assert.match(d.diff, /\+dos/);
  assert.equal(s.messages("S1").items[0].arg, "/x/a.js");
});

test("un fallo de herramienta queda en error; StopFailure marca la sesión", () => {
  const s = createState();
  const e = { session_id: "S1", cwd: "/x", tool_name: "Bash", tool_use_id: "b1", tool_input: { command: "false" } };
  s.ingest({ ...e, hook_event_name: "PreToolUse" });
  s.ingest({ ...e, hook_event_name: "PostToolUseFailure", error: "Command failed with exit code 1" });
  s.ingest({ ...e, hook_event_name: "PostToolUse", tool_response: { stdout: "" } }); // llega tarde: no debe pisar el error
  assert.equal(s.messages("S1").items[0].status, "error");
  assert.match(s.toolDetail("S1", "b1").error, /exit code 1/);
  s.ingest({ session_id: "S1", hook_event_name: "StopFailure" });
  assert.equal(s.listSessions()[0].status, "error");
});

test("TodoWrite: el chat recibe la lista y el nodo guarda la última versión (por marca de tiempo)", () => {
  const s = createState({ now: () => 2_000_000 });
  const mk = (id, ts, todos, ev = "PreToolUse") => ({ session_id: "S1", cwd: "/x", hook_event_name: ev, tool_name: "TodoWrite", tool_use_id: id, tool_input: { todos }, _ts: ts });
  const v1 = [{ content: "uno", status: "in_progress", activeForm: "haciendo uno" }, { content: "dos", status: "pending" }];
  const v2 = [{ content: "uno", status: "completed" }, { content: "dos", status: "in_progress" }];
  // llegan en orden invertido: la versión nueva primero
  s.ingest(mk("t2", 1_000_200, v2)); s.ingest(mk("t1", 1_000_100, v1));
  const items = s.messages("S1").items.filter((i) => i.tool === "todowrite");
  assert.equal(items.length, 2);
  assert.deepEqual(items.find((i) => i.pid === "t1").todos, [{ content: "uno", status: "in_progress" }, { content: "dos", status: "pending" }]);
  assert.equal(items[0].arg, "2 tareas");
  const b = s.statsBase("S1");
  assert.deepEqual(b.todos.map((t) => t.status), ["completed", "in_progress"], "gana la versión más reciente aunque llegó antes");
  assert.equal(b.counts.tools, 2);
  assert.equal(s.toolDetail("S1", "t2").input.todos.length, 2);
});

test("statsBase de un subagente: sus propios todos y las estadísticas que informó Agent", () => {
  const ev = load("events-sync.jsonl"); const s = run(ev);
  const kid = by(s.listSessions(), (n) => n.parentID);
  const b = s.statsBase(kid.id);
  assert.ok(b.lines.some((l) => /tokens en total/.test(l)), "tokens del subagente");
  assert.ok(b.lines.some((l) => /modelo: claude-haiku/.test(l)));
  assert.deepEqual(b.todos, []);
  assert.equal(s.statsBase("NOEXISTE"), null);
  // el transcript de un subagente se deduce de la ruta del transcript de la sesión
  const root = by(s.listSessions(), (n) => !n.parentID);
  assert.match(s.transcriptOf(kid.id), /subagents\/agent-.+\.jsonl$/);
  assert.match(s.transcriptOf(root.id), /\.jsonl$/);
});

test("TaskCreate/TaskUpdate: la lista se arma de a una (Claude Code 2.x no tiene TodoWrite)", () => {
  const s = createState({ now: () => 2_000_000 });
  const base = { session_id: "S2", cwd: "/x", _ts: 1_000_000 };
  const pre = (id, name, input) => ({ ...base, hook_event_name: "PreToolUse", tool_name: name, tool_use_id: id, tool_input: input });
  const post = (id, name, input, resp) => ({ ...base, hook_event_name: "PostToolUse", tool_name: name, tool_use_id: id, tool_input: input, tool_response: resp });

  // dos TaskCreate en paralelo, después las actualizaciones (una llega antes que su creación)
  s.ingest(pre("c1", "TaskCreate", { subject: "mapear el repo", description: "leer estructura", activeForm: "mapeando" }));
  s.ingest(pre("c2", "TaskCreate", { subject: "escribir el contrato", description: "", activeForm: "escribiendo" }));
  s.ingest(post("c1", "TaskCreate", { subject: "mapear el repo" }, "Task #1 created successfully: mapear el repo"));
  s.ingest(post("c2", "TaskCreate", { subject: "escribir el contrato" }, "Task #2 created successfully: escribir el contrato"));

  let b = s.statsBase("S2");
  assert.deepEqual(b.todos.map((t) => t.content), ["mapear el repo", "escribir el contrato"]);
  assert.deepEqual(b.todos.map((t) => t.status), ["pending", "pending"]);

  s.ingest(pre("u1", "TaskUpdate", { taskId: "1", status: "in_progress" }));
  s.ingest(pre("u2", "TaskUpdate", { taskId: "2", status: "deleted" }));
  s.ingest(pre("u3", "TaskUpdate", { taskId: "1", status: "completed" }));
  b = s.statsBase("S2");
  assert.deepEqual(b.todos, [{ id: "1", content: "mapear el repo", status: "completed" }], "actualiza por id y borra las eliminadas");

  const items = s.messages("S2").items;
  assert.equal(items.filter((i) => i.tool === "taskcreate").length, 2);
  assert.equal(items.find((i) => i.pid === "c1").arg, "mapear el repo");
  assert.deepEqual(items.find((i) => i.pid === "c1").todos.map((t) => t.content), ["mapear el repo", "escribir el contrato"], "el chat muestra la lista vigente al crear");
  assert.ok(items.find((i) => i.pid === "u3").todos.every((t) => t.status !== "deleted"));
  assert.equal(s.toolDetail("S2", "c1").todos.length, 2);
});

test("TaskCreate que falla no deja la tarea colgada", () => {
  const s = createState({ now: () => 2_000_000 });
  const e = (name, extra) => ({ session_id: "S3", cwd: "/x", _ts: 1_000_000, tool_use_id: "x1", tool_name: "TaskCreate", tool_input: { subject: "algo" }, hook_event_name: name, ...extra });
  s.ingest(e("PreToolUse"));
  assert.equal(s.statsBase("S3").todos.length, 1);
  s.ingest(e("PostToolUseFailure", { error: "no se pudo" }));
  assert.deepEqual(s.statsBase("S3").todos, []);
});
