// Lector incremental del transcript de Claude Code (archivo .jsonl local).
// Solo lee los bytes nuevos desde la última consulta, así que consultar cada 2 segundos es barato aun con transcripts grandes.
import fs from "node:fs";

const MAX_FIRST_READ = 32 * 1024 * 1024; // si el archivo ya es enorme, se ignora lo más viejo
const cache = new Map();

const fresh = () => ({ off: 0, ctx: null, out: 0, turns: 0, cost: null, model: null, partial: false });

export function transcriptStats(file) {
  if (!file) return null;
  let size;
  try { size = fs.statSync(file).size; } catch { return null; }
  let c = cache.get(file) || fresh();
  if (size < c.off) c = fresh(); // el archivo se rehízo
  if (size > c.off) {
    let start = c.off;
    if (size - start > MAX_FIRST_READ) { start = size - MAX_FIRST_READ; c.partial = true; c.off = start; }
    const len = size - start;
    const buf = Buffer.alloc(len);
    let fd;
    try { fd = fs.openSync(file, "r"); fs.readSync(fd, buf, 0, len, start); } catch { return snapshot(c); } finally { if (fd != null) try { fs.closeSync(fd); } catch { /* ya cerrado */ } }
    const last = buf.lastIndexOf(0x0a);
    if (last >= 0) {
      for (const line of buf.subarray(0, last).toString("utf8").split("\n")) {
        if (!line) continue;
        let d; try { d = JSON.parse(line); } catch { continue; }
        if (d.type === "assistant" && d.message && d.message.usage) {
          const u = d.message.usage;
          c.ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
          c.out += u.output_tokens || 0; c.turns++;
          if (d.message.model && !String(d.message.model).startsWith("<")) c.model = d.message.model;
        } else if (d.type === "cost-state" && typeof d.totalCostUSD === "number") {
          c.cost = d.totalCostUSD;
        }
      }
      c.off = start + last + 1; // la línea incompleta del final se lee en la próxima consulta
    }
  }
  cache.set(file, c);
  return snapshot(c);
}
const snapshot = (c) => ({ contextTokens: c.ctx, outputTokens: c.out, turns: c.turns, cost: c.cost, model: c.model, partial: c.partial });
export const _clear = () => cache.clear();
