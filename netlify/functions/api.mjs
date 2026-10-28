import { getStore } from "@netlify/blobs";
import { handle } from "../lib/handler.mjs";

export default async (req) => {
  const store = getStore({ name: "leave-ledger", consistency: "strong" });
  const env = {};
  for (const k of ["LL_TEST_PASSWORD", "LL_SECRET", "ANTHROPIC_API_KEY", "LL_MODEL", "LL_AI_PER_USER_DAY", "LL_AI_DAY", "LL_GITHUB_TOKEN", "LL_GITHUB_REPO", "LL_GITHUB_BRANCH"]) env[k] = Netlify.env.get(k);
  return handle(req, store, env);
};

export const config = { path: "/api/*" };
