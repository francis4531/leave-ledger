import { getStore } from "@netlify/blobs";
import { handle } from "../lib/handler.mjs";

export default async (req) => {
  const store = getStore({ name: "leave-ledger", consistency: "strong" });
  const env = {};
  for (const k of ["LL_TEST_PASSWORD", "LL_SECRET", "ANTHROPIC_API_KEY", "LL_MODEL", "LL_AI_PER_USER_DAY", "LL_AI_DAY", "LL_GITHUB_TOKEN", "LL_GITHUB_REPO", "LL_GITHUB_BRANCH", "LL_MODE", "LL_ADMIN_PASSWORD", "LL_AI_PER_INVITE_DAY", "LL_AI_PER_SPACE_DAY", "LL_GOOGLE_CLIENT_ID", "LL_GOOGLE_CLIENT_SECRET", "LL_ADMIN_EMAILS", "LL_WORKSPACE_SIGNUP", "LL_PUBLIC_URL", "LL_CONTACT_EMAIL"]) env[k] = Netlify.env.get(k);
  return handle(req, store, env);
};

export const config = { path: "/api/*" };
