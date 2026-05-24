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

  if (typeof code !== "string" || code.length > 100) {
    return { statusCode: 400, body: JSON.stringify({ ok: false }) };
  }

  const ok = code.trim() === CORRECT.trim();

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok })
  };
};

// ⚠️ Security Notes:
// - Access code stored in Netlify env var only — never in code
// - Input type and length validated before comparison
// - No logging of attempted codes
