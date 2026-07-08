// api/upload.js — Recibe archivos Excel, los procesa y guarda en Vercel Blob
import { put } from "@vercel/blob";
import * as XLSX from "xlsx";
import formidable from "formidable";
import fs from "fs";

export const config = { api: { bodyParser: false } };

function slim(rows) {
  return rows.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row))
      if (v !== "" && v !== null && v !== undefined) out[k] = v;
    return out;
  });
}

function parseExcel(filepath) {
  const wb = XLSX.readFile(filepath);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // Verificar contraseña admin
  const adminPw = req.headers["x-admin-password"];
  if (adminPw !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: "No autorizado" });

  const form = formidable({ multiples: true, uploadDir: "/tmp", keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message });

    const terminal = fields.terminal?.[0] || fields.terminal;
    if (!["callao", "t4"].includes(terminal))
      return res.status(400).json({ error: "Terminal inválido" });

    const results = [];
    const now = new Date().toISOString();

    try {
      for (const type of ["gpglist", "polines", "coa"]) {
        const file = Array.isArray(files[type]) ? files[type][0] : files[type];
        if (!file) continue;

        const rows = slim(parseExcel(file.filepath));
        const json = JSON.stringify(rows);

        await put(`gpg/${terminal}/${type}.json`, json, {
          access: "public",
          token:  process.env.BLOB_READ_WRITE_TOKEN,
          contentType: "application/json",
          allowOverwrite: true,
        });

        results.push(`${type}: ${rows.length} filas`);
        fs.unlinkSync(file.filepath);
      }

      // Guardar metadata
      await put(`gpg/${terminal}/meta.json`, JSON.stringify({ updatedAt: now }), {
        access: "public",
        token:  process.env.BLOB_READ_WRITE_TOKEN,
        contentType: "application/json",
        allowOverwrite: true,
      });

      res.json({ ok: true, results, updatedAt: now });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
