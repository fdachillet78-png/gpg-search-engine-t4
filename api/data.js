// api/data.js — Devuelve URLs firmadas de los blobs para descarga directa
import { list } from "@vercel/blob";
 
export default async function handler(req, res) {
  const terminal = req.query.terminal;
  if (!["callao", "t4"].includes(terminal))
    return res.status(400).json({ error: "Terminal inválido" });
 
  // Nunca cachear esta respuesta
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
 
  try {
    const { blobs } = await list({
      prefix: `gpg/${terminal}/`,
      token:  process.env.BLOB_READ_WRITE_TOKEN,
    });
 
    const urls = { gpglist: null, polines: null, coa: null, meta: null };
    for (const b of blobs) {
      const name = b.pathname.split("/").pop().replace(".json", "");
      if (name in urls) urls[name] = b.downloadUrl || b.url;
    }
 
    res.json({ terminal, urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
