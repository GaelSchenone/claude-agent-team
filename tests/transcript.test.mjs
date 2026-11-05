import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { transcriptStats, _clear } from "../plugins/agent-canvas/canvas/transcript.mjs";

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ac-")), "t.jsonl");
const asst = (inp, out, cr, cw, model = "claude-haiku-5-5") => JSON.stringify({ type: "assistant", message: { model, usage: { input_tokens: inp, output_tokens: out, cache_read_input_tokens: cr, cache_creation_input_tokens: cw } } }) + "\n";
const cost = (c) => JSON.stringify({ type: "cost-state", totalCostUSD: c }) + "\n";

test("suma la salida, toma el contexto de la última respuesta y el costo del último cost-state", () => {
  _clear(); const f = tmp();
  fs.writeFileSync(f, asst(2, 100, 1000, 50) + JSON.stringify({ type: "user", message: {} }) + "\n" + asst(3, 200, 1500, 20) + cost(0.0123));
  const s = transcriptStats(f);
  assert.equal(s.contextTokens, 3 + 200 + 1500 + 20);
  assert.equal(s.outputTokens, 300);
  assert.equal(s.turns, 2);
  assert.equal(s.cost, 0.0123);
  assert.equal(s.model, "claude-haiku-5-5");
});

test("es incremental: solo lee lo nuevo y no cuenta dos veces", () => {
  _clear(); const f = tmp();
  fs.writeFileSync(f, asst(1, 10, 0, 0));
  assert.equal(transcriptStats(f).outputTokens, 10);
  assert.equal(transcriptStats(f).outputTokens, 10, "releer sin cambios no suma de nuevo");
  fs.appendFileSync(f, asst(1, 5, 0, 0) + cost(0.5));
  const s = transcriptStats(f);
  assert.equal(s.outputTokens, 15); assert.equal(s.cost, 0.5);
});

test("una línea escrita a medias se completa en la consulta siguiente", () => {
  _clear(); const f = tmp(); const line = asst(1, 7, 0, 0);
  fs.writeFileSync(f, line.slice(0, 40));
  assert.equal(transcriptStats(f).turns, 0, "todavía no hay línea completa");
  fs.appendFileSync(f, line.slice(40));
  assert.equal(transcriptStats(f).outputTokens, 7);
});

test("archivo inexistente, vacío o con basura no rompe", () => {
  _clear();
  assert.equal(transcriptStats("/no/existe.jsonl"), null);
  assert.equal(transcriptStats(null), null);
  const f = tmp(); fs.writeFileSync(f, "esto no es json\n{rota\n" + asst(1, 3, 0, 0));
  assert.equal(transcriptStats(f).outputTokens, 3);
});

test("si el archivo se reescribe más corto, se vuelve a empezar", () => {
  _clear(); const f = tmp();
  fs.writeFileSync(f, asst(1, 100, 0, 0) + asst(1, 100, 0, 0));
  assert.equal(transcriptStats(f).outputTokens, 200);
  fs.writeFileSync(f, asst(1, 9, 0, 0));
  assert.equal(transcriptStats(f).outputTokens, 9);
});
