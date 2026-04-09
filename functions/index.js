const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { defineSecret } = require("firebase-functions/params");
const { onValueCreated } = require("firebase-functions/v2/database");

admin.initializeApp();

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

function clampText(value, maxLen) {
  const s = String(value || "").trim();
  return maxLen ? s.slice(0, Math.max(0, maxLen)) : s;
}

function tokenize(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((w) => w.length >= 3)
    .slice(0, 120);
}

function scoreOverlap(queryTokens, docText) {
  const docTokens = new Set(tokenize(docText));
  let score = 0;
  for (const t of queryTokens) if (docTokens.has(t)) score += 1;
  return score;
}

async function getTopKnowledgeSnippets(prompt, limit = 8) {
  const qTokens = tokenize(prompt);
  if (qTokens.length === 0) return [];

  // Preferred path: `knowledge/items` (same top-level area as `users`, `messages`, `announcements`, etc.)
  // Back-compat path: `bot_knowledge/items` (older builds)
  const [snapNew, snapOld] = await Promise.all([
    admin.database().ref("knowledge/items").limitToLast(250).get(),
    admin.database().ref("bot_knowledge/items").limitToLast(250).get(),
  ]);

  const items = [];
  function ingestSnap(snap, prefix) {
    if (!snap || !snap.exists()) return;
    snap.forEach((child) => {
      const v = child.val() || {};
      const text = typeof v.text === "string" ? v.text : "";
      const author = typeof v.author === "string" ? v.author : "unknown";
      if (!text) return;
      items.push({
        id: `${prefix}${child.key || ""}`,
        author,
        text,
        ts: v.ts || null,
        score: scoreOverlap(qTokens, text),
      });
    });
  }

  ingestSnap(snapNew, "k:");
  ingestSnap(snapOld, "b:");

  items.sort((a, b) => b.score - a.score);
  const picked = items.filter((x) => x.score >= 2).slice(0, limit);
  return picked;
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

async function callOpenAI({ apiKey, model, instructions, userPrompt }) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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

exports.llmBot = onValueCreated(
  {
    ref: "/bot_requests/{requestId}",
    region: "us-central1",
    secrets: [OPENAI_API_KEY],
  },
  async (event) => {
    const requestId = event.params.requestId;
    const reqRef = admin.database().ref(`bot_requests/${requestId}`);

    const payload = event.data.val() || {};
    const prompt = clampText(payload.prompt, 800);
    const author = clampText(payload.author, 60) || "unknown";

    if (!prompt) {
      await reqRef.child("response").set({
        text: "Missing prompt.",
        status: "error",
        ts: admin.database.ServerValue.TIMESTAMP,
      });
      return;
    }

    // Idempotency: if response already exists, do nothing.
    const existing = await reqRef.child("response").get();
    if (existing.exists()) return;

    await reqRef.update({
      status: "running",
      startedAt: admin.database.ServerValue.TIMESTAMP,
    });

    try {
      const apiKey = OPENAI_API_KEY.value();
      const configSnap = await admin.database().ref("bot_config").get();
      const config = configSnap.exists() ? configSnap.val() || {} : {};
      const requestedModel = typeof payload.model === "string" ? payload.model : "";
      const configModel = typeof config.model === "string" ? config.model : "";
      const model = clampText(requestedModel || configModel || "gpt-5", 64);

      const snippets = await getTopKnowledgeSnippets(prompt, 10);
      const context =
        snippets.length === 0
          ? "(No shared knowledge matches found yet.)"
          : snippets
              .map((s, idx) => `#${idx + 1} (by ${s.author}):\n${s.text}`)
              .join("\n\n");

      const instructions =
        "You are FCBot for FC App. Be concise, helpful, and safe.\n" +
        "If shared knowledge is provided, use it as ground truth when relevant.\n" +
        "If the user asks for illegal, unsafe, or abusive content, refuse.\n" +
        "If you are unsure, say you are unsure.\n";

      const userPrompt =
        `User: ${author}\n\n` +
        `Shared knowledge:\n${context}\n\n` +
        `Question:\n${prompt}\n\n` +
        "Answer:";

      const reply = await callOpenAI({ apiKey, model, instructions, userPrompt });

      await reqRef.child("response").set({
        text: clampText(reply, 4000) || "No reply.",
        status: "ok",
        model,
        ts: admin.database.ServerValue.TIMESTAMP,
      });

      await reqRef.update({
        status: "done",
        finishedAt: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (err) {
      logger.error("anthropicBot failed:", err);
      await reqRef.child("response").set({
        text: `Bot backend error: ${err?.message || String(err)}`,
        status: "error",
        ts: admin.database.ServerValue.TIMESTAMP,
      });
      await reqRef.update({
        status: "error",
        finishedAt: admin.database.ServerValue.TIMESTAMP,
      });
    }
  }
);
