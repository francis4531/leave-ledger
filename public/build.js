// Shows the build number at the bottom of the page, from build.json written on each deploy.
fetch("/build.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b) => {
  if (!b || !b.commit) return;
  const when = new Date(b.builtAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
  const el = document.createElement("p");
  el.className = "buildtag";
  el.textContent = `Build ${b.number ? b.number + " · " : ""}${b.commit} · ${when} PT`;
  el.style.cssText = "margin:8px auto 24px;padding:0 16px;max-width:1220px;font-size:.72rem;color:#7b8794;text-align:right;font-family:ui-monospace,Menlo,monospace";
  document.body.appendChild(el);
}).catch(() => {});
