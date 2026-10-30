// Private Room pay gate: Stripe Checkout (or mock) -> signed access cookie -> signed Mux playback.
// Zero dependencies; needs Node 18+.
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const E = process.env;
const PORT = Number(E.PORT || 3000);
const CFG = {
  title: E.STREAM_TITLE || "Private Room",
  host: E.HOST_NAME || "",
  priceCents: parseInt(E.PRICE_CENTS || "999", 10),
  currency: (E.CURRENCY || "usd").toLowerCase(),
  accessHours: Number(E.ACCESS_HOURS || 24),
  ageGate: E.AGE_GATE !== "false",
};
const STRIPE_KEY = E.STRIPE_SECRET_KEY || "";
const MOCK = !STRIPE_KEY;
let SECRET = E.SESSION_SECRET;
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET not set: using a random one; passes reset on every restart.");
}
const MUX = {
  playbackId: E.MUX_PLAYBACK_ID || "",
  keyId: E.MUX_SIGNING_KEY_ID || "",
  key: decodeKey(E.MUX_SIGNING_PRIVATE_KEY || ""),
};
const STREAM_READY = !!(MUX.playbackId && MUX.keyId && MUX.key);
if (MOCK) console.warn("STRIPE_SECRET_KEY not set: running with MOCK checkout (no money taken).");
if (!STREAM_READY) console.warn("Mux env vars not set: stream player disabled.");

// Mux gives the signing key as base64-encoded PEM; accept raw PEM too.
function decodeKey(v) {
  if (!v) return "";
  return v.includes("BEGIN") ? v.replace(/\\n/g, "\n") : Buffer.from(v, "base64").toString("utf8");
}
const b64u = (buf) => Buffer.from(buf).toString("base64url");

// --- access pass cookie: base64url(json).hmac ---
function signPass(obj) {
  const body = b64u(JSON.stringify(obj));
  return body + "." + crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}
function readPass(req) {
  const m = /(?:^|;\s*)pass=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return null;
  const [body, mac] = m[1].split(".");
  const want = crypto.createHmac("sha256", SECRET).update(body || "").digest("base64url");
  if (!mac || mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
function setPass(res, exp, sid) {
  const maxAge = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  res.setHeader("Set-Cookie", `pass=${signPass({ exp, sid })}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

// --- Mux signed playback token (RS256 JWT) ---
function muxToken(aud, expMs) {
  const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid: MUX.keyId }));
  const claims = b64u(JSON.stringify({ sub: MUX.playbackId, aud, exp: Math.floor(expMs / 1000), kid: MUX.keyId }));
  const sig = crypto.sign("RSA-SHA256", Buffer.from(header + "." + claims), MUX.key);
  return header + "." + claims + "." + b64u(sig);
}

// --- Stripe REST (form-encoded) ---
async function stripe(method, p, form) {
  const r = await fetch("https://api.stripe.com/v1" + p, {
    method,
    headers: { Authorization: "Bearer " + STRIPE_KEY, "Content-Type": "application/x-www-form-urlencoded" },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ? j.error.message : "Stripe error " + r.status);
  return j;
}

function baseUrl(req) {
  return E.PUBLIC_URL || E.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function redirect(res, to) { res.writeHead(303, { Location: to }); res.end(); }

const INDEX = path.join(__dirname, "public", "index.html");

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      return fs.createReadStream(INDEX).pipe(res);
    }
    if (req.method === "GET" && url.pathname === "/healthz") return json(res, 200, { ok: true });

    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, { ...CFG, mock: MOCK, streamReady: STREAM_READY });
    }

    if (req.method === "GET" && url.pathname === "/api/access") {
      const pass = readPass(req);
      if (!pass) return json(res, 401, { ok: false });
      const out = { ok: true, exp: pass.exp, streamReady: STREAM_READY };
      if (STREAM_READY) {
        out.playbackId = MUX.playbackId;
        out.token = muxToken("v", pass.exp);
        out.thumbToken = muxToken("t", pass.exp);
      }
      return json(res, 200, out);
    }

    if (req.method === "POST" && url.pathname === "/api/checkout") {
      if (MOCK) {
        setPass(res, Date.now() + CFG.accessHours * 3600e3, "mock_" + crypto.randomUUID());
        return json(res, 200, { url: "/" });
      }
      const base = baseUrl(req);
      const s = await stripe("POST", "/checkout/sessions", {
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": CFG.currency,
        "line_items[0][price_data][unit_amount]": String(CFG.priceCents),
        "line_items[0][price_data][product_data][name]": `${CFG.title}: ${CFG.accessHours}h stream pass`,
        success_url: base + "/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: base + "/",
      });
      return json(res, 200, { url: s.url });
    }

    if (req.method === "GET" && url.pathname === "/success") {
      const id = url.searchParams.get("session_id") || "";
      if (MOCK || !/^cs_[A-Za-z0-9_]+$/.test(id)) return redirect(res, "/");
      const s = await stripe("GET", "/checkout/sessions/" + id);
      if (s.payment_status !== "paid") return redirect(res, "/?unpaid=1");
      // Pass runs from purchase time, so a reused success link expires with it.
      const exp = s.created * 1000 + CFG.accessHours * 3600e3;
      if (exp > Date.now()) setPass(res, exp, s.id);
      return redirect(res, "/");
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      res.setHeader("Set-Cookie", "pass=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err.message });
  }
}).listen(PORT, () => console.log(`Private Room listening on :${PORT} (${MOCK ? "mock" : "stripe"} checkout)`));
