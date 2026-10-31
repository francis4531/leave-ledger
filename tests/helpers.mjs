// Test helpers: an in-memory store, a cookie-keeping client that calls handle() directly,
// and stand-ins for Google sign-in and the Anthropic API. No network is used.
import { handle } from "../netlify/lib/handler.mjs";

export const ORIGIN = "https://leaveledger.test";

export function memoryStore() {
  const m = new Map();
  return {
    map: m,
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
  };
}

export const TEST_ENV = { LL_TEST_PASSWORD: "test-pass-123", ANTHROPIC_API_KEY: "mock" };
export const PREVIEW_ENV = {
  LL_MODE: "feedback", LL_SECRET: "test-secret-0123456789abcdefghij", LL_ADMIN_PASSWORD: "admin-pass-1",
  ANTHROPIC_API_KEY: "mock", LL_GOOGLE_CLIENT_ID: "test-client", LL_GOOGLE_CLIENT_SECRET: "test-secret",
  LL_ADMIN_EMAILS: "owner@example.com",
};

// A browser-like client: keeps cookies, sends a same-site Origin on POST.
export function client(store, env, { ip = "10.0.0.1" } = {}) {
  const jar = new Map();
  const c = {
    jar,
    async raw(path, { method = "GET", body, headers = {} } = {}) {
      const h = new Headers(headers);
      if (jar.size) h.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
      if (method === "POST" && !h.has("origin")) h.set("origin", ORIGIN);
      if (body !== undefined) h.set("content-type", "application/json");
      h.set("x-nf-client-connection-ip", ip);
      const res = await handle(new Request(ORIGIN + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), store, env);
      for (const sc of res.headers.getSetCookie()) {
        const [pair, ...attrs] = sc.split(";");
        const i = pair.indexOf("="), k = pair.slice(0, i), v = pair.slice(i + 1);
        const gone = attrs.some((a) => /max-age=0\b/i.test(a.trim()));
        if (gone || !v) jar.delete(k); else jar.set(k, v);
      }
      return res;
    },
    async get(path) { const r = await c.raw(path); return { status: r.status, body: await r.json().catch(() => null), res: r }; },
    async post(path, body = {}, headers) { const r = await c.raw(path, { method: "POST", body, headers }); return { status: r.status, body: await r.json().catch(() => null), res: r }; },
    // Full Google sign-in through the real start and callback routes, with a stand-in Google.
    async google(account, { intent, next } = {}) {
      const q = new URLSearchParams(); if (intent) q.set("intent", intent); if (next) q.set("next", next);
      const start = await c.raw("/api/auth/google/start?" + q);
      const loc = new URL(start.headers.get("location"));
      const code = Buffer.from(JSON.stringify({ ...account, nonce: loc.searchParams.get("nonce") })).toString("base64url");
      const cb = await c.raw(`/api/auth/google/callback?state=${encodeURIComponent(loc.searchParams.get("state"))}&code=${code}`);
      return { status: cb.status, location: cb.headers.get("location"), authUrl: loc };
    },
  };
  return c;
}

// Stand-ins for outside services. Install once per test file.
export function installFakes() {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://oauth2.googleapis.com/token")) {
      const p = new URLSearchParams(init.body);
      if (p.get("client_secret") !== "test-secret" || !p.get("code_verifier")) return new Response(JSON.stringify({ error: "invalid_client" }), { status: 400 });
      const c = JSON.parse(Buffer.from(p.get("code"), "base64url").toString());
      const claims = { iss: c.iss || "https://accounts.google.com", aud: c.aud || "test-client", exp: Math.floor(Date.now() / 1000) + (c.expired ? -60 : 3600),
        sub: c.sub, email: c.email, email_verified: c.verified !== false, name: c.name || c.email, hd: c.hd, nonce: c.badNonce ? "wrong" : c.nonce };
      return new Response(JSON.stringify({ id_token: "h." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".s" }), { status: 200 });
    }
    if (u.includes("api.anthropic.com")) {
      const draft = { reason: "family_care", relation: "parent", start: "2026-11-12", weeks: 3, confidence: { reason: "high" }, summary: "Care for a parent.", ask: [], language: "en" };
      return new Response(JSON.stringify({ model: "claude-haiku-5-5", content: [{ type: "text", text: JSON.stringify(draft) }], usage: { input_tokens: 1000, output_tokens: 100 } }), { status: 200 });
    }
    if (u.includes("api.github.com")) return new Response("{}", { status: init.method === "PUT" ? 201 : 404 });
    return real(url, init);
  };
}

export const ACCTS = {
  owner: { sub: "g-owner", email: "owner@example.com", name: "Owner" },
  sam: { sub: "g-sam", email: "sam@bayside.com", name: "Sam Lee", hd: "bayside.com" },
  ana: { sub: "g-ana", email: "ana@bayside.com", name: "Ana Ruiz", hd: "bayside.com" },
  pat: { sub: "g-pat", email: "pat@gmail.com", name: "Pat Kim" },
  eve: { sub: "g-eve", email: "eve@evil.com", name: "Eve" },
};
