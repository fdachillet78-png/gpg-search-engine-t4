// api/chat.js — Proxy hacia Google Gemini API (con billing, streaming)
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
    const model = "gemini-2.5-flash";
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
 
    const response = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: 1000,
          temperature:     0.2,
        },
      }),
    });
 
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json(err);
    }
 
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
 
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ type:"content_block_delta", delta:{ type:"text_delta", text } })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
 
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
