const { getConfig, saveConfig } = require("../lib/core");
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") { const r = await getConfig(); return res.status(r.status).json(r.json) }
  if (req.method === "POST") { const r = await saveConfig(req.headers["x-admin-token"], req.body); return res.status(r.status).json(r.json) }
  res.setHeader("Allow", "GET, POST"); res.status(405).json({ error: "Method not allowed" });
};
