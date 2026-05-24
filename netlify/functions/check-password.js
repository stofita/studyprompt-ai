// Persistent rate limiting using Netlify Blobs (built-in, no extra package needed)
// @netlify/blobs is pre-installed in Netlify's function runtime

const MAX_FAILS = 10;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

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

  const ip = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();

  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore({ name: "rate-limits", consistency: "strong" });
    const key = `ip_${ip.replace(/[^a-zA-Z0-9]/g, "_")}`;

    // Get current fail record
    let record = null;
    try {
      record = await store.get(key, { type: "json" });
    } catch { record = null; }

    // Check lockout
    if (record && record.count >= MAX_FAILS) {
      const elapsed = now - record.firstFail;
      if (elapsed < LOCKOUT_MS) {
        const remainingMins = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
        return {
          statusCode: 429,
          body: JSON.stringify({ ok: false, error: `Too many attempts. Try again in ${remainingMins} min.` })
        };
      } else {
        // Lockout expired — reset
        record = null;
      }
    }

    const ok = code.trim() === CORRECT.trim();

    if (ok) {
      // Clear on success
      try { await store.delete(key); } catch {}
    } else {
      // Record fail
      const updated = record
        ? { count: record.count + 1, firstFail: record.firstFail }
        : { count: 1, firstFail: now };
      try { await store.set(key, updated); } catch {}
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok })
    };

  } catch (blobErr) {
    // Blobs unavailable — still check password but no rate limiting
    console.error("Blobs error:", blobErr.message);
    const ok = code.trim() === CORRECT.trim();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok })
    };
  }
};

// ⚠️ Security Notes:
// - Uses Netlify Blobs with strong consistency for persistent rate limiting
// - 10 failed attempts triggers 15 min lockout per IP
// - Falls back gracefully if Blobs unavailable
// - Access code in env var only, never logged
