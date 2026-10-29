// Company workspaces: one per company, with users invited by email and given a role.
// Until the Guardrails work (M5) is done, workspaces are for made-up employee details only.
import crypto from "node:crypto";
import * as E from "../../public/engine.mjs";

export const ORG_INDEX = "orgs-index-v1";
export const orgMetaKey = (id) => `orgs/${id}/meta`;
export const orgDataKey = (id) => `orgs/${id}/data`;
const pendKey = (email) => `pending/${crypto.createHash("sha256").update(String(email).toLowerCase()).digest("hex")}`;
export const validOrgId = (id) => /^[a-z0-9]{10}$/.test(String(id || ""));
export const ROLES = { hr: "HR admin", mgr: "Manager", emp: "Employee" };
export const EMAIL_RE = /^[^\s@<>()",;]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;
const trim = (s, n) => String(s ?? "").slice(0, n).trim();

const newOrgId = () => { const abc = "abcdefghjkmnpqrstuvwxyz23456789"; return Array.from(crypto.randomBytes(10), (b) => abc[b % abc.length]).join(""); };
export const newEmpId = () => "e" + crypto.randomBytes(4).toString("hex");

export async function loadOrg(store, id) { return validOrgId(id) ? (await store.get(orgMetaKey(id), { type: "json" })) || null : null; }
export async function saveOrg(store, meta) {
  await store.setJSON(orgMetaKey(meta.id), meta);
  const ix = (await store.get(ORG_INDEX, { type: "json" })) || { items: {} };
  ix.items[meta.id] = { name: meta.name, ownerEmail: meta.ownerEmail, created: meta.created, disabled: !!meta.disabled };
  await store.setJSON(ORG_INDEX, ix);
}
export async function loadOrgIndex(store) { const o = await store.get(ORG_INDEX, { type: "json" }); return { items: Object.assign(Object.create(null), (o && o.items) || {}) }; }

export const domainOk = (meta, user) => !meta.domain || (user.hd === meta.domain && user.email.endsWith("@" + meta.domain));
// A member is bound to a Google account the first time they sign in; after that only that account matches.
// Invited users only match after they accept, which binds the Google account.
export const memberFor = (meta, user) => meta && user ? meta.members.find((m) => m.sub && m.sub === user.sub) || null : null;

async function pendingAdd(store, email, id) {
  const o = (await store.get(pendKey(email), { type: "json" })) || { orgs: [] };
  if (!o.orgs.includes(id)) o.orgs.push(id);
  await store.setJSON(pendKey(email), o);
}
export async function pendingRemove(store, email, id) {
  const o = await store.get(pendKey(email), { type: "json" });
  if (!o) return;
  o.orgs = o.orgs.filter((x) => x !== id);
  await store.setJSON(pendKey(email), o);
}
// Workspace invites waiting for this email. Nothing is joined until the user accepts.
export async function listPending(store, user) {
  const o = await store.get(pendKey(user.email), { type: "json" });
  const out = [];
  for (const id of (o && o.orgs) || []) {
    const meta = await loadOrg(store, id);
    const m = meta && !meta.disabled && meta.members.find((x) => x.email === user.email && !x.sub);
    if (m) out.push({ id, name: meta.name, role: m.role, roleName: ROLES[m.role], invitedBy: m.invitedBy, domainBlocked: !domainOk(meta, user), domain: meta.domain });
  }
  return out;
}
export async function acceptInvite(store, user, id) {
  const meta = await loadOrg(store, id);
  const m = meta && !meta.disabled && meta.members.find((x) => x.email === user.email && !x.sub);
  if (!m) return "That invitation is no longer open.";
  if (!domainOk(meta, user)) return `${meta.name} only allows @${meta.domain} Google Workspace accounts.`;
  m.sub = user.sub; m.joinedAt = new Date().toISOString();
  await saveOrg(store, meta);
  await pendingRemove(store, user.email, id);
  if (!user.orgs.includes(id)) user.orgs.push(id);
  return null;
}
export async function declineInvite(store, user, id) {
  const meta = await loadOrg(store, id);
  if (meta) { meta.members = meta.members.filter((x) => !(x.email === user.email && !x.sub)); await saveOrg(store, meta); }
  await pendingRemove(store, user.email, id);
}

export function cleanCreate(b, user) {
  const name = trim(b.name, 80);
  if (!name) return { error: "Enter your company name." };
  if (b.agree !== true) return { error: "Please confirm you will use made-up employee details only." };
  const headcount = Math.round(+b.headcount);
  if (!(headcount >= 1 && headcount <= 100000)) return { error: "Enter the number of employees." };
  if (b.lockDomain && !user.hd) return { error: "Only Google Workspace accounts can lock a workspace to their company domain." };
  return { name, city: trim(b.city, 60) || "California", headcount, start: b.start === "empty" ? "empty" : "sample", jobTitle: trim(b.jobTitle, 60) || "HR", lockDomain: !!b.lockDomain };
}

export function createOrg(o, user, today) {
  const id = newOrgId(), now = new Date().toISOString();
  let D, empId;
  if (o.start === "sample") {
    D = E.sampleData(today);
    const me = D.employees.find((e) => e.id === "e7");
    me.name = user.name; me.role = o.jobTitle; empId = me.id;
  } else {
    empId = newEmpId();
    D = { company: { ...E.sampleData(today).company, holidays: E.sampleData(today).company.holidays }, employees: [], cases: [] };
    D.employees.push({ id: empId, name: user.name, role: o.jobTitle, hire: E.addDays(today, -730), hours12: 1560, cfraUsed: 0, fmlaUsed: 0, sick: 40, sickUsedYr: 0, reproUsed: 0, hiQuarter: 18000, mgr: null });
  }
  Object.assign(D.company, { name: o.name, city: o.city, headcount: o.headcount, hrContact: user.name });
  D.log = [{ at: now, by: user.name, text: o.start === "sample" ? "Workspace created with sample employees" : "Workspace created" }];
  const meta = {
    id, name: o.name, created: now, createdBy: user.sub, ownerEmail: user.email, disabled: false,
    domain: o.lockDomain ? user.hd : null, madeUpOnly: true,
    members: [{ email: user.email, role: "hr", empId, sub: user.sub, invitedAt: now, joinedAt: now, invitedBy: user.email }],
  };
  return { meta, D };
}

export const acctFor = (m, D) => {
  const e = D.employees.find((x) => x.id === m.empId);
  return e ? { email: m.email, empId: m.empId, role: m.role, name: e.name, label: m.role === "mgr" ? `Manager · ${e.role}` : ROLES[m.role] } : null;
};

// Member changes by an HR admin. Returns an error string or null after changing meta (and D for manager flags).
export async function changeMembers(store, meta, D, me, b) {
  // Only HR admins who have actually signed in count, so a workspace can never be left without one.
  const hrCount = meta.members.filter((m) => m.role === "hr" && m.sub).length;
  if (b.op === "invite") {
    const email = String(b.email || "").toLowerCase().trim();
    if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
    if (meta.domain && !email.endsWith("@" + meta.domain)) return `This workspace only allows @${meta.domain} accounts.`;
    if (meta.members.some((m) => m.email === email)) return "That email already has access.";
    if (!ROLES[b.role]) return "Pick a role.";
    const emp = D.employees.find((e) => e.id === b.empId);
    if (!emp) return "Pick which employee this user is.";
    if (meta.members.some((m) => m.empId === emp.id)) return `${emp.name} already has access.`;
    if (meta.members.length >= 250) return "This workspace has reached its user limit.";
    meta.members.push({ email, role: b.role, empId: emp.id, sub: null, invitedAt: new Date().toISOString(), joinedAt: null, invitedBy: me.email });
    if (b.role === "mgr") emp.isMgr = true;
    await pendingAdd(store, email, meta.id);
    return null;
  }
  const m = meta.members.find((x) => x.email === String(b.email || "").toLowerCase());
  if (!m) return "User not found.";
  if (b.op === "role") {
    if (!ROLES[b.role]) return "Pick a role.";
    if (m.role === "hr" && m.sub && b.role !== "hr" && hrCount <= 1) return "Keep at least one HR admin who has signed in.";
    m.role = b.role;
    if (b.role === "mgr") { const e = D.employees.find((x) => x.id === m.empId); if (e) e.isMgr = true; }
    return null;
  }
  if (b.op === "remove") {
    if (m.email === me.email) return "You cannot remove yourself.";
    if (m.role === "hr" && m.sub && hrCount <= 1) return "Keep at least one HR admin who has signed in.";
    meta.members = meta.members.filter((x) => x !== m);
    await pendingRemove(store, m.email, meta.id);
    return null;
  }
  return "Unknown change";
}
