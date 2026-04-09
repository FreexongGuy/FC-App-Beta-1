const http = require("http");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { URL } = require("url");

// Zero-dependency server to avoid slow `npm install`.
// Loads env from server/.env if present.
const ENV_PATH = path.join(__dirname, ".env");
if (fs.existsSync(ENV_PATH)) {
  try {
    const raw = fs.readFileSync(ENV_PATH, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ignore
  }
}

const PORT = Number(process.env.PORT) || 3000;
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "gpt-5").trim();
const LLM_PROVIDER = String(process.env.LLM_PROVIDER || "").trim().toLowerCase(); // "openai" | "ollama"
const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim();
const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || "llama3.1:8b-instruct").trim();
const SITE_ROOT = path.join(__dirname, "..");
const KNOWLEDGE_PATH = path.join(__dirname, "knowledge.json");

function clampText(value, maxLen) {
  const s = String(value || "").trim();
  return maxLen ? s.slice(0, Math.max(0, maxLen)) : s;
}

function extractOpenAIOutputText(data) {
  if (data && typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  const out = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c.text === "string") out.push(c.text);
    }
  }
  return out.join("\n").trim();
}

function tokenize(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((w) => w.length >= 3)
    .slice(0, 140);
}

function scoreOverlap(queryTokens, docText) {
  const docTokens = new Set(tokenize(docText));
  let score = 0;
  for (const t of queryTokens) if (docTokens.has(t)) score += 1;
  return score;
}

let knowledgeCache = null;
async function loadKnowledge() {
  if (knowledgeCache) return knowledgeCache;
  try {
    const raw = await fsp.readFile(KNOWLEDGE_PATH, "utf8");
    const v = JSON.parse(raw);
    const items = Array.isArray(v?.items) ? v.items : [];
    knowledgeCache = { items };
    return knowledgeCache;
  } catch {
    knowledgeCache = { items: [] };
    return knowledgeCache;
  }
}

async function saveKnowledge(next) {
  knowledgeCache = next;
  const tmp = KNOWLEDGE_PATH + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fsp.rename(tmp, KNOWLEDGE_PATH);
}

async function getTopKnowledgeSnippets(prompt, limit = 8) {
  const kb = await loadKnowledge();
  const qTokens = tokenize(prompt);
  if (qTokens.length === 0) return [];

  const scored = [];
  for (const item of kb.items) {
    const text = typeof item?.text === "string" ? item.text : "";
    const author = typeof item?.author === "string" ? item.author : "unknown";
    if (!text) continue;
    scored.push({ text, author, score: scoreOverlap(qTokens, text) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((x) => x.score >= 2).slice(0, limit);
}

async function callOpenAI({ prompt, username }) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY. Set it in server/.env (not committed).");
  }

  const instructions =
    "You are FCBot for FC App. Be concise, helpful, and safe.\n" +
    "Use the provided knowledge as ground truth when relevant.\n" +
    "If asked for illegal, unsafe, or abusive content, refuse.\n" +
    "If you are unsure, say you are unsure.\n";

  const snippets = await getTopKnowledgeSnippets(prompt, 10);
  const context =
    snippets.length === 0
      ? "(No local knowledge matches found yet.)"
      : snippets.map((s, i) => `#${i + 1} (by ${s.author}):\n${s.text}`).join("\n\n");

  const userPrompt =
    `User: ${clampText(username, 60) || "unknown"}\n\n` +
    `Knowledge:\n${context}\n\n` +
    `Question:\n${clampText(prompt, 1200)}\n\n` +
    "Answer:";

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: "low" },
      max_output_tokens: 800,
      instructions,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI API error (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  return extractOpenAIOutputText(data);
}

async function callOllama({ prompt, username }) {
  const instructions =
    "You are FCBot for FC App. Be concise, helpful, and safe.\n" +
    "Use the provided knowledge as ground truth when relevant.\n" +
    "If asked for illegal, unsafe, or abusive content, refuse.\n" +
    "If you are unsure, say you are unsure.\n";

  const snippets = await getTopKnowledgeSnippets(prompt, 10);
  const context =
    snippets.length === 0
      ? "(No local knowledge matches found yet.)"
      : snippets.map((s, i) => `#${i + 1} (by ${s.author}):\n${s.text}`).join("\n\n");

  const userPrompt =
    `User: ${clampText(username, 60) || "unknown"}\n\n` +
    `Knowledge:\n${context}\n\n` +
    `Question:\n${clampText(prompt, 1200)}\n\n` +
    "Answer:";

  const url = new URL("/api/chat", OLLAMA_BASE_URL).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: userPrompt },
      ],
      options: {
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama API error (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = await res.json().catch(() => ({}));
  const out = data?.message?.content;
  return typeof out === "string" ? out : "";
}

async function callLLM({ prompt, username }) {
  // Preference:
  // - If explicitly set, use it.
  // - Else if OPENAI_API_KEY exists, use OpenAI.
  // - Else use Ollama (local model).
  const provider = LLM_PROVIDER || (OPENAI_API_KEY ? "openai" : "ollama");
  if (provider === "ollama") return callOllama({ prompt, username });
  return callOpenAI({ prompt, username });
}

// Minimal in-memory rate limit (per IP)
const ipWindow = new Map(); // ip -> { ts, count }
function allowIp(ip) {
  const now = Date.now();
  const winMs = 15_000;
  const max = 6;
  const cur = ipWindow.get(ip) || { ts: now, count: 0 };
  if (now - cur.ts > winMs) {
    cur.ts = now;
    cur.count = 0;
  }
  cur.count += 1;
  ipWindow.set(ip, cur);
  return cur.count <= max;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj || {});
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(String(text || ""));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  return "application/octet-stream";
}

