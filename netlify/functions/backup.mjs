// Daily backup of every company workspace. Runs on Netlify's schedule.
import { getStore } from "@netlify/blobs";
import { runBackups } from "../lib/backup.mjs";
import { cleanupSandboxes } from "../lib/handler.mjs";

export default async () => {
  const store = getStore({ name: "leave-ledger", consistency: "strong" });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const r = await runBackups(store, today);
  console.log(`Backed up ${r.workspaces} workspaces${r.errors.length ? `, ${r.errors.length} failed` : ""}`);
  const gone = await cleanupSandboxes(store); // sandbox copies older than 7 days
  console.log(`Removed ${gone} old sandboxes`);
};

export const config = { schedule: "@daily" };
