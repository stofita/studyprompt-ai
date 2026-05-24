// Simple in-memory rate limiter (resets on function cold start)
// For production scale, replace with Redis or Netlify KV
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 10; // max 10 generations per minute per IP

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }

  const entry = rateLimitMap.get(ip);

  // Reset window if expired
  if (now - entry.start > windowMs) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }

  // Increment and check
  entry.count++;
  if (entry.count > maxRequests) return true;

  return false;
}

// Allowed values whitelist — prevents prompt injection via mode/lang fields
const ALLOWED_MODES = new Set(["essay", "exam", "research", "math", "plan", "thesis"]);
const ALLOWED_LANGS = new Set(["English", "French", "Arabic", "Spanish"]);
const ALLOWED_LEVELS = new Set([
  "High school",
  "University — undergraduate",
  "University — postgraduate",
  "Self-study / online course"
]);

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Rate limiting by IP
  const ip = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: "Too many requests. Please wait a minute and try again." })
    };
  }

  const API_KEY = process.env.GROQ_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "API key not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { subject, task, mode, level, count, lang } = body;

  // Validate required fields exist
  if (!subject || !task || !mode || !level || !count || !lang) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  // Whitelist validation — reject anything not in allowed values
  if (!ALLOWED_MODES.has(mode)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid mode" }) };
  }
  if (!ALLOWED_LANGS.has(lang)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid language" }) };
  }
  if (!ALLOWED_LEVELS.has(level)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid level" }) };
  }

  // Sanitize free-text inputs
  const sanitize = (str) => String(str).replace(/<[^>]*>/g, "").replace(/[`${}\\]/g, "").trim().slice(0, 500);
  const safeSubject = sanitize(subject);
  const safeTask    = sanitize(task);
  const safeCount   = Math.min(Math.max(parseInt(count) || 10, 5), 20);

  if (!safeSubject || !safeTask) {
    return { statusCode: 400, body: JSON.stringify({ error: "Subject and task are required" }) };
  }

  const modeLabels = {
    essay:    "academic essay writing, structuring arguments, thesis statements, and critical analysis",
    exam:     "exam revision, memorization techniques, practice questions, and topic summaries",
    research: "finding sources, analyzing research papers, literature reviews, and citations",
    math:     "solving math and science problems, step-by-step explanations, and concept clarification",
    plan:     "creating study schedules, time management, and breaking down large tasks",
    thesis:   "thesis and dissertation writing, research methodology, and academic argumentation"
  };

  const focusLabel = modeLabels[mode];
  const tokenMap   = { 5: 2000, 10: 3500, 15: 5000, 20: 6500 };
  const maxTokens  = tokenMap[safeCount] || 3500;

  const langInstruction = lang === "Arabic"
    ? "CRITICAL: You MUST write ALL prompts entirely in Arabic (العربية). Every single word including titles, prompt text, and 'When to use' must be in Arabic. Do not use any English."
    : lang === "French"
    ? "CRITICAL: You MUST write ALL prompts entirely in French. Every single word including titles, prompt text, and 'When to use' must be in French. Do not use any English."
    : lang === "Spanish"
    ? "CRITICAL: You MUST write ALL prompts entirely in Spanish. Every single word including titles, prompt text, and 'When to use' must be in Spanish. Do not use any English."
    : "Write all prompts in English.";

  const promptText = `Create exactly ${safeCount} ChatGPT prompts for a ${level} student.
Subject: ${safeSubject}
Task: ${safeTask}
Focus: ${focusLabel}

${langInstruction}

EXACT FORMAT for every prompt:

## Prompt 1: [Title in ${lang}]
Prompt: [Full prompt text in ${lang} with [BRACKET PLACEHOLDERS]]
When to use: [One sentence in ${lang}]

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
// - API key in env vars only — never hardcoded
// - Rate limited to 10 requests/minute/IP
// - mode, lang, level validated against strict whitelists
// - Free-text inputs sanitized: HTML, template literals, backslashes stripped
// - count clamped to 5–20
// - No sensitive data logged
