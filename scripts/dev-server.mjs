// Local server for trying the app and for click-through tests. No network: an in-memory store,
// a stand-in Google account chooser at /fake-google, and a stand-in Clerk.
// Usage: node scripts/dev-server.mjs [test|preview] [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { handle } from "../netlify/lib/handler.mjs";
import { memoryStore, installFakes, TEST_ENV, PREVIEW_ENV } from "../tests/helpers.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "public");
const PAGES = { "/": "index.html", "/strategy": "strategy.html", "/inbox": "inbox.html", "/privacy": "privacy.html", "/tests": "tests.html" };
const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
export const GOOGLE_ACCOUNTS = [
  { sub: "g-owner", email: "owner@example.com", name: "Site Owner" },
  { sub: "g-sam", email: "sam@bayside.com", name: "Sam Lee", hd: "bayside.com" },
  { sub: "g-ana", email: "ana@bayside.com", name: "Ana Ruiz", hd: "bayside.com" },
  { sub: "g-pat", email: "pat@gmail.com", name: "Pat Kim" },
];

export function startServer(mode = "test", port = 0) {
  installFakes();
  const store = memoryStore();
  return new Promise((resolve) => {
    let env;
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${server.address().port}`);
      if (url.pathname.startsWith("/api/")) {
        let body = ""; for await (const c of req) body += c;
        const r = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
        const out = await handle(r, store, env);
        const h = Object.fromEntries(out.headers); delete h["set-cookie"];
        const sc = out.headers.getSetCookie().map((c) => c.replace("; Secure", ""));
        if (sc.length) h["set-cookie"] = sc;
        res.writeHead(out.status, h); res.end(Buffer.from(await out.arrayBuffer())); return;
      }
      if (url.pathname === "/fake-google") {
        const q = url.searchParams;
        const links = GOOGLE_ACCOUNTS.map((a) => {
          const code = Buffer.from(JSON.stringify({ ...a, nonce: q.get("nonce") })).toString("base64url");
          return `<p><a href="${q.get("redirect_uri")}?state=${encodeURIComponent(q.get("state"))}&code=${code}">${a.email}</a></p>`;
        }).join("");
        res.writeHead(200, { "content-type": "text/html" }); res.end(`<h1>Choose an account</h1>${links}`); return;
      }
      const f = path.join(root, PAGES[url.pathname] || url.pathname);
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "text/plain" }); res.end(fs.readFileSync(f));
    });
    server.listen(port, () => {
      const base = `http://localhost:${server.address().port}`;
      env = mode === "preview" ? { ...PREVIEW_ENV, LL_GOOGLE_AUTH_URL: base + "/fake-google" } : { ...TEST_ENV };
      resolve({ server, base, store, close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }) });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startServer(process.argv[2] || "test", +(process.argv[3] || 8788));
  console.log(`${process.argv[2] || "test"} mode at ${s.base}${(process.argv[2] || "test") === "test" ? " · test password: test-pass-123" : " · admin password: admin-pass-1, admin Google: owner@example.com"}`);
}
