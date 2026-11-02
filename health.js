const { health } = require("../lib/core");
module.exports = (req, res) => { const r = health(); res.setHeader("Cache-Control", "no-store"); res.status(r.status).json(r.json) };
