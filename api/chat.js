// api/chat.js — Proxy hacia Google Gemini API con streaming
module.exports = async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { system, messages } = req.body;

  const CRITICAL = `REGLAS CRÍTICAS — SEGUIR SIEMPRE SIN EXCEPCIÓN:
1. ALQUILER DE EQUIPO: Si el usuario menciona alquiler/renta/arrendamiento de equipo y NO especifica la duración, responde ÚNICAMENTE con la pregunta "¿El alquiler será por menos de 1 mes o más de 1 mes?" y NO recomiendes ningún GPG hasta recibir la respuesta.
   - Menos de 1 mes → busca en el catálogo un GPG con "RENTAL" y "LESS THAN 1 MONTH" o "SHORT TERM" en su descripción (ej. G-301641 si existe)
   - Más de 1 mes → busca en el catálogo un GPG con "LEASE" y "MORE THAN 1 MONTH" en su descripción (ej. G-301632 si existe)
   - Si existe un GPG específico para la duración indicada, DEBES usarlo. No digas "no existe" si el catálogo lo tiene.
2. Usa SOLO GPGs del catálogo proporcionado. Busca cuidadosamente en TODO el catálogo antes de decir que un GPG no existe.
3. Si hay ambigüedad, haz UNA sola pregunta y espera respuesta antes de recomendar.
`;

  const contents = [];
  if (system) {
    contents.push({ role: "user",  parts: [{ text: `[INSTRUCCIONES]\n${CRITICAL}\n${system}` }] });
    contents.push({ role: "model", parts: [{ text: "Entendido. Seguiré las reglas críticas." }] });
  }
  for (const m of (messages || [])) {
    contents.push({
      role:  m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  try {
    const model = "gemini-2.5-pro";
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: 2000,
          temperature:     0.2,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json(err);
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const parsed = JSON.parse(raw);
          const text   = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            res.write(`data: ${JSON.stringify({ type:"content_block_delta", delta:{ type:"text_delta", text } })}\n\n`);
          }
        } catch {}
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
