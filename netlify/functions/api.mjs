import { getStore } from "@netlify/blobs";
import { handle } from "../lib/handler.mjs";

export default async (req) => {
  const store = getStore({ name: "leave-ledger", consistency: "strong" });
  const env = { LL_TEST_PASSWORD: Netlify.env.get("LL_TEST_PASSWORD"), LL_SECRET: Netlify.env.get("LL_SECRET") };
  return handle(req, store, env);
};

export const config = { path: "/api/*" };
