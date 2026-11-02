// Workspace backups, export and deletion.
// Backups: once a day, each company workspace's data and settings are copied to backups/<id>/<date>. The newest 14 are kept.
// They live in the same storage as the app, so they guard against mistakes (a bad import, a wrong delete), not against
// the hosting provider losing data. Deleting a workspace deletes its backups too, as promised to design partners.
import { loadOrg, loadOrgIndex, orgMetaKey, orgDataKey, ORG_INDEX } from "./orgs.mjs";

export const KEEP_DAYS = 14;
export const backupKey = (id, day) => `backups/${id}/${day}`;
const LAST = "backups-last";

async function listKeys(store, prefix) {
  const out = []; let cursor;
  do { const r = await store.list({ prefix, ...(cursor ? { cursor } : {}) }); out.push(...(r.blobs || []).map((b) => b.key)); cursor = r.cursor; } while (cursor);
  return out;
}
export async function listBackups(store, id) {
  return (await listKeys(store, `backups/${id}/`)).map((k) => k.split("/").pop()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
}

// Copies every workspace. Safe to run more than once a day: the day's copy is replaced.
export async function runBackups(store, today) {
  const ix = await loadOrgIndex(store), done = [], errors = [];
  for (const id of Object.keys(ix.items)) {
    try {
      const meta = await loadOrg(store, id); if (!meta) continue;
      const data = await store.get(orgDataKey(id), { type: "json" }); if (!data) continue;
      await store.setJSON(backupKey(id, today), { id, day: today, at: new Date().toISOString(), meta, data });
      const days = await listBackups(store, id);
      for (const d of days.slice(KEEP_DAYS)) await store.delete(backupKey(id, d));
      done.push(id);
    } catch (e) { errors.push(id); }
  }
  const last = { at: new Date().toISOString(), day: today, workspaces: done.length, errors };
  await store.setJSON(LAST, last);
  return last;
}
export const lastBackupRun = (store) => store.get(LAST, { type: "json" });

// Puts a workspace back to a day's copy. Today's data is backed up first, so a restore can be undone.
export async function restoreBackup(store, id, day, today) {
  const b = await store.get(backupKey(id, day), { type: "json" });
  if (!b || !b.data) return "No backup for that day";
  const cur = await store.get(orgDataKey(id), { type: "json" });
  if (cur) await store.setJSON(backupKey(id, today), { id, day: today, at: new Date().toISOString(), meta: await loadOrg(store, id), data: cur, beforeRestore: true });
  const data = { ...b.data, log: [{ at: new Date().toISOString(), by: "Site admin", text: `Restored from the backup of ${day}` }, ...(b.data.log || [])].slice(0, 200) };
  await store.setJSON(orgDataKey(id), data);
  return null;
}

// Everything about a workspace, for the company to keep. Sign-in ids are left out; they mean nothing outside Leave Ledger.
export function exportBundle(meta, D, today) {
  return {
    exportedOn: today, format: "leave-ledger-export-1",
    workspace: { id: meta.id, name: meta.name, created: meta.created, ownerEmail: meta.ownerEmail, designPartner: !!meta.realData, users: meta.members.map(({ sub, ...m }) => m) },
    company: D.company, employees: D.employees, leaves: D.cases, activityLog: D.log || [],
  };
}

// Deletes the workspace's data, settings, backups and index entry. Cannot be undone.
export async function deleteWorkspace(store, id) {
  for (const k of await listKeys(store, `backups/${id}/`)) await store.delete(k);
  await store.delete(orgDataKey(id));
  await store.delete(orgMetaKey(id));
  const ix = (await store.get(ORG_INDEX, { type: "json" })) || { items: {} };
  delete ix.items[id];
  await store.setJSON(ORG_INDEX, ix);
}
