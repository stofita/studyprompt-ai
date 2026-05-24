const { getStore } = require("@netlify/blobs");

const MAX_FAILS = 10;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ip = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const key = `fails:${ip}`;

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

  try {
    const store = getStore("rate-limits");
    const now = Date.now();

    // Check existing fails
    const raw = await store.get(key, { type: "json" }).catch(() => null);
    if (raw && raw.count >= MAX_FAILS && now - raw.firstFail < LOCKOUT_MS) {
      const remainingMins = Math.ceil((LOCKOUT_MS - (now - raw.firstFail)) / 60000);
      return {
        statusCode: 429,
        body: JSON.stringify({ ok: false, error: `Too many failed attempts. Try again in ${remainingMins} minute(s).` })
      };
    }

    const ok = code.trim() === CORRECT.trim();

    if (ok) {
      // Clear fails on success
      await store.delete(key).catch(() => {});
    } else {
      // Record fail
      const entry = raw && now - raw.firstFail < LOCKOUT_MS
        ? { count: raw.count + 1, firstFail: raw.firstFail }
        : { count: 1, firstFail: now };
      await store.set(key, JSON.stringify(entry));
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok })
    };

  } catch (err) {
    // Fallback — if blob store fails, still check password
    const ok = code.trim() === CORRECT.trim();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok })
    };
  }
};

// ⚠️ Security Notes:
// - Uses Netlify Blobs for persistent rate limiting across serverless instances
// - 10 failed attempts = 15 min lockout per IP
// - Falls back to password check if blob store unavailable
// - Access code stored in env var only, never logged
