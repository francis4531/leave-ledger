// A node:test reporter that writes one JSON document with every finished test, for the admin /tests page.
// Used by scripts/run-tests.mjs next to the usual spec reporter.
export default async function* jsonReporter(source) {
  const events = [];
  for await (const ev of source) {
    if (ev.type !== "test:pass" && ev.type !== "test:fail") continue;
    const d = ev.data, err = d.details && d.details.error;
    events.push({
      ok: ev.type === "test:pass", name: d.name, nesting: d.nesting, file: d.file || null,
      type: (d.details && d.details.type) || "test", ms: Math.round((d.details && d.details.duration_ms) || 0),
      skip: !!d.skip, error: err ? String((err.cause && err.cause.message) || err.message || err).slice(0, 600) : null,
    });
  }
  yield JSON.stringify(events);
}
