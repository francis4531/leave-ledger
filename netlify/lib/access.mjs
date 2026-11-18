// Requests from visitors who want Leave Ledger for their own company.
// A visitor fills in a short form; the request shows in the admin inbox; Approve creates an invite and emails the link.
import { EMAIL_RE } from "./orgs.mjs";

export const AKEY = "access-requests-v1";
const KEEP = 500;
const s = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

export async function loadRequests(store) {
  return (await store.get(AKEY, { type: "json" })) || { items: [] };
}

export function cleanRequest(body = {}) {
  const r = { name: s(body.name, 80), email: s(body.email, 120).toLowerCase(), company: s(body.company, 80), city: s(body.city, 60), note: s(body.note, 500) };
  const hc = Math.round(Number(body.headcount));
  if (!r.name) return { error: "Add your name." };
  if (!EMAIL_RE.test(r.email)) return { error: "That email does not look right. Check for a typo." };
  if (!r.company) return { error: "Add your company's name." };
  if (!Number.isFinite(hc) || hc < 1 || hc > 100000) return { error: "Add about how many employees you have." };
  r.headcount = hc;
  return r;
}

// Adds a request, or refreshes the open one from the same email, so a second click does not make a duplicate.
export async function addRequest(store, r, from) {
  const o = await loadRequests(store);
  const open = o.items.find((x) => x.email === r.email && x.status === "new");
  const at = new Date().toISOString();
  if (open) Object.assign(open, r, { at, from: from || open.from || null });
  else o.items.unshift({ id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at, ...r, from: from || null, status: "new" });
  o.items = o.items.slice(0, KEEP);
  await store.setJSON(AKEY, o);
  return open ? "updated" : "added";
}

export const inviteEmail = ({ name, company }, link) => ({
  subject: "Your Leave Ledger workspace is ready",
  text: `Hi ${name.split(/\s+/)[0]},

Thanks for asking to use Leave Ledger for ${company}. You are in.

Open this link and sign in with this email address, using Google or an emailed link, to set up your workspace:
${link}

It takes about 10 minutes: tell us about your company, bring in your employees, and invite your managers.
For now the preview uses made-up employee details only. We will let you know when real employee data is supported.

Questions? Just reply to this email.

Francis
Leave Ledger`,
});

export const adminAlert = (r) => ({
  subject: `Leave Ledger access request: ${r.company} (${r.headcount} employees)`,
  text: `${r.name} <${r.email}> asked to use Leave Ledger for ${r.company}, ${r.headcount} employees${r.city ? `, ${r.city}` : ""}.${r.note ? `\n\nThey wrote: ${r.note}` : ""}\n\nApprove or decline it in the inbox.`,
});
