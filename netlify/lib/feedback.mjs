// Feedback mode: a separate site for prospects. Each invite gets its own copy of the sample company,
// prospects leave feedback on any screen and a short survey, and the admin reads it all in /inbox.
import crypto from "node:crypto";

export const IKEY = "fb-invites-v1";
export const FKEY = "fb-feedback-v1";
export const SKEY = "fb-surveys-v1";
export const AIKEY = "fb-ai-day-v1";
const trim = (s, n = 1000) => String(s ?? "").slice(0, n).trim();

// Keyed maps are rebuilt without a prototype, so codes like "constructor" never match a built-in.
export const dict = (o) => Object.assign(Object.create(null), o || {});
export async function loadInvites(store) {
  const o = await store.get(IKEY, { type: "json" });
  return { ...(o || {}), items: dict(o && o.items) };
}
export const newCode = () => {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(8), (b) => abc[b % abc.length]).join("");
};
export const validCode = (c) => /^[a-z0-9]{6,16}$/.test(String(c || ""));

// Returns false when this copy has sent too much feedback in the last 24 hours.
export async function addFeedback(store, item, spaceId) {
  const o = (await store.get(FKEY, { type: "json" })) || { items: [] };
  const day = Date.now() - 24 * 3600 * 1000;
  if (o.items.filter((f) => (f.invite || "org:" + f.org) === spaceId && Date.parse(f.at) > day).length >= 60) return false;
  o.items = [item, ...o.items].slice(0, 5000);
  await store.setJSON(FKEY, o);
  return true;
}
export function cleanFeedback(b) {
  const rating = Math.round(+b.rating);
  const note = trim(b.note, 2000);
  if (!(rating >= 1 && rating <= 5) && !note) return { error: "Pick a rating or write a note." };
  return { screen: trim(b.screen, 60), rating: rating >= 1 && rating <= 5 ? rating : null, note, kind: ["idea", "bug", "confusing", "like"].includes(b.kind) ? b.kind : "" };
}

// Survey questions. Tied to the kill criteria: pain, leaves handled, willingness to pay $4 per employee per month.
export const SURVEY = [
  { id: "role", q: "What is your role?", type: "choice", options: ["Owner or founder", "Office or operations manager", "HR generalist or HR lead", "Bookkeeper or payroll", "Other"] },
  { id: "size", q: "How many employees does your company have?", type: "choice", options: ["Under 5", "5 to 19", "20 to 49", "50 to 200", "Over 200"] },
  { id: "leaves", q: "About how many leaves of absence did you handle in the last 12 months?", type: "choice", options: ["None", "1 or 2", "3 to 5", "6 or more"] },
  { id: "pain", q: "How painful is handling a leave today?", type: "scale", low: "Easy", high: "Very painful" },
  { id: "tool", q: "What do you use today?", type: "multi", options: ["My payroll tool (Gusto, ADP, Rippling, other)", "Spreadsheet or calendar", "An employment lawyer or HR consultant", "A leave vendor (Tilt or similar)", "Nothing in particular"] },
  { id: "useful", q: "How useful would this app be for you?", type: "scale", low: "Not useful", high: "Very useful" },
  { id: "pay", q: "Would your company pay $4 per employee per month for this?", type: "choice", options: ["Yes", "Maybe, at a lower price", "No"] },
  { id: "price", q: "If not $4, what price would feel right?", type: "text", optional: true },
  { id: "missing", q: "What is missing, or what would stop you from using it?", type: "text", optional: true },
  { id: "contact", q: "Email, if you are open to a 20-minute follow-up call", type: "text", optional: true },
];

export function cleanSurvey(answers) {
  const a = answers && typeof answers === "object" ? answers : {};
  const out = {};
  for (const q of SURVEY) {
    const v = a[q.id];
    if (q.type === "choice") { if (q.options.includes(v)) out[q.id] = v; }
    else if (q.type === "multi") { const arr = (Array.isArray(v) ? v : []).filter((x) => q.options.includes(x)); if (arr.length) out[q.id] = arr; }
    else if (q.type === "scale") { const n = Math.round(+v); if (n >= 1 && n <= 5) out[q.id] = n; }
    else { const t = trim(v, q.id === "contact" ? 200 : 2000); if (t) out[q.id] = t; }
  }
  if (Object.keys(out).length < 3) return { error: "Answer at least a few questions before sending." };
  return { answers: out };
}

export function summarize(surveys) {
  const list = Object.values(surveys);
  const n = list.length;
  const avg = (k) => { const v = list.map((s) => s.answers[k]).filter((x) => typeof x === "number"); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
  const count = (k, val) => list.filter((s) => s.answers[k] === val).length;
  return {
    responses: n,
    painAvg: avg("pain"),
    usefulAvg: avg("useful"),
    painful: list.filter((s) => s.answers.pain >= 4).length,
    payYes: count("pay", "Yes"),
    payMaybe: count("pay", "Maybe, at a lower price"),
    payNo: count("pay", "No"),
    handledLeave: list.filter((s) => s.answers.leaves && s.answers.leaves !== "None").length,
  };
}

// Daily Clerk cap across all prospects, on top of the per-invite caps in each copy's own data.
export async function aiGlobalOk(store, today, max) {
  const o = (await store.get(AIKEY, { type: "json" })) || { day: today, count: 0 };
  if (o.day !== today) { o.day = today; o.count = 0; }
  return { ok: o.count < max, bump: async () => { o.count++; await store.setJSON(AIKEY, o); } };
}
