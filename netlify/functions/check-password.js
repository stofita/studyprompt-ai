// Brute force protection — in-memory per cold start
// Locks an IP after 10 failed attempts for 15 minutes
const failMap = new Map();

function isBruteForce(ip) {
  const now = Date.now();
  const lockoutMs = 15 * 60 * 1000; // 15 minute lockout
  const maxFails = 10;

  if (!failMap.has(ip)) return false;

  const entry = failMap.get(ip);

  // Reset if lockout expired
  if (now - entry.firstFail > lockoutMs) {
    failMap.delete(ip);
    return false;
  }

  return entry.count >= maxFails;
}

function recordFail(ip) {
  const now = Date.now();
  if (!failMap.has(ip)) {
    failMap.set(ip, { count: 1, firstFail: now });
  } else {
    failMap.get(ip).count++;
  }
}

function clearFail(ip) {
  failMap.delete(ip);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ip = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";

  // Check brute force lockout
  if (isBruteForce(ip)) {
    return {
      statusCode: 429,
      body: JSON.stringify({ ok: false, error: "Too many failed attempts. Please try again in 15 minutes." })
    };
  }

  const CORRECT = process.env.ACCESS_CODE;
  if (!CORRECT) {
    return { statusCode: 500, body: JSON.stringify({ error: "Access code not configured" }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ ok: false }) }; }

  const { code } = body;

  // Validate input type and length
  if (typeof code !== "string" || code.length > 100) {
    return { statusCode: 400, body: JSON.stringify({ ok: false }) };
  }

  const ok = code.trim() === CORRECT.trim();

  if (ok) {
    clearFail(ip); // Reset fail count on success
  } else {
    recordFail(ip); // Track failed attempt
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok })
  };
};

// ⚠️ Security Notes:
// - Password stored in env var ACCESS_CODE only
// - Brute force protection: 10 fails = 15 min lockout per IP
// - Input type and length validated before comparison
// - Failed attempts logged per IP, success clears the counter
// - No logging of attempted codes
