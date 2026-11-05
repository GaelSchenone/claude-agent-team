#!/usr/bin/env node
// Reenvía el evento de un hook de Claude Code al servidor local del canvas.
// Es silencioso a propósito: si el canvas no está corriendo, no hace nada ni molesta a la sesión.
// Con AGENT_CANVAS_AUTOSTART=1 levanta el servidor la primera vez que no lo encuentra.
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.AGENT_CANVAS_PORT || 7789);
const here = path.dirname(fileURLToPath(import.meta.url));

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", async () => {
  let ev;
  try { ev = JSON.parse(raw); } catch { process.exit(0); }
  ev._ts = Date.now(); // marca propia: los hooks son procesos separados y pueden llegar desordenados
  const body = JSON.stringify(ev);
  const send = () => new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, path: "/event", method: "POST", timeout: 1500,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
    (r) => { r.resume(); r.on("end", () => resolve(true)); });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end(body);
  });
  if (!(await send()) && process.env.AGENT_CANVAS_AUTOSTART === "1") {
    spawn(process.execPath, [path.join(here, "..", "canvas", "server.mjs")], { detached: true, stdio: "ignore", env: process.env }).unref();
    await new Promise((r) => setTimeout(r, 600));
    await send();
  }
  process.exit(0);
});
