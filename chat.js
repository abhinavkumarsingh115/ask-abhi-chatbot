const { chat } = require("../lib/core");
module.exports = async (req, res) => {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST" }) }
  const r = await chat(req.body); res.setHeader("Cache-Control", "no-store"); res.status(r.status).json(r.json);
};
