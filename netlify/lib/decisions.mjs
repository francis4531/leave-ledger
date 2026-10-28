// Weekly strategy decisions, answered on the /strategy page.
// Stored in Netlify Blobs right away, then copied to strategy/decisions.md on GitHub
// (when LL_GITHUB_TOKEN is set) so the strategy stays version-controlled and the weekly draft can read it.

export const DKEY = "strategy-decisions-v1";
export const STATUSES = { decided: "Decided", info: "Need more info", deferred: "Deferred", dropped: "Not doing" };

const trim = (s, n) => String(s ?? "").replace(/\r/g, "").trim().slice(0, n);

export async function loadDecisions(store) {
  const d = await store.get(DKEY, { type: "json" });
  return d && d.items ? d : { items: {} };
}

export function cleanDecision(a) {
  const week = Math.round(+a.week);
  if (!(week >= 1 && week <= 12)) return { error: "Unknown week" };
  const n = Math.round(+a.n);
  if (!(n >= 1 && n <= 20)) return { error: "Unknown decision" };
  if (!STATUSES[a.status]) return { error: "Pick a status" };
  const answer = trim(a.answer, 4000);
  if (a.status === "decided" && answer.length < 2) return { error: "Write the decision before marking it decided" };
  return {
    key: `w${week}-${n}`, week, n,
    module: trim(a.module, 40),
    title: trim(a.title, 200) || `Decision ${n}`,
    question: trim(a.question, 2000),
    answer, status: a.status,
  };
}

export function toMarkdown(D) {
  const items = Object.values(D.items || {});
  const weeks = [...new Set(items.map((x) => x.week))].sort((a, b) => b - a);
  const date = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
  let out = "# Strategy decisions\n\n> Answered on the /strategy page of the test site and copied here automatically. Newest week first. Edit them on the page, not in this file; the page overwrites it.\n";
  for (const w of weeks) {
    const list = items.filter((x) => x.week === w).sort((a, b) => a.n - b.n);
    out += `\n## Week ${w}${list[0].module ? ` · ${list[0].module}` : ""}\n`;
    for (const x of list) {
      out += `\n### ${x.n}. ${x.title}\n\n`;
      if (x.question) out += `**Question:** ${x.question.replace(/\n+/g, " ")}\n\n`;
      out += `**Status:** ${STATUSES[x.status]} · ${date(x.at)} · ${x.by}\n\n`;
      out += x.answer ? `**Answer:** ${x.answer}\n` : "**Answer:** (none yet)\n";
      if (x.history && x.history.length) out += `\n<details><summary>Earlier answers (${x.history.length})</summary>\n\n${x.history.map((h) => `- ${date(h.at)} · ${STATUSES[h.status]}: ${h.answer.replace(/\n+/g, " ") || "(none)"}`).join("\n")}\n\n</details>\n`;
    }
  }
  return out;
}

// Writes strategy/decisions.md through the GitHub contents API. Returns null or an error message.
export async function mirrorToGitHub(D, env, fetchImpl = fetch) {
  const token = env.LL_GITHUB_TOKEN;
  if (!token) return "not set up";
  const repo = env.LL_GITHUB_REPO || "francis4531/leave-ledger";
  const branch = env.LL_GITHUB_BRANCH || "main";
  const path = "strategy/decisions.md";
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "leave-ledger", "x-github-api-version": "2022-11-28" };
  try {
    const cur = await fetchImpl(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    const body = {
      // [skip netlify] keeps each saved answer from triggering a site rebuild.
      message: "Strategy decisions updated from the /strategy page [skip netlify]",
      content: Buffer.from(toMarkdown(D), "utf8").toString("base64"),
      branch, ...(sha ? { sha } : {}),
    };
    const r = await fetchImpl(url, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return `GitHub said ${r.status}${j.message ? `: ${j.message}` : ""}`;
  } catch (e) {
    return "Could not reach GitHub";
  }
}
