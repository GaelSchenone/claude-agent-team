// Convierte los eventos de hooks de Claude Code en el estado que consume la UI del canvas.
// Los hooks asíncronos son procesos separados: los eventos pueden llegar fuera de orden
// (por ejemplo, el "fin" de una tool antes que su "inicio"), así que cada transición es tolerante.
import path from "node:path";

const LIM = { field: 20_000, out: 200_000, diff: 100_000, items: 1_500, sessions: 40 };
const STALE_MS = 15 * 60 * 1000;

const NORM = {
  Bash: "bash", Read: "read", Write: "write", Edit: "edit", MultiEdit: "edit", NotebookEdit: "edit",
  Grep: "grep", Glob: "glob", WebFetch: "webfetch", WebSearch: "websearch",
  Agent: "task", Task: "task", TodoWrite: "todowrite", Skill: "skill",
};
export const toolName = (n) => NORM[n] || String(n || "tool").replace(/^mcp__/, "").toLowerCase();
const shortName = (s) => String(s || "").split(":").pop();

function cap(s, n, tail = false) {
  const str = typeof s === "string" ? s : s == null ? "" : String(s);
  if (str.length <= n) return { text: str, cut: false };
  return { text: tail ? str.slice(str.length - n) : str.slice(0, n), cut: true };
}

// Claves de Claude Code -> claves que entiende la UI (mismas que usa el canvas de OpenCode).
const KEYMAP = { file_path: "filePath", notebook_path: "filePath", old_string: "oldString", new_string: "newString" };
export function normInput(tool, input) {
  const out = {}; let cut = false;
  for (const [k0, v] of Object.entries(input || {})) {
    let k = KEYMAP[k0] || k0;
    if (tool === "grep" && k === "glob") k = "include";
    if (typeof v === "string") { const c = cap(v, LIM.field); out[k] = c.text; cut = cut || c.cut; }
    else {
      const s = JSON.stringify(v ?? null);
      if (s.length > LIM.field) { out[k] = s.slice(0, LIM.field); cut = true; } else out[k] = v;
    }
  }
  return { input: out, cut };
}

export function argOf(tool, inp) {
  let a = "";
  if (tool === "bash") a = inp.command || "";
  else if (tool === "read" || tool === "write" || tool === "edit") a = inp.filePath || inp.path || "";
  else if (tool === "grep" || tool === "glob") a = inp.pattern || "";
  else if (tool === "webfetch") a = inp.url || "";
  else if (tool === "websearch") a = inp.query || "";
  else if (tool === "skill") a = inp.skill || "";
  else if (tool === "task") a = [shortName(inp.subagent_type), inp.description].filter(Boolean).join(" · ");
  else { try { a = JSON.stringify(inp); } catch { a = ""; } }
  return String(a).replace(/\s+/g, " ").slice(0, 200);
}

export function outputOf(resp) {
  if (resp == null) return "";
  if (typeof resp === "string") return resp;
  if (typeof resp.stdout === "string" || typeof resp.stderr === "string") {
    return [resp.stdout, resp.stderr].filter((x) => x).join(resp.stdout && resp.stderr ? "\n" : "");
  }
  if (resp.file && typeof resp.file.content === "string") return resp.file.content;
  if (Array.isArray(resp.content)) return resp.content.map((c) => (c && (c.text || "")) || "").join("\n");
  for (const k of ["content", "text", "output", "result", "message"]) if (typeof resp[k] === "string") return resp[k];
  try { return JSON.stringify(resp, null, 2); } catch { return String(resp); }
}

function diffOf(inp) {
  const edits = Array.isArray(inp.edits) ? inp.edits : inp.oldString != null && inp.newString != null ? [inp] : [];
  if (!edits.length) return "";
  const head = `--- ${inp.filePath || ""}\n+++ ${inp.filePath || ""}\n`;
  return head + edits.map((e) =>
    "@@ cambio @@\n" + String(e.oldString ?? e.old_string ?? "").split("\n").map((l) => "-" + l).join("\n") + "\n" +
    String(e.newString ?? e.new_string ?? "").split("\n").map((l) => "+" + l).join("\n")).join("\n");
}

