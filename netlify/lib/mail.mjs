// Sends plain-text email through Resend (resend.com). Off until LL_RESEND_API_KEY and LL_MAIL_FROM are set.
// Only real workspaces ever send; the test site and sample copies show the message in Leave Ledger instead.
export const mailOn = (env) => !!(env.LL_RESEND_API_KEY && env.LL_MAIL_FROM);
const FAKE = /(\.example|@example\.(com|org|net))$/i;
export const canEmail = (env, kind, to) => kind === "org" && mailOn(env) && !!to && !FAKE.test(to);

export async function sendMail(env, { to, subject, text, replyTo }) {
  if (!mailOn(env)) return { status: "off" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.LL_RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.LL_MAIL_FROM, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { status: "failed", code: r.status };
    const j = await r.json().catch(() => ({}));
    return { status: "sent", id: j.id || null };
  } catch (e) { return { status: "failed", code: "network" }; }
}
