// Google sign-in (OpenID Connect, authorization code flow with PKCE, state and nonce) and user records.
import crypto from "node:crypto";
import { signObj, readObj, cookieOf, setCookie, redirect, randomId, safeEqual } from "./session.mjs";

export const googleOn = (env) => !!(env.LL_GOOGLE_CLIENT_ID && env.LL_GOOGLE_CLIENT_SECRET);
const AUTH_URL = (env) => env.LL_GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const USER_TTL = 30 * 24 * 3600;
const OAUTH_TTL = 600;

export const baseUrl = (req, env) => (env.LL_PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, "");
const callbackUrl = (req, env) => baseUrl(req, env) + "/api/auth/google/callback";
// Only same-site paths, never "//host" or a full URL.
export const safeNext = (n) => (typeof n === "string" && /^\/(?![\/\\])[A-Za-z0-9\-._~/?=&%]*$/.test(n) ? n : "/");

export function startGoogle(req, env) {
  const url = new URL(req.url);
  const verifier = randomId(32);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = randomId(16), nonce = randomId(16);
  const intent = url.searchParams.get("intent") === "admin" ? "admin" : "app";
  const next = intent === "admin" ? "/inbox" : safeNext(url.searchParams.get("next") || "/");
  const ck = signObj({ k: "o", st: state, nn: nonce, cv: verifier, nx: next, in: intent }, OAUTH_TTL, env);
  const p = new URLSearchParams({
    client_id: env.LL_GOOGLE_CLIENT_ID, redirect_uri: callbackUrl(req, env), response_type: "code",
    scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return redirect(AUTH_URL(env) + "?" + p, [setCookie(ck, OAUTH_TTL, "ll_oauth")]);
}

function decodeJwt(t) {
  try { return JSON.parse(Buffer.from(String(t).split(".")[1], "base64url").toString()); } catch { return null; }
}

// Returns { next, intent, claims } or { next, intent, error }.
export async function finishGoogle(req, env) {
  const url = new URL(req.url);
  const o = readObj(cookieOf(req, "ll_oauth"), env);
  if (!o || o.k !== "o") return { next: "/", intent: "app", error: "expired" };
  const back = { next: o.nx, intent: o.in };
  if (url.searchParams.get("error")) return { ...back, error: "cancelled" };
  const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "";
  if (!safeEqual(state, o.st) || !code) return { ...back, error: "failed" };
  let tok;
  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env.LL_GOOGLE_CLIENT_ID, client_secret: env.LL_GOOGLE_CLIENT_SECRET, redirect_uri: callbackUrl(req, env), grant_type: "authorization_code", code_verifier: o.cv }),
    });
    tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.id_token) return { ...back, error: "failed" };
  } catch { return { ...back, error: "unreachable" }; }
  // The ID token comes straight from Google's token endpoint over HTTPS in exchange for our client secret,
  // so Google's guidance allows skipping the signature check. The claims are still checked.
  const c = decodeJwt(tok.id_token);
  const now = Date.now() / 1000;
  if (!c || !["https://accounts.google.com", "accounts.google.com"].includes(c.iss) || c.aud !== env.LL_GOOGLE_CLIENT_ID || !(c.exp > now) || !c.nonce || !safeEqual(String(c.nonce), o.nn) || !c.sub)
    return { ...back, error: "failed" };
  if (!c.email || !(c.email_verified === true || c.email_verified === "true")) return { ...back, error: "unverified" };
  return { ...back, claims: { sub: String(c.sub).slice(0, 64), email: String(c.email).toLowerCase().slice(0, 200), name: String(c.name || c.email).slice(0, 80), hd: c.hd ? String(c.hd).toLowerCase().slice(0, 100) : null } };
}

/* ---------- Users ---------- */
export const userKey = (sub) => `users/${sub}`;
const validSub = (s) => /^[A-Za-z0-9_-]{1,64}$/.test(String(s || ""));

export async function upsertUser(store, claims) {
  const now = new Date().toISOString();
  const u = (await store.get(userKey(claims.sub), { type: "json" })) || { sub: claims.sub, created: now, invites: [], orgs: [] };
  Object.assign(u, { email: claims.email, name: claims.name, hd: claims.hd, last: now });
  await store.setJSON(userKey(u.sub), u);
  return u;
}
export const userCookie = (u, env) => setCookie(signObj({ k: "u", sub: u.sub }, USER_TTL, env), USER_TTL, "ll_user");
export const clearUserCookie = () => setCookie("", 0, "ll_user");
export async function currentUser(req, store, env) {
  const o = readObj(cookieOf(req, "ll_user"), env);
  if (!o || o.k !== "u" || !validSub(o.sub)) return null;
  return (await store.get(userKey(o.sub), { type: "json" })) || null;
}
export const saveUser = (store, u) => store.setJSON(userKey(u.sub), u);
export const isAdminEmail = (env, email) => !!email && String(env.LL_ADMIN_EMAILS || "").toLowerCase().split(/[\s,]+/).filter(Boolean).includes(String(email).toLowerCase());
