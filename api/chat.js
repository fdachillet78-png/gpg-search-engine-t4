// api/chat.js — Proxy hacia Google Gemini API con streaming
module.exports = async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
 
  const { system, messages } = req.body;
 
  const contents = [];
  if (system) {
    contents.push({ role: "user",  parts: [{ text: `[INSTRUCCIONES]\n${CRITICAL_RULES}\n${system}` }] });
    contents.push({ role: "model", parts: [{ text: "Entendido. Seguiré las reglas críticas y el resto de instrucciones." }] });
  }
  for (const m of (messages || [])) {
    contents.push({
      role:  m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
 
  try {
    const model = "gemini-2.5-pro";
    // Instrucción crítica que se antepone al system prompt para reforzar comportamiento
    const CRITICAL_RULES = `REGLAS CRÍTICAS — SEGUIR SIEMPRE:
1. Si el usuario menciona alquiler/renta de equipo y NO dice la duración: pregunta "¿Menos de 1 mes o más de 1 mes?" y NO recomiendes GPG hasta recibir respuesta.
2. Usa SOLO GPGs del catálogo proporcionado. No inventes GPGs.
3. Si hay ambigüedad, haz UNA pregunta y espera respuesta antes de recomendar.
`;
    // streamGenerateContent con alt=sse para streaming real
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;
 
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
 
    // Stream la respuesta directamente al cliente
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
            // Convertir formato Gemini → formato Anthropic que espera el frontend
            res.write(`data: ${JSON.stringify({
              type:  "content_block_delta",
              delta: { type: "text_delta", text }
            })}\n\n`);
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
