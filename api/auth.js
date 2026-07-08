// api/auth.js — Verifica la contraseña de administrador contra la variable de entorno
export default function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { password } = req.body || {};
  if (password === process.env.ADMIN_PASSWORD) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Contraseña incorrecta" });
}
