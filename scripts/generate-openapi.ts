/**
 * Writes the committed copy of the OpenAPI document to openapi.json.
 *
 * Run with an empty environment (no APP_VERSION) so the document reports
 * "dev" — see src/lib/app-version.ts — and the committed file does not churn
 * on every release. CI regenerates it and diffs against what's committed
 * (see .github/workflows/ci.yml) so a route that changes shape without this
 * being re-run fails the build instead of quietly drifting from
 * GET /openapi.json.
 *
 * Side-effect import: buildDocument() reads the registry documented() fills
 * as each route file is evaluated. src/app.ts is the one place that
 * statically imports every route, so importing it here is what makes the
 * registry non-empty — see the same note in
 * tests/unit/openapi-document.test.ts.
 */
import "../src/app";
import { buildDocument } from "../src/openapi/document";

const doc = buildDocument({});
const outPath = new URL("../openapi.json", import.meta.url);

await Bun.write(outPath, `${JSON.stringify(doc, null, 2)}\n`);

console.log(`[OPENAPI] Wrote ${outPath.pathname}`);

// Importing src/app pulls in redis and postgres clients that open connections
// and keep the event loop alive (see scripts/migrate.ts and scripts/seed.ts
// for the same fix) — without this the process hangs after the file is
// written instead of exiting.
process.exit(0);
