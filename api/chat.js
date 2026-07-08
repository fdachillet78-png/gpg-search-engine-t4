Chat · JS
// api/chat.js — Proxy hacia Google Gemini API (gratuito hasta 1,500 req/día)
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
 
  const { system, messages } = req.body;
 
  // Convertir formato Anthropic → Gemini
  // Gemini usa "contents" con "role" y "parts"
  const contents = [];
 
  // Gemini no tiene system prompt separado — lo agregamos como primer mensaje de usuario
  if (system) {
    contents.push({ role: "user",  parts: [{ text: `[INSTRUCCIONES DEL SISTEMA]\n${system}` }] });
    contents.push({ role: "model", parts: [{ text: "Entendido. Seguiré estas instrucciones." }] });
  }
 
  // Agregar historial de mensajes
  for (const m of (messages || [])) {
    contents.push({
      role:  m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
 
  try {
    const model = "gemini-2.0-flash"; // gratuito, rápido y capaz
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;
 
    const response = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: 1200,
          temperature:     0.3,
        },
      }),
    });
 
    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json(err);
    }
 
    // Convertir SSE de Gemini → formato SSE compatible con el frontend (igual que Anthropic)
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
            // Emitir en formato Anthropic para que el frontend no cambie
            const chunk = JSON.stringify({
              type:  "content_block_delta",
              delta: { type: "text_delta", text },
            });
            res.write(`data: ${chunk}\n\n`);
          }
        } catch {}
      }
    }
 
    res.write("data: [DONE]\n\n");
    res.end();
 
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
