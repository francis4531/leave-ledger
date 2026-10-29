// Signed cookies and small response helpers shared by the API modules.
import crypto from "node:crypto";

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
export const err = (m, s = 400) => json({ error: m }, s);
export const redirect = (to, cookies = []) => {
  const h = new Headers({ location: to, "cache-control": "no-store" });
  cookies.forEach((c) => h.append("set-cookie", c));
  return new Response(null, { status: 302, headers: h });
};
export const withCookies = (res, cookies) => {
  const h = new Headers(res.headers);
  cookies.forEach((c) => h.append("set-cookie", c));
  return new Response(res.body, { status: res.status, headers: h });
};

// No secret configured means no valid cookies at all, never an empty signing key.
function secret(env) {
  // The preview site holds real Google identities, so it needs its own long random key.
  if (String(env.LL_MODE || "").toLowerCase() === "feedback" && String(env.LL_SECRET || "").length < 24) throw new Error("Set LL_SECRET in Netlify (at least 24 random characters), then redeploy.");
  const s = env.LL_SECRET || (env.LL_TEST_PASSWORD ? "ll:" + env.LL_TEST_PASSWORD : env.LL_ADMIN_PASSWORD ? "adm:" + env.LL_ADMIN_PASSWORD : "");
  if (!s) throw new Error("Set LL_SECRET in Netlify, then redeploy.");
  return crypto.createHash("sha256").update(s).digest();
}
const b64 = (s) => Buffer.from(s).toString("base64url");
export function signObj(o, ttl, env) {
  const p = b64(JSON.stringify({ ...o, x: Math.floor(Date.now() / 1000) + ttl }));
  return p + "." + crypto.createHmac("sha256", secret(env)).update(p).digest("base64url");
}
export function readObj(token, env) {
  if (!token || !token.includes(".")) return null;
  if (!env.LL_SECRET && !env.LL_TEST_PASSWORD && !env.LL_ADMIN_PASSWORD) return null;
  const [p, sig] = token.split(".");
  const good = crypto.createHmac("sha256", secret(env)).update(p).digest("base64url");
  if (!sig || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const o = JSON.parse(Buffer.from(p, "base64url").toString());
    return o.x < Date.now() / 1000 ? null : o;
  } catch { return null; }
}
export const cookieOf = (req, name = "ll_session") => (req.headers.get("cookie") || "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.[1];
export const setCookie = (val, maxAge, name = "ll_session") => `${name}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const safeEqual = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const randomId = (n = 16) => crypto.randomBytes(n).toString("base64url");
