// Daily backup of every company workspace. Runs on Netlify's schedule.
import { getStore } from "@netlify/blobs";
import { runBackups } from "../lib/backup.mjs";

export default async () => {
  const store = getStore({ name: "leave-ledger", consistency: "strong" });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const r = await runBackups(store, today);
  console.log(`Backed up ${r.workspaces} workspaces${r.errors.length ? `, ${r.errors.length} failed` : ""}`);
};

export const config = { schedule: "@daily" };
