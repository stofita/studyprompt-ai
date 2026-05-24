exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const API_KEY = process.env.GROQ_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "API key not configured — check Netlify environment variables" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { subject, task, mode, level, count, lang } = body;
  if (!subject || !task || !mode || !level || !count || !lang) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  const sanitize = (str) => String(str).replace(/<[^>]*>/g, "").slice(0, 500);
  const safeSubject = sanitize(subject);
  const safeTask    = sanitize(task);
  const safeMode    = sanitize(mode);
  const safeLevel   = sanitize(level);
  const safeLang    = sanitize(lang);
  const safeCount   = Math.min(Math.max(parseInt(count) || 10, 5), 20);

  const modeLabels = {
    essay:    "academic essay writing, structuring arguments, thesis statements, and critical analysis",
    exam:     "exam revision, memorization techniques, practice questions, and topic summaries",
    research: "finding sources, analyzing research papers, literature reviews, and citations",
    math:     "solving math and science problems, step-by-step explanations, and concept clarification",
    plan:     "creating study schedules, time management, and breaking down large tasks",
    thesis:   "thesis and dissertation writing, research methodology, and academic argumentation"
  };

  const focusLabel = modeLabels[safeMode] || modeLabels.essay;
  const tokenMap   = { 5: 2000, 10: 3500, 15: 5000, 20: 6500 };
  const maxTokens  = tokenMap[safeCount] || 3500;

  // Strong language enforcement
  const langInstruction = safeLang === "Arabic"
    ? "CRITICAL: You MUST write ALL prompts entirely in Arabic (العربية). Every single word including titles, prompt text, and 'When to use' must be in Arabic. Do not use any English."
    : safeLang === "French"
    ? "CRITICAL: You MUST write ALL prompts entirely in French. Every single word including titles, prompt text, and 'When to use' must be in French. Do not use any English."
    : safeLang === "Spanish"
    ? "CRITICAL: You MUST write ALL prompts entirely in Spanish. Every single word including titles, prompt text, and 'When to use' must be in Spanish. Do not use any English."
    : "Write all prompts in English.";

  const promptText = `Create exactly ${safeCount} ChatGPT prompts for a ${safeLevel} student.
Subject: ${safeSubject}
Task: ${safeTask}
Focus: ${focusLabel}

${langInstruction}

EXACT FORMAT for every prompt (keep ## Prompt N: headers in this exact format even in Arabic):

## Prompt 1: [Title in ${safeLang}]
Prompt: [Full prompt text in ${safeLang} with [BRACKET PLACEHOLDERS]]
When to use: [One sentence in ${safeLang}]

Continue through Prompt ${safeCount}. Make every prompt specific to "${safeSubject}" and "${safeTask}". Number sequentially.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: `You are an expert study coach creating highly specific, immediately usable ChatGPT prompts for students. Never write generic prompts. Always include [BRACKET PLACEHOLDERS] where students fill in their details. ${langInstruction}`
          },
          { role: "user", content: promptText }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Groq ${response.status}: ${errBody}` })
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: text })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Server error: ${err.message}` })
    };
  }
};

// ⚠️ Security Notes:
// - API key is read from environment variables only — never hardcoded
// - All user inputs are sanitized and length-clamped before use
// - Prompt count is clamped to 5–20 to prevent abuse
// - No sensitive data is logged
