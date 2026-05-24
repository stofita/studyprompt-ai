exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const CORRECT = process.env.ACCESS_CODE;
  if (!CORRECT) {
    return { statusCode: 500, body: JSON.stringify({ error: "Access code not configured" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ ok: false }) }; }

  const { code } = body;
  const ok = typeof code === "string" && code.trim() === CORRECT.trim();

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok })
  };
};

// ⚠️ Security Notes:
// - Password is stored in Netlify env var ACCESS_CODE — never in code
// - No logging of attempted codes
// - Simple string comparison — no timing attack risk at this scale
