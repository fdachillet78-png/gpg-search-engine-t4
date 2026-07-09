// api/chat.js — Proxy hacia Groq API (gratuito, sin restricción geográfica)
module.exports = async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
 
  const { system, messages } = req.body;
 
  // Groq usa formato compatible con OpenAI
  const groqMessages = [];
  if (system) groqMessages.push({ role: "system", content: system });
  for (const m of (messages || [])) {
    groqMessages.push({ role: m.role, content: m.content });
  }
 
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       "llama-3.3-70b-versatile", // el más capaz en tier gratuito
        messages:    groqMessages,
        max_tokens:  1000,
        temperature: 0.2,
        stream:      false,
      }),
    });
 
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json(err);
    }
 
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";
 
    // Formato SSE compatible con el frontend
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ type:"content_block_delta", delta:{ type:"text_delta", text } })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
 
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
 
