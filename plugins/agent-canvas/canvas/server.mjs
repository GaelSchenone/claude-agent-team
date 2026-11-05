#!/usr/bin/env node
// Servidor local del canvas: recibe los eventos de los hooks de Claude Code y sirve la UI.
// Solo escucha en 127.0.0.1, no guarda nada en disco y rechaza pedidos con un Host que no sea local.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createState } from "./state.mjs";
import { transcriptStats } from "./transcript.mjs";

const PORT = Number(process.env.AGENT_CANVAS_PORT || 7789);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI_PATH = path.join(HERE, "ui.html");
const PID_FILE = path.join(os.tmpdir(), `agent-canvas-${PORT}.pid`);
const MAX_BODY = 8 * 1024 * 1024;
const HOST_OK = new RegExp(`^(127\\.0\\.0\\.1|localhost|\\[::1\\])(:${PORT})?$`, "i");

const state = createState();
const modelTries = new Map();

// El modelo del hilo principal no viaja en los hooks: se lee de la cola del transcript (archivo local).
function lookupModel(sid) {
  try {
    if (!state.needsModel(sid)) return;
    const n = (modelTries.get(sid) || 0) + 1; modelTries.set(sid, n); if (n > 8) return;
    const file = state.transcriptOf(sid); if (!file || !fs.existsSync(file)) return;
    const fd = fs.openSync(file, "r");
    try {
      const size = fs.fstatSync(fd).size, len = Math.min(size, 131072), buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const all = [...buf.toString("utf8").matchAll(/"model":"([^"]+)"/g)].map((m) => m[1]).filter((m) => !m.startsWith("<"));
      if (all.length) state.setModel(sid, all[all.length - 1]);
    } finally { fs.closeSync(fd); }
  } catch { /* opcional */ }
}

const SEND_REASON = "Claude Code no permite mandar mensajes a una sesión abierta desde afuera (solo con channels, una función experimental). Escribile desde la terminal de esa sesión.";
const nf = (n) => Number(n).toLocaleString("es-AR");
function statsPayload(id) {
  const base = state.statsBase(id); if (!base) return null;
  const ts = transcriptStats(state.transcriptOf(id));
  const lines = base.lines.slice();
  if (ts && ts.outputTokens) lines.push(`${nf(ts.outputTokens)} tokens de salida`);
  if (ts && ts.partial) lines.push("(transcript muy grande: se ignoró lo más antiguo)");
  return {
    context: { tokens: ts ? ts.contextTokens : null, limit: null, percent: null }, // Claude Code no informa el tamaño de la ventana
    cost: base.isRoot && ts && ts.cost != null ? ts.cost : null, costEstimated: true,
    todos: base.todos, counts: base.counts, lines,
  };
}

const json = (res, obj, status = 200) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
};

const server = http.createServer((req, res) => {
  if (!HOST_OK.test(String(req.headers.host || ""))) { res.writeHead(403); res.end("forbidden"); return; }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === "POST" && url.pathname === "/api/send") { return json(res, { error: SEND_REASON }, 501); }
    if (req.method === "POST" && url.pathname === "/event") {
      let size = 0; const chunks = [];
      req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { req.destroy(); return; } chunks.push(c); });
      req.on("end", () => {
        try {
          const ev = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          state.ingest(ev);
          if (ev && ev.session_id) lookupModel(ev.session_id);
          json(res, { ok: true });
        } catch { json(res, { ok: false }, 400); }
      });
      return;
    }
    if (req.method !== "GET") { res.writeHead(405); res.end(); return; }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(fs.readFileSync(UI_PATH)); return;
    }
    if (url.pathname === "/api/info") return json(res, { name: "Claude Code", send: false, sendReason: SEND_REASON, offlineHint: "¿está corriendo el canvas? usá /agent-canvas:open en Claude Code", liveOutput: false });
    if (url.pathname === "/api/stats") { const d = statsPayload(url.searchParams.get("id") || ""); return d ? json(res, d) : json(res, { error: "nodo no encontrado" }, 404); }
    if (url.pathname === "/api/health") return json(res, { ok: true, sessions: state.listSessions().filter((n) => !n.parentID).length });
    if (url.pathname === "/api/sessions") return json(res, { now: Date.now(), sessions: state.listSessions() });
    if (url.pathname === "/api/messages") return json(res, state.messages(url.searchParams.get("id") || ""));
    if (url.pathname === "/api/tool") {
      const d = state.toolDetail(url.searchParams.get("id") || "", url.searchParams.get("pid") || "");
      return d ? json(res, d) : json(res, { error: "tool no encontrada" }, 404);
    }
    res.writeHead(404); res.end("not found");
  } catch (e) { json(res, { error: String((e && e.message) || e) }, 500); }
});

server.on("error", (e) => { process.exit(e && e.code === "EADDRINUSE" ? 0 : 1); }); // otro servidor ya está corriendo
server.listen(PORT, "127.0.0.1", () => {
  try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch { /* opcional */ }
  if (process.stdout.isTTY) console.log(`agent-canvas en http://127.0.0.1:${PORT}`);
});
const bye = () => { try { fs.unlinkSync(PID_FILE); } catch { /* ya no está */ } process.exit(0); };
process.on("SIGINT", bye); process.on("SIGTERM", bye);