function safeResolveSitePath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname || "/");
  const clean = decoded.split("?")[0].split("#")[0];
  const rel = clean === "/" ? "/index.html" : clean;
  const resolved = path.join(SITE_ROOT, rel);
  // Prevent path traversal
  if (!resolved.startsWith(SITE_ROOT)) return null;
  return resolved;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname || "/";

    // API: bot
    if (pathname === "/api/bot") {
      const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "local";
      if (!allowIp(ip)) return sendJson(res, 429, { error: "Too many requests. Try again in a few seconds." });
      if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

      const body = await readJsonBody(req);
      if (body === null) return sendJson(res, 400, { error: "Invalid JSON" });

      const prompt = clampText(body?.prompt, 1200);
      const username = clampText(body?.username, 60);
      if (!prompt || prompt.length < 2) return sendJson(res, 400, { error: "Missing prompt" });

      const text = await callLLM({ prompt, username });
      return sendJson(res, 200, { text: clampText(text, 4000) || "No reply." });
    }

    if (pathname === "/api/bot/status") {
      const provider = LLM_PROVIDER || (OPENAI_API_KEY ? "openai" : "ollama");
      return sendJson(res, 200, {
        ok: true,
        provider,
        openaiModel: OPENAI_MODEL,
        ollamaModel: OLLAMA_MODEL,
        ollamaBaseUrl: OLLAMA_BASE_URL,
      });
    }

    // API: teach (persist local knowledge)
    if (pathname === "/api/teach") {
      const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "local";
      if (!allowIp(ip)) return sendJson(res, 429, { error: "Too many requests. Try again in a few seconds." });
      if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

      const body = await readJsonBody(req);
      if (body === null) return sendJson(res, 400, { error: "Invalid JSON" });

      const text = clampText(body?.text, 2000);
      const author = clampText(body?.author, 60) || "unknown";
      if (!text || text.length < 8) return sendJson(res, 400, { error: "Teach text too short" });

      const kb = await loadKnowledge();
      const next = {
        items: [
          ...kb.items,
          {
            text,
            author,
            ts: Date.now(),
          },
        ].slice(-1200),
      };
      await saveKnowledge(next);
      return sendJson(res, 200, { ok: true });
    }

    // Static files
    const filePath = safeResolveSitePath(pathname);
    if (!filePath) return sendText(res, 400, "Bad path");

    let target = filePath;
    try {
      const st = await fsp.stat(target);
      if (st.isDirectory()) target = path.join(target, "index.html");
    } catch {
      // Fallback to index.html for unknown routes (keeps deep links working locally)
      target = path.join(SITE_ROOT, "index.html");
    }

    const data = await fsp.readFile(target);
    res.writeHead(200, {
      "content-type": contentTypeFor(target),
      "cache-control": target.endsWith(".html") ? "no-store" : "public, max-age=60",
    });
    res.end(data);
  } catch (err) {
    sendJson(res, 500, { error: err?.message || String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`FC-App server running on http://localhost:${PORT}`);
  const provider = LLM_PROVIDER || (OPENAI_API_KEY ? "openai" : "ollama");
  console.log(`Bot provider: ${provider}`);
  if (provider === "openai" && !OPENAI_API_KEY) {
    console.log("Warning: OPENAI_API_KEY is not set. /api/bot will fail until you set server/.env");
  }
});
