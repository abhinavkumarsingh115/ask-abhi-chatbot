"use strict";
/* Shared backend logic used by BOTH the local server (server.js) and the Vercel functions (api/*.js).
   The Gemini API key is read from process.env.GEMINI_API_KEY here, on the server only. */
const crypto = require("crypto"), fs = require("fs"), path = require("path");
const CFG_FILE = path.join(__dirname, "..", "config.json"), CFG_KEY = "askabhi:config";
const MODEL = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
const out = (status, json) => ({ status, json });
const fail = (status, error) => out(status, { error });
const norm = b => { if (typeof b === "string") { try { return JSON.parse(b) } catch (e) { return {} } } return b && typeof b === "object" ? b : {} };

/* ---------- Gemini chat ---------- */
let _ai = null;
async function client() {
  if (!_ai) { const { GoogleGenAI } = await import("@google/genai"); _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) }
  return _ai;
}
/* The frontend sends [{role:"user"|"assistant",content}] with the system prompt wrapped in
   [INSTRUCTIONS]…[END INSTRUCTIONS] inside the first message. Convert to Gemini format and
   move that block into the native systemInstruction. */
function buildContents(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;
  let system = ""; const contents = [];
  messages.slice(-30).forEach((m, i) => {
    const role = m && m.role === "assistant" ? "model" : "user";
    let t = String(m && m.content != null ? m.content : "").slice(0, 12000);
    if (i === 0 && role === "user") { const x = t.match(/^\[INSTRUCTIONS\]\n([\s\S]*?)\n\[END INSTRUCTIONS\]\n\n([\s\S]*)$/); if (x) { system = x[1]; t = x[2] } }
    if (!t.trim()) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n\n" + t; else contents.push({ role, parts: [{ text: t }] });
  });
  if (!contents.length) return null;
  if (contents[0].role !== "user") contents.unshift({ role: "user", parts: [{ text: "(continuing our conversation)" }] });
  return { system, contents };
}
function mapError(e) {
  const key = process.env.GEMINI_API_KEY || "\u0000";
  const msg = String((e && e.message) || e).split(key).join("***");
  const st = Number(e && (e.status || e.code)) || 0;
  if (st === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) return fail(429, "Gemini rate limit or quota reached. Wait a moment and try again.");
  if (st === 401 || st === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) return fail(502, "Gemini rejected the API key. Check GEMINI_API_KEY.");
  if (st === 404 || /not found/i.test(msg)) return fail(502, "Gemini model not found. Check GEMINI_MODEL (current: " + MODEL() + ").");
  return fail(502, "Gemini error: " + msg.slice(0, 220));
}
async function chat(body) {
  body = norm(body);
  if (!process.env.GEMINI_API_KEY) return fail(500, "GEMINI_API_KEY is not set on the server");
  const b = buildContents(body.messages);
  if (!b) return fail(400, "messages are required");
  const model = MODEL(), config = { temperature: 0.8 };
  if (b.system) config.systemInstruction = b.system;
  if (/gemini-2\.5-flash/.test(model)) config.thinkingConfig = { thinkingBudget: 0 }; // faster chat replies
  try {
    const r = await (await client()).models.generateContent({ model, contents: b.contents, config });
    let text = ""; try { text = r.text || "" } catch (e) {}
    if (!text.trim()) {
      const why = (r.promptFeedback && r.promptFeedback.blockReason) || (r.candidates && r.candidates[0] && r.candidates[0].finishReason) || "";
      text = "I couldn’t produce an answer for that" + (why ? " (" + why + ")" : "") + ". Please try rephrasing.";
    }
    return out(200, { text });
  } catch (e) { return mapError(e) }
}

/* ---------- Admin: stateless signed tokens (work on serverless) ---------- */
const secret = () => process.env.ADMIN_SECRET || crypto.createHash("sha256").update("askabhi:" + (process.env.ADMIN_PIN || "")).digest("hex");
const sha = s => crypto.createHash("sha256").update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const sig = p => crypto.createHmac("sha256", secret()).update(p).digest("base64url");
function signToken() { const p = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 3600e3 })).toString("base64url"); return p + "." + sig(p) }
function verifyToken(t) {
  if (!process.env.ADMIN_PIN || typeof t !== "string") return false;
  const [p, s] = t.split("."); if (!p || !s) return false;
  const a = Buffer.from(s), b = Buffer.from(sig(p)); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(p, "base64url").toString()).exp > Date.now() } catch (e) { return false }
}
async function login(body) {
  body = norm(body);
  if (!process.env.ADMIN_PIN) return fail(401, "ADMIN_PIN is not set on the server");
  if (typeof body.pin !== "string" || !safeEq(body.pin, process.env.ADMIN_PIN)) { await new Promise(r => setTimeout(r, 700)); return fail(401, "Wrong PIN") }
  return out(200, { token: signToken() });
}

/* ---------- Shared app settings storage ---------- */
const rUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const rTok = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const hasRedis = () => !!(rUrl() && rTok());
async function redis(cmd) {
  const r = await fetch(rUrl(), { method: "POST", headers: { Authorization: "Bearer " + rTok(), "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || "Redis error " + r.status); return d.result;
}
async function readConfig() {
  try {
    if (hasRedis()) { const v = await redis(["GET", CFG_KEY]); return v ? JSON.parse(v) : {} }
    if (!process.env.VERCEL && fs.existsSync(CFG_FILE)) return JSON.parse(fs.readFileSync(CFG_FILE, "utf8"));
    if (process.env.APP_CONFIG) return JSON.parse(process.env.APP_CONFIG);
  } catch (e) {}
  return {};
}
async function writeConfig(c) {
  if (hasRedis()) return void await redis(["SET", CFG_KEY, JSON.stringify(c)]);
  if (process.env.VERCEL) throw Object.assign(new Error("Saving admin settings on Vercel needs a database: add Upstash Redis (Vercel → Storage / Marketplace) to this project and redeploy. (Or set the APP_CONFIG environment variable.)"), { status: 501 });
  fs.writeFileSync(CFG_FILE, JSON.stringify(c, null, 2));
}
function cleanConfig(c) {
  const s = (v, n) => typeof v === "string" ? v.slice(0, n) : "", f = c.features || {};
  return { brand: s(c.brand, 40) || "ASK ABHI", botName: s(c.botName, 30) || "Abhi", welcome: s(c.welcome, 200) || "Namaste! 👋 Ask me anything.", announcement: s(c.announcement, 300),
    defaultStyle: s(c.defaultStyle, 30) || "Friendly", defaultLang: ["auto", "en", "hi", "hinglish"].includes(c.defaultLang) ? c.defaultLang : "auto", extra: s(c.extra, 1500), lockStyle: !!c.lockStyle,
    features: { voice: f.voice !== false, voiceMsg: f.voiceMsg !== false, study: f.study !== false, mood: f.mood !== false } };
}
async function getConfig() { return out(200, await readConfig()) }
async function saveConfig(token, body) {
  if (!verifyToken(token)) return fail(403, "Admin session expired or invalid — please log in again");
  try { await writeConfig(cleanConfig(norm(body))); return out(200, { ok: true }) } catch (e) { return fail(e.status || 500, e.message) }
}
function health() {
  return out(200, { ok: true, model: MODEL(), geminiKeyConfigured: !!process.env.GEMINI_API_KEY, adminPinConfigured: !!process.env.ADMIN_PIN, settingsStorage: hasRedis() ? "redis" : process.env.VERCEL ? "none (read-only)" : "file" });
}
module.exports = { chat, login, getConfig, saveConfig, health, buildContents, signToken, verifyToken, MODEL };