export function createState(opts = {}) {
  const now = opts.now || Date.now;
  const sessions = new Map();     // session_id -> S
  const agentIndex = new Map();   // agent_id -> S

  function getSess(id, ev, t) {
    let S = sessions.get(id);
    if (!S) {
      S = { id, cwd: ev.cwd || "", created: t, updated: t, title: "", firstPrompt: "", model: null, rootAgent: "claude", turnTs: 0, todos: [],
        turnBusy: false, failed: false, ended: false, items: [], tools: new Map(), agents: new Map(), transcript: ev.transcript_path || null };
      sessions.set(id, S);
      prune();
    }
    return S;
  }
  function prune() {
    if (sessions.size <= LIM.sessions) return;
    const old = [...sessions.values()].sort((a, b) => a.updated - b.updated);
    while (sessions.size > LIM.sessions && old.length) {
      const s = old.shift();
      for (const id of s.agents.keys()) agentIndex.delete(id);
      sessions.delete(s.id);
    }
  }
  function agentFor(S, id, type, t) {
    let A = S.agents.get(id);
    if (!A) {
      A = { id, type: type || "agent", created: t, updated: t, parent: S.id, done: false, stopped: false, items: [], model: null, title: "", lastMsg: "", effort: null, todos: [], runStats: null };
      S.agents.set(id, A); agentIndex.set(id, S);
    } else if (type && (!A.type || A.type === "agent")) A.type = type;
    return A;
  }
  const push = (node, item, t) => {
    item._ts = t;
    const a = node.items; a.push(item);
    for (let i = a.length - 1; i > 0 && (a[i - 1]._ts || 0) > (a[i]._ts || 0); i--) [a[i - 1], a[i]] = [a[i], a[i - 1]];
    if (a.length > LIM.items) a.splice(0, a.length - LIM.items);
    return item;
  };
  // Las transiciones de turno se deciden por la marca de tiempo del evento, no por el orden de llegada.
  const turn = (S, t, fn) => { if (t >= S.turnTs) { S.turnTs = t; fn(); } };

  function ensureTool(S, node, ev, t) {
    const id = ev.tool_use_id;
    if (!id) return null;
    let T = S.tools.get(id);
    if (!T) {
      const tool = toolName(ev.tool_name);
      const n = normInput(tool, ev.tool_input);
      T = { id, raw: ev.tool_name, tool, node: node.id, input: n.input, inputCut: n.cut, status: "running", startedAt: t, endedAt: null,
        output: "", outCut: false, error: "", diff: "", agentLink: null, asyncLaunched: false, stats: null, item: null };
      T.item = push(node, { kind: "tool", who: node === S ? shortName(S.rootAgent) : shortName(node.type), tool, status: "running",
        arg: argOf(tool, n.input), title: "", pid: id, mid: "m" }, t);
      S.tools.set(id, T);
      applyTodos(node, T);
    } else if (!Object.keys(T.input).length && ev.tool_input) {
      const n = normInput(T.tool, ev.tool_input); T.input = n.input; T.inputCut = n.cut; T.item.arg = argOf(T.tool, n.input);
      applyTodos(node, T);
    }
    return T;
  }
  // La lista de tareas se arma de tres formas según la versión de Claude Code:
  // TodoWrite (viejo) manda la lista completa; TaskCreate/TaskUpdate (nuevo) la van armando de a una.
  function applyTodos(node, T) {
    if (T.tool === "todowrite" && Array.isArray(T.input.todos)) {
      const todos = T.input.todos.map((x) => ({ content: String((x && (x.content || x.subject)) || ""), status: String((x && x.status) || "pending") }));
      T.item.todos = todos; T.item.arg = `${todos.length} tareas`;
      if (!node.todosTs || T.startedAt >= node.todosTs) { node.todos = todos; node.todosTs = T.startedAt; }
      return;
    }
    if (T.tool === "taskcreate") {
      const subject = String(T.input.subject || "").trim();
      if (!subject) return;
      if (!T.todoKey) {
        T.todoKey = `tmp:${T.id}`;
        node.todos = [...(node.todos || []), { id: T.todoKey, content: subject, status: "pending" }];
      }
      T.item.todos = (node.todos || []).map((x) => ({ content: x.content, status: x.status }));
      T.item.arg = subject;
      return;
    }
    if (T.tool === "taskupdate") {
      const id = T.input.taskId == null ? "" : String(T.input.taskId);
      const status = String(T.input.status || "");
      if (!id) return;
      const list = node.todos || [];
      const found = list.find((x) => String(x.id) === id);
      if (found) {
        if (status && status !== "deleted") found.status = status;
        if (T.input.subject) found.content = String(T.input.subject);
      }
      if (status === "deleted") node.todos = list.filter((x) => String(x.id) !== id);
      T.item.todos = (node.todos || []).map((x) => ({ content: x.content, status: x.status }));
      T.item.arg = `#${id} → ${status || "actualizada"}`;
    }
  }
  // TaskCreate responde "Task #N created successfully": ese número es el id que usa TaskUpdate.
  function syncTaskId(node, T) {
    if (T.tool !== "taskcreate" || !T.todoKey) return;
    const m = /Task #(\d+)/.exec(T.output || "");
    if (!m) return;
    const real = m[1];
    node.todos = (node.todos || []).map((x) => (x.id === T.todoKey ? { ...x, id: real } : x));
    T.todoKey = null;
    if (T.item) T.item.todos = node.todos.map((x) => ({ content: x.content, status: x.status }));
  }
  function finish(T, status, t) {
    T.status = status; T.endedAt = T.endedAt || t; if (T.item) T.item.status = status;
  }
  function linkAgent(S, node, T, resp, t) {
    const aid = resp.agentId; if (!aid) return;
    const A = agentFor(S, aid, resp.agentType || T.input.subagent_type, t);
    A.parent = node.id;
    A.title = T.input.description || shortName(A.type);
    if (resp.resolvedModel) A.model = resp.resolvedModel;
    if (resp.totalTokens != null) A.runStats = { tokens: resp.totalTokens, ms: resp.totalDurationMs, tools: resp.totalToolUseCount };
    if (T.input.prompt && !A.items.some((i) => i.kind === "user")) push(A, { kind: "user", who: "orquestador", text: T.input.prompt }, A.created - 1);
    T.agentLink = aid;
    if (A.stopped && T.status === "running") { T.output = A.lastMsg; finish(T, "completed", t); }
  }

  function ingest(ev) {
    const sid = ev && ev.session_id; if (!sid) return;
    const t = typeof ev._ts === "number" ? ev._ts : now();
    const S = getSess(sid, ev, t);
    S.updated = Math.max(S.updated, t);
    if (ev.cwd && !S.cwd) S.cwd = ev.cwd;
    if (ev.transcript_path && !S.transcript) S.transcript = ev.transcript_path;
    const aid = ev.agent_id || null;
    if (!aid && ev.agent_type) S.rootAgent = ev.agent_type;
    const node = aid ? agentFor(S, aid, ev.agent_type, t) : S;
    if (aid) node.updated = Math.max(node.updated, t);
    if (ev.effort && ev.effort.level && aid) node.effort = ev.effort.level;

    switch (ev.hook_event_name) {
      case "SessionStart":
        if (ev.model) S.model = ev.model;
        break;
      case "UserPromptSubmit": {
        const p = String(ev.prompt || "");
        turn(S, t, () => { S.turnBusy = true; S.failed = false; S.ended = false; });
        if (p.startsWith("<task-notification>")) break;
        if (!S.firstPrompt) { S.firstPrompt = p.replace(/\s+/g, " ").slice(0, 60); }
        push(S, { kind: "user", who: "vos", text: cap(p, LIM.field).text }, t);
        break;
      }
      case "PreToolUse": ensureTool(S, node, ev, t); break;
      case "PostToolUse": {
        const T = ensureTool(S, node, ev, t); if (!T) break;
        const resp = ev.tool_response;
        if (T.tool === "task" && resp && typeof resp === "object") {
          linkAgent(S, node, T, resp, t);
          if (resp.status === "async_launched" || resp.isAsync) { T.asyncLaunched = true; break; }
          const o = cap(outputOf(resp), LIM.out); T.output = o.text; T.outCut = o.cut;
          T.stats = { tokens: resp.totalTokens, ms: resp.totalDurationMs, tools: resp.totalToolUseCount };
          finish(T, "completed", t); break;
        }
        if (T.status === "error") break;
        const o = cap(outputOf(resp), LIM.out, T.tool === "bash"); T.output = o.text; T.outCut = o.cut;
        if (T.tool === "edit") T.diff = cap(diffOf(T.input), LIM.diff).text;
        syncTaskId(node, T);
        finish(T, "completed", t);
        break;
      }
      case "PostToolUseFailure": {
        const T = ensureTool(S, node, ev, t); if (!T) break;
        T.error = String(ev.error || "error");
        if (T.tool === "taskcreate" && T.todoKey) { node.todos = (node.todos || []).filter((x) => x.id !== T.todoKey); T.todoKey = null; }
        finish(T, "error", t);
        break;
      }
      case "SubagentStart": {
        const A = agentFor(S, ev.agent_id, ev.agent_type, t);
        if (!A.stopped) A.done = false;
        break;
      }
      case "SubagentStop": {
        const A = agentFor(S, ev.agent_id, ev.agent_type, t);
        A.stopped = true; A.done = true; A.updated = Math.max(A.updated, t);
        const last = String(ev.last_assistant_message || "");
        if (last) { A.lastMsg = cap(last, LIM.out).text; push(A, { kind: "assistant", who: shortName(A.type), text: A.lastMsg, completed: true }, t); }
        if (ev.agent_transcript_path) A.transcript = ev.agent_transcript_path;
        for (const T of S.tools.values()) if (T.agentLink === A.id && T.status === "running") { T.output = A.lastMsg; finish(T, "completed", t); }
        break;
      }
      case "Stop": {
        turn(S, t, () => { S.turnBusy = false; });
        const last = String(ev.last_assistant_message || "");
        if (last) push(S, { kind: "assistant", who: shortName(S.rootAgent), text: cap(last, LIM.out).text, completed: true }, t);
        break;
      }
      case "StopFailure": turn(S, t, () => { S.turnBusy = false; S.failed = true; }); break;
      case "SessionEnd": turn(S, t, () => { S.turnBusy = false; S.ended = true; }); break;
      default: break;
    }
  }

  const stale = (n) => now() - n.updated > STALE_MS;
  function rootStatus(S) {
    if (S.failed) return "error";
    if (S.ended) return "done";
    const kidsBusy = [...S.agents.values()].some((a) => !a.done && !stale(a));
    return (S.turnBusy && !stale(S)) || kidsBusy ? "busy" : "idle";
  }
  function currentTool(S, node) {
    let t = null, async = false;
    for (const T of S.tools.values()) {
      if (T.node !== node.id || T.status !== "running") continue;
      if (T.asyncLaunched) { async = true; continue; }
      t = T.tool;
    }
    return t || (async ? "esperando agentes" : null);
  }

  function listSessions() {
    const out = [];
    for (const S of sessions.values()) {
      const status = rootStatus(S);
      const base = path.basename(S.cwd || "") || "sesión";
      out.push({ id: S.id, parentID: null, title: base + (S.firstPrompt ? " · " + S.firstPrompt.slice(0, 40) : ""),
        created: S.created, updated: S.updated, agent: shortName(S.rootAgent), model: S.model, provider: null,
        status, tool: status === "busy" ? currentTool(S, S) : null });
      for (const A of S.agents.values()) {
        const parentOk = A.parent === S.id || S.agents.has(A.parent);
        const st = A.done ? "done" : stale(A) ? "idle" : "busy";
        out.push({ id: A.id, parentID: parentOk ? A.parent : S.id, title: A.title || shortName(A.type), created: A.created,
          updated: A.updated, agent: shortName(A.type), model: A.model, provider: null, status: st,
          tool: st === "busy" ? currentTool(S, A) : null, effort: A.effort });
      }
    }
    return out;
  }

  function nodeOf(id) { const S = sessions.get(id); if (S) return [S, S]; const S2 = agentIndex.get(id); return S2 ? [S2, S2.agents.get(id)] : [null, null]; }
  function messages(id) {
    const [S, node] = nodeOf(id);
    if (!node) return { items: [], busy: false, status: "idle" };
    const status = node === S ? rootStatus(S) : node.done ? "done" : "busy";
    return { items: node.items.slice(), busy: status === "busy", status };
  }
  function toolDetail(nodeId, pid) {
    const [S] = nodeOf(nodeId); if (!S) return null;
    const T = S.tools.get(pid); if (!T) return null;
    let output = T.output;
    if (T.tool === "task" && T.stats) output += `\n\n— ${T.stats.tokens ?? "?"} tokens · ${T.stats.ms != null ? (T.stats.ms / 1000).toFixed(1) + " s" : "?"} · ${T.stats.tools ?? "?"} herramientas`;
    return { tool: T.tool, status: T.status, title: T.item ? T.item.arg : "", input: T.input, output, error: T.error, exit: null,
      todos: T.item && Array.isArray(T.item.todos) ? T.item.todos : null,
      diff: T.diff, sessionId: T.agentLink, time: { start: T.startedAt, end: T.endedAt }, truncated: T.outCut,
      inputTruncated: T.inputCut, noLive: true, now: now() };
  }
  function transcriptOfNode(id) {
    const [S, node] = nodeOf(id); if (!S || !node) return null;
    if (node === S) return S.transcript;
    if (node.transcript) return node.transcript;
    return S.transcript ? path.join(path.dirname(S.transcript), S.id, "subagents", `agent-${node.id}.jsonl`) : null;
  }
  function statsBase(id) {
    const [S, node] = nodeOf(id); if (!node) return null;
    const lines = [], isRoot = node === S;
    const type = isRoot ? S.rootAgent : node.type;
    if (type) lines.push(`agente: ${shortName(type)}`);
    const model = isRoot ? S.model : node.model; if (model) lines.push(`modelo: ${model}`);
    if (node.effort) lines.push(`esfuerzo: ${node.effort}`);
    if (!isRoot && node.runStats) {
      const r = node.runStats;
      lines.push(`${r.tokens ?? "?"} tokens en total`, `${r.ms != null ? (r.ms / 1000).toFixed(1) + " s" : "?"} de ejecución`, `${r.tools ?? "?"} herramientas usadas`);
    }
    const items = node.items;
    return { todos: node.todos || [], counts: { tools: items.filter((i) => i.kind === "tool").length, messages: items.filter((i) => i.kind !== "tool").length }, lines, isRoot };
  }
  function setModel(sid, model) { const S = sessions.get(sid); if (S && model && !S.model) S.model = model; }
  function needsModel(sid) { const S = sessions.get(sid); return !!S && !S.model && !!S.transcript; }
  function transcriptOf(sid) { return transcriptOfNode(sid); }
  return { ingest, listSessions, messages, toolDetail, statsBase, setModel, needsModel, transcriptOf, _sessions: sessions };
}
