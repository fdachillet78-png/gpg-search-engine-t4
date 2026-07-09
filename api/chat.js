// api/chat.js — Proxy hacia Google Gemini API
module.exports = async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
 
  const { system, messages } = req.body;
 
  const contents = [];
  if (system) {
    contents.push({ role: "user",  parts: [{ text: `[INSTRUCCIONES]\n${system}` }] });
    contents.push({ role: "model", parts: [{ text: "Entendido." }] });
  }
  for (const m of (messages || [])) {
    contents.push({
      role:  m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
 
  try {
    const model = "gemini-2.0-flash"; // más rápido, evita timeout
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;
 
    const response = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: 800,
          temperature:     0.2,
        },
      }),
    });
 
    if (!response.ok) {
      const err = await response.json();
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
