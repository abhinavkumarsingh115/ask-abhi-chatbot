"use strict";
// Local server: serves ./public and exposes the same API as the Vercel functions.
//   npm install && npm start   →  http://localhost:3000
const http = require("http"), fs = require("fs"), path = require("path");
// Minimal .env loader (no extra dependency). Real environment variables win.
try { fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).forEach(l => {
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/); if (!m || l.trim().startsWith("#")) return;
  if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
}) } catch (e) {}
const core = require("./lib/core");
const PORT = process.env.PORT || 3000, PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png" };
const readBody = async req => { let b = ""; for await (const c of req) { b += c; if (b.length > 100000) throw new Error("Request too large") } return b };
const send = (res, r) => { res.writeHead(r.status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(r.json)) };
http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  try {
    if (url === "/api/health" && req.method === "GET") return send(res, core.health());
    if (url === "/api/config" && req.method === "GET") return send(res, await core.getConfig());
    if (url === "/api/config" && req.method === "POST") return send(res, await core.saveConfig(req.headers["x-admin-token"], await readBody(req)));
    if (url === "/api/admin/login" && req.method === "POST") return send(res, await core.login(await readBody(req)));
    if (url === "/api/chat" && req.method === "POST") return send(res, await core.chat(await readBody(req)));
    if (url.startsWith("/api/")) return send(res, { status: 404, json: { error: "Not found" } });
  } catch (e) { return send(res, { status: 500, json: { error: String(e.message) } }) }
  const p = path.join(PUBLIC, url === "/" ? "index.html" : url);
  if (!p.startsWith(PUBLIC + path.sep) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end("Not found") }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream", "x-content-type-options": "nosniff" });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => {
  console.log("ASK ABHI running at http://localhost:" + PORT + "  (model: " + core.MODEL() + ")");
  if (!process.env.GEMINI_API_KEY) console.log("⚠  GEMINI_API_KEY is not set — chat will not work until you add it to .env");
  if (!process.env.ADMIN_PIN) console.log("⚠  ADMIN_PIN is not set — admin login is disabled");
});
