# n8n Invoice Reconciliation Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible Spanish n8n demo that reconciles ten routine invoices automatically, sends two exceptions to AgentDialog for a typed human decision, reports the estimated savings, and explains the flow in a finished 1080p video.

**Architecture:** Pure JavaScript modules own fixture validation, reconciliation, AgentDialog payloads, LLM parsing, and savings calculations. A build script embeds those tested modules into a pinned n8n workflow JSON; Docker Compose runs n8n locally while the workflow calls the remote OpenAI-compatible Qwen server and AgentDialog's public REST API. The verified live workflow supplies sanitized screens and facts to the existing Python/Swift audiovisual pipeline.

**Tech Stack:** Bun tests and JavaScript ES modules, n8n `2.37.7`, Docker Compose, AgentDialog REST API, `llama.cpp` OpenAI-compatible API, JSON fixtures, Fumadocs/Next.js with npm, Python 3/Pillow/unittest, ElevenLabs, Swift/AppKit/AVFoundation/CoreImage, macOS `afinfo`, `ffprobe`

**Spec:** `docs/superpowers/specs/2026-09-02-n8n-invoice-reconciliation-design.md`

## Global Constraints

- Run n8n locally with `docker compose`; never use `docker-compose`.
- Pin the image to `docker.n8n.io/n8nio/n8n:2.37.7`, the stable release verified on 2026-09-02.
- Bind n8n only to `127.0.0.1:5678` and persist its application state in a named volume.
- Use `https://api.agentdialog.io/api/v1`; do not introduce `.com` or `.dev` AgentDialog domains.
- The workflow must call unauthenticated `POST /agent/register` itself. Do not require an `AGENTDIALOG_API_KEY` before execution.
- Keep the returned `mge_ag_...` key in the live execution only; disable saved execution data and never write the key into Git, fixtures, reports, screenshots, video, or docs.
- A demo execution registers one uniquely slugged agent and is subject to the public limit of ten registrations per hour and IP.
- Use `http://192.168.100.58:8000/v1` as the demo `LLM_BASE_URL` and the detected `llama.cpp` model id as the default `LLM_MODEL`; keep both configurable.
- Qwen is advisory. Deterministic rules select exceptions, and only a human can approve or reject them.
- Process exactly twelve fictional invoices: ten exact matches and two human-review exceptions.
- Use integer euro cents in machine data. Render human-facing amounts as EUR.
- Default savings inputs are five minutes per fully manual review, two minutes per explained exception, and 30 EUR/hour; the expected demo result is 56 minutes and 28 EUR saved.
- No OCR, email inbox, Google product, Slack, accounting system, real invoice, real payment, or annualized marketing claim.
- REST request fields stay `snake_case`; all agent routes are read through their top-level `{ data: ... }` envelope.
- Poll AgentDialog no more often than every fifteen seconds and handle `pending`, `assigned`, `needs_context`, `answered`, `cancelled`, and `expired` explicitly.
- All guide copy, narration, captions, and subtitles are Spanish. Code, code comments, node identifiers, and commit messages are English.
- The finished video is 1920 × 1080, Spanish, subtitled, and 80–90 seconds long.
- Do not modify or rename files under `docs-site/video-src/hola-mundo-claude-mcp/`.
- `docs-site` continues to use npm, not Bun.
- The worktree already contains unrelated changes. Inspect diffs before every commit and stage only the files named by that task.

---

## File Map

### Executable example

- `examples/n8n-invoice-reconciliation/.env.example`: public endpoints, model id, timeout, and savings defaults; no secrets.
- `examples/n8n-invoice-reconciliation/.gitignore`: local `.env`, generated report files, and temporary test output.
- `examples/n8n-invoice-reconciliation/compose.yaml`: pinned, loopback-only n8n service with safe execution-retention settings and mounted example files.
- `examples/n8n-invoice-reconciliation/README.md`: Spanish setup, execution, security, rate-limit, and troubleshooting guide.
- `examples/n8n-invoice-reconciliation/fixtures/invoices.json`: twelve fictional invoice records in integer cents.
- `examples/n8n-invoice-reconciliation/fixtures/purchase-orders.json`: twelve fictional purchase-order records.
- `examples/n8n-invoice-reconciliation/src/reconcile.mjs`: fixture validation and deterministic reconciliation.
- `examples/n8n-invoice-reconciliation/src/llm.mjs`: Qwen request body and defensive structured-response parsing.
- `examples/n8n-invoice-reconciliation/src/agentdialog.mjs`: registration/query payload builders and query-state normalization.
- `examples/n8n-invoice-reconciliation/src/report.mjs`: aggregate results, savings calculation, and secret scan.
- `examples/n8n-invoice-reconciliation/scripts/build-workflow.mjs`: deterministic generator for the importable n8n workflow.
- `examples/n8n-invoice-reconciliation/scripts/check-services.mjs`: read-only checks for the Qwen model catalog and AgentDialog health.
- `examples/n8n-invoice-reconciliation/workflows/invoice-reconciliation.json`: generated workflow imported by n8n.
- `examples/n8n-invoice-reconciliation/output/.gitkeep`: tracked empty output directory.
- `examples/n8n-invoice-reconciliation/tests/fixtures.test.mjs`: fixture schema and scenario tests.
- `examples/n8n-invoice-reconciliation/tests/reconcile.test.mjs`: deterministic classification tests.
- `examples/n8n-invoice-reconciliation/tests/integrations.test.mjs`: LLM, AgentDialog, state, report, and redaction tests.
- `examples/n8n-invoice-reconciliation/tests/workflow.test.mjs`: generated node graph, environment, safety, and import contract tests.

### Public documentation

- `docs-site/content/docs/n8n-invoice-reconciliation.mdx`: Spanish public guide with the finished video.
- `docs-site/content/docs/meta.json`: one new navigation entry, preserving all existing and uncommitted entries.

### Audiovisual source and outputs

- `docs-site/video-src/n8n-invoice-reconciliation/scenes.json`: nine-scene Spanish story contract.
- `docs-site/video-src/n8n-invoice-reconciliation/generate_voiceover.py`: safe ElevenLabs narration generator.
- `docs-site/video-src/n8n-invoice-reconciliation/render_slides.py`: batch, exception, real-screen, savings, poster, timeline, and SRT renderer.
- `docs-site/video-src/n8n-invoice-reconciliation/render_video.swift`: 1080p H.264 and narration composition.
- `docs-site/video-src/n8n-invoice-reconciliation/render.sh`: reproducible local render entry point.
- `docs-site/video-src/n8n-invoice-reconciliation/test_video_source.py`: story, source, asset, subtitle, and timing tests.
- `docs-site/video-src/n8n-invoice-reconciliation/README.md`: Spanish capture, narration, and regeneration guide.
- `docs-site/video-src/n8n-invoice-reconciliation/screens/01-n8n-workflow.png`: real n8n canvas, no execution data.
- `docs-site/video-src/n8n-invoice-reconciliation/screens/02-batch-classification.png`: ten automatic and two exception results without email or key.
- `docs-site/video-src/n8n-invoice-reconciliation/screens/03-agentdialog-decision.png`: real fictional invoice decision without personal data.
- `docs-site/video-src/n8n-invoice-reconciliation/screens/04-final-report.png`: real report summary.
- `docs-site/video-src/n8n-invoice-reconciliation/voiceover/*.mp3`: one Spanish narration track per scene.
- `docs-site/public/videos/n8n-invoice-reconciliation.mp4`: finished video.
- `docs-site/public/videos/n8n-invoice-reconciliation-poster.png`: first-scene poster.
- `docs-site/public/videos/n8n-invoice-reconciliation.srt`: Spanish subtitles.

---

### Task 1: Create the Fixture Contract and Deterministic Reconciler

**Files:**
- Create: `examples/n8n-invoice-reconciliation/fixtures/invoices.json`
- Create: `examples/n8n-invoice-reconciliation/fixtures/purchase-orders.json`
- Create: `examples/n8n-invoice-reconciliation/src/reconcile.mjs`
- Create: `examples/n8n-invoice-reconciliation/tests/fixtures.test.mjs`
- Create: `examples/n8n-invoice-reconciliation/tests/reconcile.test.mjs`

**Interfaces:**
- Consumes: arrays of `Invoice` and `PurchaseOrder` records whose monetary fields are integer cents.
- Produces: `validateFixtures(invoices, purchaseOrders) -> void` and `reconcileBatch(invoices, purchaseOrders) -> { automatic: ReconciliationResult[], exceptions: ReconciliationException[] }`.
- `ReconciliationException.reason_codes` uses only `unexpected_charge` and `identity_or_description_mismatch` in the approved fixture set.

- [ ] **Step 1: Write failing fixture-contract tests**

Create `tests/fixtures.test.mjs` with checks that load both JSON files through `Bun.file`, assert twelve unique invoice ids and twelve unique purchase-order ids, require integer `subtotal_cents`, `tax_cents`, and `total_cents`, verify `subtotal_cents + tax_cents === total_cents`, and ensure every `purchase_order_id` resolves.

Use these exact assertions for the approved scenarios:

```js
import { describe, expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const invoices = await Bun.file(new URL("fixtures/invoices.json", root)).json();
const orders = await Bun.file(new URL("fixtures/purchase-orders.json", root)).json();

describe("invoice fixtures", () => {
  test("contain twelve linked fictional records in integer cents", () => {
    expect(invoices).toHaveLength(12);
    expect(orders).toHaveLength(12);
    expect(new Set(invoices.map((invoice) => invoice.id)).size).toBe(12);
    expect(new Set(orders.map((order) => order.id)).size).toBe(12);
    const orderIds = new Set(orders.map((order) => order.id));
    for (const invoice of invoices) {
      expect(orderIds.has(invoice.purchase_order_id)).toBe(true);
      for (const field of ["subtotal_cents", "tax_cents", "total_cents"]) {
        expect(Number.isInteger(invoice[field])).toBe(true);
      }
      expect(invoice.subtotal_cents + invoice.tax_cents).toBe(invoice.total_cents);
    }
  });

  test("locks the two review scenarios", () => {
    const freight = invoices.find((invoice) => invoice.id === "INV-1011");
    const ambiguous = invoices.find((invoice) => invoice.id === "INV-1012");
    expect(freight.total_cents).toBe(
      orders.find((order) => order.id === "PO-1011").total_cents + 6_000,
    );
    expect(ambiguous.vendor).toBe("DataCloud Iberia S.L.");
    expect(orders.find((order) => order.id === "PO-1012").vendor).toBe(
      "Data Cloud Iberia SL",
    );
  });
});
```

- [ ] **Step 2: Run the fixture tests and verify they fail**

Run:

```bash
bun test examples/n8n-invoice-reconciliation/tests/fixtures.test.mjs
```

Expected: FAIL because both fixture files are missing.

- [ ] **Step 3: Create the twelve purchase orders and invoices**

Create exact-match pairs `PO-1001`/`INV-1001` through `PO-1010`/`INV-1010`. Use distinct fictional vendors and descriptions, `EUR`, 21% tax, and totals between 121 EUR and 2,420 EUR. Create the two approved exceptions:

| Pair | Order | Invoice | Expected reason |
|---|---|---|---|
| `PO-1011` / `INV-1011` | `subtotal_cents: 100000`, `tax_cents: 21000`, `total_cents: 121000` | add line `Transporte`, keep tax unchanged, `total_cents: 127000` | `unexpected_charge` |
| `PO-1012` / `INV-1012` | vendor `Data Cloud Iberia SL`, description `Soporte de plataforma septiembre` | vendor `DataCloud Iberia S.L.`, description `Servicio soporte plataforma Sept.`, same amounts | `identity_or_description_mismatch` |

Every object must also include `id`, `purchase_order_id` where applicable, `vendor`, `description`, `currency`, `subtotal_cents`, `tax_cents`, `total_cents`, and ISO dates. Do not use real companies or people.

- [ ] **Step 4: Run the fixture tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Write failing reconciliation tests**

Create `tests/reconcile.test.mjs`:

```js
import { describe, expect, test } from "bun:test";
import { reconcileBatch, validateFixtures } from "../src/reconcile.mjs";

const base = new URL("../", import.meta.url);
const invoices = await Bun.file(new URL("fixtures/invoices.json", base)).json();
const orders = await Bun.file(new URL("fixtures/purchase-orders.json", base)).json();

describe("reconcileBatch", () => {
  test("classifies ten exact matches and two review exceptions", () => {
    validateFixtures(invoices, orders);
    const result = reconcileBatch(invoices, orders);
    expect(result.automatic).toHaveLength(10);
    expect(result.exceptions).toHaveLength(2);
    expect(result.automatic.every((item) => item.status === "auto_reconciled")).toBe(true);
    expect(result.exceptions.map((item) => item.invoice.id)).toEqual([
      "INV-1011",
      "INV-1012",
    ]);
  });

  test("explains each approved exception with stable reason codes", () => {
    const { exceptions } = reconcileBatch(invoices, orders);
    expect(exceptions[0].reason_codes).toContain("unexpected_charge");
    expect(exceptions[0].difference_cents).toBe(6_000);
    expect(exceptions[1].reason_codes).toContain(
      "identity_or_description_mismatch",
    );
  });

  test("rejects duplicate invoice ids before registration", () => {
    expect(() => validateFixtures([...invoices, invoices[0]], orders)).toThrow(
      "Duplicate invoice id: INV-1001",
    );
  });
});
```

- [ ] **Step 6: Run the reconciliation test and verify it fails**

Run:

```bash
bun test examples/n8n-invoice-reconciliation/tests/reconcile.test.mjs
```

Expected: FAIL resolving `src/reconcile.mjs`.

- [ ] **Step 7: Implement the minimal deterministic engine**

Implement `validateFixtures` and `reconcileBatch` without fuzzy matching or LLM calls. Normalize strings only for surrounding whitespace; exact vendor and description equality remains the automatic-approval boundary. Each automatic result includes `invoice_id`, `purchase_order_id`, `status`, and `checks`. Each exception includes the original `invoice`, matched `purchase_order`, `difference_cents`, and `reason_codes`.

The decision rule is exact:

```js
const exact =
  invoice.vendor === order.vendor &&
  invoice.description === order.description &&
  invoice.currency === order.currency &&
  invoice.subtotal_cents === order.subtotal_cents &&
  invoice.tax_cents === order.tax_cents &&
  invoice.total_cents === order.total_cents;
```

- [ ] **Step 8: Run both tests and commit**

Run:

```bash
bun test examples/n8n-invoice-reconciliation/tests/fixtures.test.mjs \
  examples/n8n-invoice-reconciliation/tests/reconcile.test.mjs
```

Expected: all tests PASS.

Commit only Task 1 files:

```bash
git add examples/n8n-invoice-reconciliation/fixtures \
  examples/n8n-invoice-reconciliation/src/reconcile.mjs \
  examples/n8n-invoice-reconciliation/tests/fixtures.test.mjs \
  examples/n8n-invoice-reconciliation/tests/reconcile.test.mjs
git commit -m "Add invoice reconciliation fixtures"
```

### Task 2: Implement the LLM, AgentDialog, State, and Report Contracts

**Files:**
- Create: `examples/n8n-invoice-reconciliation/src/llm.mjs`
- Create: `examples/n8n-invoice-reconciliation/src/agentdialog.mjs`
- Create: `examples/n8n-invoice-reconciliation/src/report.mjs`
- Create: `examples/n8n-invoice-reconciliation/tests/integrations.test.mjs`

**Interfaces:**
- Consumes: the exceptions from `reconcileBatch`, the form email, execution id, public configuration, and AgentDialog query responses.
- Produces: `buildLlmRequest(exception, model)`, `parseLlmResponse(response)`, `buildRegistration({ executionId, attempt, model })`, `buildHumanQuery({ exception, analysis, reviewerEmail, executionId, timeoutMinutes })`, `normalizeQueryState(query)`, `calculateSavings({ invoiceCount, exceptionCount, manualMinutes, exceptionMinutes, hourlyCostEur })`, `buildReport({ automatic, reviewed, savings })`, and `assertNoSecrets(value)`.

- [ ] **Step 1: Write failing integration-contract tests**

Create `tests/integrations.test.mjs` with these required cases:

```js
import { describe, expect, test } from "bun:test";
import {
  buildHumanQuery,
  buildRegistration,
  normalizeQueryState,
} from "../src/agentdialog.mjs";
import { buildLlmRequest, parseLlmResponse } from "../src/llm.mjs";
import { assertNoSecrets, buildReport, calculateSavings } from "../src/report.mjs";

const exception = {
  invoice: { id: "INV-1011", vendor: "Fictional Logistics SL", total_cents: 127000 },
  purchase_order: { id: "PO-1011", vendor: "Fictional Logistics SL", total_cents: 121000 },
  difference_cents: 6000,
  reason_codes: ["unexpected_charge"],
};

test("registration needs no existing API key and gets a unique retry slug", () => {
  const first = buildRegistration({ executionId: "42", attempt: 0, model: "qwen" });
  const retry = buildRegistration({ executionId: "42", attempt: 1, model: "qwen" });
  expect(first.slug).toBe("n8n-invoice-reconciler-42");
  expect(retry.slug).toBe("n8n-invoice-reconciler-42-r1");
  expect(first.provider).toBe("custom");
  expect(JSON.stringify(first)).not.toContain("apiKey");
});

test("human query is Spanish, medium risk, decidable, and consequence-aware", () => {
  const query = buildHumanQuery({
    exception,
    analysis: { summary: "Hay 60 EUR no previstos.", confidence: 0.82 },
    reviewerEmail: "reviewer@example.test",
    executionId: "42",
    timeoutMinutes: 60,
  });
  expect(query.query_type).toBe("expert_query");
  expect(query.risk).toBe("medium");
  expect(query.language).toBe("es");
  expect(query.target_human_email).toBe("reviewer@example.test");
  expect(query.subject.body).toContain("INV-1011");
  expect(query.answer_space.options.map((option) => option.id)).toEqual([
    "approve",
    "reject",
    "keep_pending",
  ]);
  expect(query.answer_space.options.every((option) => option.consequence)).toBe(true);
});

test("invalid Qwen output becomes an advisory fallback", () => {
  expect(parseLlmResponse({ choices: [{ message: { content: "not json" } }] })).toEqual({
    available: false,
    summary: null,
    likely_cause: null,
    recommendation: null,
    confidence: null,
  });
});

test("normalizes all six AgentDialog states without implicit approval", () => {
  for (const status of ["pending", "assigned", "needs_context", "cancelled", "expired"]) {
    expect(normalizeQueryState({ status }).decision).not.toBe("approve");
  }
  expect(
    normalizeQueryState({
      status: "answered",
      answer: { kind: "choice", option_ids: ["approve"] },
    }).decision,
  ).toBe("approve");
});

test("calculates the approved demo savings and excludes agent keys", () => {
  const savings = calculateSavings({
    invoiceCount: 12,
    exceptionCount: 2,
    manualMinutes: 5,
    exceptionMinutes: 2,
    hourlyCostEur: 30,
  });
  expect(savings).toMatchObject({ manual_total_minutes: 60, demo_human_minutes: 4, saved_minutes: 56, saved_eur: 28 });
  const report = buildReport({ automatic: [], reviewed: [], savings });
  expect(() => assertNoSecrets(report)).not.toThrow();
  expect(() => assertNoSecrets({ token: "mge_ag_secret" })).toThrow("Agent key detected");
});
```

- [ ] **Step 2: Run the tests and verify the modules are missing**

Run:

```bash
bun test examples/n8n-invoice-reconciliation/tests/integrations.test.mjs
```

Expected: FAIL resolving one or more `src/*.mjs` modules.

- [ ] **Step 3: Implement the four pure contracts**

`buildLlmRequest` must request a JSON object, set temperature to `0.1`, and distinguish evidence from advisory text in its Spanish system prompt. `parseLlmResponse` accepts either a JSON string in `choices[0].message.content` or a directly supplied object and returns the documented fallback for missing fields, malformed JSON, non-finite confidence, or confidence outside `[0, 1]`.

`buildRegistration` returns:

```js
{
  slug: attempt === 0
    ? `n8n-invoice-reconciler-${executionId}`
    : `n8n-invoice-reconciler-${executionId}-r${attempt}`,
  displayName: "Conciliador de facturas n8n",
  description: "Demo de conciliación de facturas con excepciones humanas",
  provider: "custom",
  model,
  capabilities: ["invoice-reconciliation", "human-query"],
  metadata: { demo: "n8n-invoice-reconciliation", execution_id: executionId },
}
```

`buildHumanQuery` uses a choice with `select: "one"`, the three approved ids, a complete inline `subject.body`, and these consequences: mark the fictional invoice reconciled at invoice total; exclude it from the fictional batch; or keep it unresolved. It must never put the model recommendation into the evidence section.

`normalizeQueryState` maps `answered` choices to their option id. It maps `needs_context`, `cancelled`, and `expired` to `keep_pending`; `pending` and `assigned` return `terminal: false`; no unknown or malformed state can approve.

`buildReport` returns only safe business data and calls `assertNoSecrets` before returning. `assertNoSecrets` scans serialized output for both `mge_ag_` and case-insensitive keys named `apiKey`, `api_key`, `authorization`, or `token`.

- [ ] **Step 4: Run all example tests and commit**

Run:

```bash
bun test examples/n8n-invoice-reconciliation/tests
```

Expected: all tests PASS.

Commit only Task 2 files:

```bash
git add examples/n8n-invoice-reconciliation/src/llm.mjs \
  examples/n8n-invoice-reconciliation/src/agentdialog.mjs \
  examples/n8n-invoice-reconciliation/src/report.mjs \
  examples/n8n-invoice-reconciliation/tests/integrations.test.mjs
git commit -m "Add invoice review integration contracts"
```

### Task 3: Generate the Importable n8n Workflow

**Files:**
- Create: `examples/n8n-invoice-reconciliation/scripts/build-workflow.mjs`
- Create: `examples/n8n-invoice-reconciliation/workflows/invoice-reconciliation.json`
- Create: `examples/n8n-invoice-reconciliation/tests/workflow.test.mjs`

**Interfaces:**
- Consumes: the four pure modules from Tasks 1–2 and environment variables defined by the spec.
- Produces: `buildWorkflow() -> object` and deterministic JSON at `workflows/invoice-reconciliation.json`.
- The generated workflow exposes an n8n form path `invoice-reconciliation-demo` with required field `reviewer_email`.

- [ ] **Step 1: Write failing workflow graph tests**

Create `tests/workflow.test.mjs`. It must call the builder, compare it byte-for-byte with the committed JSON plus one trailing newline, and assert these exact node names:

```js
const requiredNodes = [
  "Start reconciliation",
  "Read invoices",
  "Read purchase orders",
  "Parse invoices",
  "Parse purchase orders",
  "Merge fixtures",
  "Reconcile batch",
  "Prepare registration",
  "Register agent",
  "Registration succeeded?",
  "Prepare registration retry",
  "Retry agent registration",
  "Registration retry succeeded?",
  "Split exceptions",
  "Analyze exception with Qwen",
  "Normalize Qwen analysis",
  "Build human query",
  "Create human query",
  "Wait 15 seconds",
  "Get human query",
  "Query finished?",
  "Apply human decision",
  "Build final report",
  "Convert report to file",
  "Write report",
];
```

Also assert:

- one Form Trigger with form path `invoice-reconciliation-demo` and required email field;
- no literal `mge_ag_`, reviewer email, or `AGENTDIALOG_API_KEY`;
- environment expressions for `AGENTDIALOG_BASE_URL`, `LLM_BASE_URL`, `LLM_MODEL`, `QUERY_TIMEOUT_MINUTES`, `MANUAL_REVIEW_MINUTES`, `EXCEPTION_REVIEW_MINUTES`, and `HOURLY_COST_EUR`;
- a fifteen-second Wait node;
- a loop from nonterminal `pending`/`assigned` results back to the Wait node;
- all other query states reach `Apply human decision`;
- fixture parsing and `Reconcile batch` precede every registration node;
- `401` and `403` query responses terminate further AgentDialog calls without approving;
- per-invoice `422`, transport errors, and terminal non-answer states continue to the final report;
- a final write path `/demo/output/reconciliation-report.json`;
- `active: false` in the distributable JSON.

- [ ] **Step 2: Run the workflow tests and verify they fail**

Run:

```bash
bun test examples/n8n-invoice-reconciliation/tests/workflow.test.mjs
```

Expected: FAIL because the builder and workflow JSON are missing.

- [ ] **Step 3: Implement the deterministic workflow builder**

Build the workflow as data, not by hand-editing generated JSON. Use stable UUID strings for node ids and stable `[x, y]` positions. Read each pure module with `Bun.file`; remove only top-level `export ` tokens before embedding its functions into Code nodes. Append a short n8n adapter after the embedded source rather than duplicating business logic.

The core adapter pattern is:

```js
function executableModule(source, adapter) {
  return `${source.replace(/^export /gm, "")}\n${adapter}\n`;
}

const reconcileCode = executableModule(
  await Bun.file(new URL("../src/reconcile.mjs", import.meta.url)).text(),
  "const result = reconcileBatch($json.invoices, $json.purchase_orders); return [{ json: { ...$json, ...result } }];",
);
```

Use n8n built-in nodes only:

- `n8n-nodes-base.formTrigger` for asynchronous form submission confirmation;
- `n8n-nodes-base.readWriteFile` and `n8n-nodes-base.extractFromFile` for the two JSON fixtures;
- `n8n-nodes-base.merge`, `n8n-nodes-base.code`, `n8n-nodes-base.if`, `n8n-nodes-base.splitOut`, and `n8n-nodes-base.wait` for orchestration;
- `n8n-nodes-base.httpRequest` for Qwen and AgentDialog;
- `n8n-nodes-base.convertToFile` plus `readWriteFile` for the final report.

Configure HTTP requests to return status and body without throwing on ordinary HTTP error statuses. Registration accepts only `201`; on `409`, build attempt `1` and retry once; all other registration results terminate with the response code and AgentDialog error message. Qwen failures continue through the fallback parser. AgentDialog query creation preserves `reason` and `remedy` from `422` in the reviewed-item result. Query `401` and `403` responses stop further AgentDialog requests and produce an authentication failure; transport errors and per-invoice `422` responses become safe error results so the remaining invoice items continue.

The registration Authorization header is absent. Query creation and polling use this expression without ever hardcoding its value:

```text
={{ 'Bearer ' + $('Register agent').first().json.body.data.apiKey }}
```

The retry-success path must reference `Retry agent registration` instead. Normalize both success branches to the same `{ api_key, agent_id }` execution-only shape, and ensure `Build final report` drops that shape before calling `buildReport`.

- [ ] **Step 4: Generate the workflow and run tests**

Run:

```bash
bun examples/n8n-invoice-reconciliation/scripts/build-workflow.mjs
bun test examples/n8n-invoice-reconciliation/tests
```

Expected: builder writes one JSON file; all tests PASS.

- [ ] **Step 5: Inspect the generated artifact and commit**

Run:

```bash
git diff --check -- examples/n8n-invoice-reconciliation
rg -n "mge_ag_|AGENTDIALOG_API_KEY|reviewer@example.test" \
  examples/n8n-invoice-reconciliation/workflows/invoice-reconciliation.json
```

Expected: `git diff --check` is clean; `rg` returns no matches.

Commit:

```bash
git add examples/n8n-invoice-reconciliation/scripts/build-workflow.mjs \
  examples/n8n-invoice-reconciliation/workflows/invoice-reconciliation.json \
  examples/n8n-invoice-reconciliation/tests/workflow.test.mjs
git commit -m "Add n8n invoice reconciliation workflow"
```

### Task 4: Add the Safe Local n8n Runtime

**Files:**
- Create: `examples/n8n-invoice-reconciliation/.env.example`
- Create: `examples/n8n-invoice-reconciliation/.gitignore`
- Create: `examples/n8n-invoice-reconciliation/compose.yaml`
- Create: `examples/n8n-invoice-reconciliation/output/.gitkeep`
- Modify: `examples/n8n-invoice-reconciliation/tests/workflow.test.mjs`

**Interfaces:**
- Consumes: generated workflow and fixture directories from Tasks 1–3.
- Produces: one `n8n` Compose service at `http://127.0.0.1:5678` with files mounted below `/demo`.

- [ ] **Step 1: Add failing runtime-configuration tests**

Extend `workflow.test.mjs` to read `compose.yaml` and `.env.example` as text and assert:

```js
expect(compose).toContain("docker.n8n.io/n8nio/n8n:2.37.7");
expect(compose).toContain('"127.0.0.1:5678:5678"');
for (const setting of [
  "EXECUTIONS_DATA_SAVE_ON_SUCCESS: none",
  "EXECUTIONS_DATA_SAVE_ON_ERROR: none",
  "EXECUTIONS_DATA_SAVE_ON_PROGRESS: false",
  "EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS: false",
]) expect(compose).toContain(setting);
expect(compose).toContain("./fixtures:/demo/fixtures:ro");
expect(compose).toContain("./workflows:/demo/workflows:ro");
expect(compose).toContain("./output:/demo/output");
expect(envExample).not.toContain("mge_ag_");
expect(envExample).not.toContain("AGENTDIALOG_API_KEY");
```

- [ ] **Step 2: Run the test and verify it fails**

Run the Task 3 test command. Expected: FAIL because runtime files are missing.

- [ ] **Step 3: Create `.env.example` and `.gitignore`**

Use these exact public defaults:

```dotenv
AGENTDIALOG_BASE_URL=https://api.agentdialog.io/api/v1
LLM_BASE_URL=http://192.168.100.58:8000/v1
LLM_MODEL=/home/nexus/.samantha/models/Qwen3.8-27B-Heretic-GGUF/RVN-IQ4_XS-multilingual.gguf
QUERY_TIMEOUT_MINUTES=60
MANUAL_REVIEW_MINUTES=5
EXCEPTION_REVIEW_MINUTES=2
HOURLY_COST_EUR=30
N8N_ENCRYPTION_KEY=replace-with-a-long-random-local-value
TZ=Europe/Madrid
```

Ignore `.env`, every file under `output/` except `.gitkeep`, and test-generated temporary files.

- [ ] **Step 4: Create `compose.yaml`**

Use this service contract:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:2.37.7
    ports:
      - "127.0.0.1:5678:5678"
    environment:
      AGENTDIALOG_BASE_URL: ${AGENTDIALOG_BASE_URL}
      LLM_BASE_URL: ${LLM_BASE_URL}
      LLM_MODEL: ${LLM_MODEL}
      QUERY_TIMEOUT_MINUTES: ${QUERY_TIMEOUT_MINUTES:-60}
      MANUAL_REVIEW_MINUTES: ${MANUAL_REVIEW_MINUTES:-5}
      EXCEPTION_REVIEW_MINUTES: ${EXCEPTION_REVIEW_MINUTES:-2}
      HOURLY_COST_EUR: ${HOURLY_COST_EUR:-30}
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      N8N_BLOCK_ENV_ACCESS_IN_NODE: false
      EXECUTIONS_DATA_SAVE_ON_SUCCESS: none
      EXECUTIONS_DATA_SAVE_ON_ERROR: none
      EXECUTIONS_DATA_SAVE_ON_PROGRESS: false
      EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS: false
      GENERIC_TIMEZONE: ${TZ:-Europe/Madrid}
      TZ: ${TZ:-Europe/Madrid}
    volumes:
      - n8n_data:/home/node/.n8n
      - ./fixtures:/demo/fixtures:ro
      - ./workflows:/demo/workflows:ro
      - ./output:/demo/output
    restart: unless-stopped

volumes:
  n8n_data:
```

- [ ] **Step 5: Validate configuration, start n8n, and import the workflow**

From the example directory:

```bash
cp .env.example .env
docker compose config
docker compose up -d
docker compose ps
docker compose exec -T n8n n8n import:workflow \
  --input=/demo/workflows/invoice-reconciliation.json
```

Expected: Compose config succeeds, n8n becomes available on loopback, and the CLI reports one imported workflow. If the image pull fails because of restricted network access, rerun the same `docker compose` command with the required approval rather than changing image sources.

- [ ] **Step 6: Run all tests and commit**

Run:

```bash
bun test examples/n8n-invoice-reconciliation/tests
docker compose config -q
```

Expected: all tests PASS and Compose exits 0.

Commit only Task 4 files; never add `.env`:

```bash
git add examples/n8n-invoice-reconciliation/.env.example \
  examples/n8n-invoice-reconciliation/.gitignore \
  examples/n8n-invoice-reconciliation/compose.yaml \
  examples/n8n-invoice-reconciliation/output/.gitkeep \
  examples/n8n-invoice-reconciliation/tests/workflow.test.mjs
git commit -m "Add local n8n demo runtime"
```

### Task 5: Add Service Checks and the Spanish Operator Guide

**Files:**
- Create: `examples/n8n-invoice-reconciliation/scripts/check-services.mjs`
- Create: `examples/n8n-invoice-reconciliation/README.md`
- Modify: `examples/n8n-invoice-reconciliation/tests/integrations.test.mjs`

**Interfaces:**
- Consumes: `AGENTDIALOG_BASE_URL`, `LLM_BASE_URL`, and `LLM_MODEL` from `.env` or the process environment.
- Produces: read-only service diagnostics; never registers an agent or sends a query.

- [ ] **Step 1: Write failing read-only service-check tests**

Export `checkServices({ fetchImpl, agentDialogBaseUrl, llmBaseUrl, model })`. Test with a fake `fetchImpl` that `/models` contains the configured model and AgentDialog `/health` returns a successful response. Test that a missing model throws `Configured LLM model is not served` and assert the fake received no POST request.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bun test examples/n8n-invoice-reconciliation/tests/integrations.test.mjs
```

Expected: FAIL resolving or calling `checkServices`.

- [ ] **Step 3: Implement `check-services.mjs`**

Perform only:

```text
GET ${LLM_BASE_URL}/models
GET ${AGENTDIALOG_BASE_URL}/health
```

Accept model lists in either `data` or `models`, because the detected `llama.cpp` server returns both shapes. Print endpoint reachability and the selected model name; do not print headers, environment contents, or response bodies unrelated to the check. Provide a CLI entry point that reads the seven documented variables from `.env` through Compose or from the shell, without adding a dotenv dependency.

- [ ] **Step 4: Write the complete Spanish README**

Use these sections in order:

1. `Qué demuestra` — ten automatic matches, two human exceptions, no payments.
2. `Requisitos` — Docker with Compose, access to the Qwen endpoint, a reviewer email, and browser access to AgentDialog.
3. `Configuración` — copy `.env.example`, replace `N8N_ENCRYPTION_KEY`, and override the model endpoint if necessary.
4. `Arranque` — the exact Task 4 Compose commands.
5. `Importar y activar` — import command, owner setup at `127.0.0.1:5678`, open the imported workflow, and publish it.
6. `Ejecutar el lote` — open the production form URL for `invoice-reconciliation-demo`, provide the email, and submit once.
7. `Responder` — accept the invitation if needed, inspect fictional evidence, answer both exception queries, and wait at least fifteen seconds between workflow polls.
8. `Resultado` — inspect `output/reconciliation-report.json` and explain 60, 4, 56, and 28.
9. `Seguridad` — execution history disabled because registration returns a one-time key; production agents register once and store it securely.
10. `Límites` — ten registrations/hour/IP and one new agent per demo run.
11. `Solución de problemas` — Qwen unavailable fallback, registration `409` retry, `422 reason/remedy`, pending invitation, `needs_context`, and filesystem permissions.
12. `Parar` — `docker compose down`; explain separately that `docker compose down -v` deletes the local n8n volume and requires explicit intent.

- [ ] **Step 5: Run tests and the real read-only service check**

Run unit tests, then from the example directory load `.env` without printing it and run:

```bash
bun test tests
set -a
source .env
set +a
bun scripts/check-services.mjs
```

Expected: tests PASS; Qwen model and AgentDialog health both report reachable. Do not run the registration endpoint in this step.

- [ ] **Step 6: Commit**

```bash
git add examples/n8n-invoice-reconciliation/scripts/check-services.mjs \
  examples/n8n-invoice-reconciliation/README.md \
  examples/n8n-invoice-reconciliation/tests/integrations.test.mjs
git commit -m "Document the n8n invoice demo"
```

### Task 6: Run the Real Human Loop and Capture Safe Screens

**Files:**
- Create: `docs-site/video-src/n8n-invoice-reconciliation/screens/01-n8n-workflow.png`
- Create: `docs-site/video-src/n8n-invoice-reconciliation/screens/02-batch-classification.png`
- Create: `docs-site/video-src/n8n-invoice-reconciliation/screens/03-agentdialog-decision.png`
- Create: `docs-site/video-src/n8n-invoice-reconciliation/screens/04-final-report.png`

**Interfaces:**
- Consumes: the running Task 4 stack, real Qwen endpoint, public AgentDialog API, and one reviewer email entered by the human in the form.
- Produces: one verified report and four 16:9-safe PNG sources with no email, key, cookie, token, or real financial data.

- [ ] **Step 1: Verify the stack before causing external state**

Run:

```bash
docker compose ps
bun scripts/check-services.mjs
```

Expected: n8n is running and both remote services are reachable. Review the runs made during the current session and submit the form only once. If the API returns `429`, stop and report the public registration limit instead of retrying.

- [ ] **Step 2: Ask the user to perform the human-owned form and response steps**

If no reviewer email has been provided in the current execution session, ask the user to open the published form and enter it themselves; never guess, store, or commit the address. Tell them a single submission registers one demo agent and produces two fictional review requests. Wait for them to confirm submission, then let them answer both queries in AgentDialog.

- [ ] **Step 3: Observe the real workflow without exposing its key**

Open the execution only while it is live. Do not open or capture output panes for `Register agent`, `Create human query`, or `Get human query`, because those panes can contain authorization material or the reviewer email. Confirm the ten automatic ids and two exception ids from safe downstream counts.

- [ ] **Step 4: Validate the generated report**

Run:

```bash
bun -e 'const r=await Bun.file("output/reconciliation-report.json").json(); console.log(JSON.stringify(r.summary));'
rg -n "mge_ag_|api[_-]?key|authorization|token|@" output/reconciliation-report.json
```

Expected: summary reports 12 total, 10 automatic, 2 reviewed, 56 saved minutes, and 28 saved EUR; `rg` finds no match.

- [ ] **Step 5: Capture four safe screens**

Capture at 16:9 or wider resolution:

- the n8n canvas with node names but no data pane;
- the safe classification counts after the reconciliation node, with no form input visible;
- the AgentDialog decision card showing only fictional invoice/order evidence and the three consequences;
- the final safe report summary.

Inspect every PNG at original resolution. If any real email, key, cookie, invitation token, query URL token, browser profile, or non-fictional value is visible, recapture from a safe view; do not blur a secret into a committed screenshot.

- [ ] **Step 6: Commit only safe screenshots**

```bash
git add docs-site/video-src/n8n-invoice-reconciliation/screens
git commit -m "Add n8n invoice demo captures"
```

### Task 7: Add the Public Documentation Page

**Files:**
- Create: `docs-site/content/docs/n8n-invoice-reconciliation.mdx`
- Modify: `docs-site/content/docs/meta.json`

**Interfaces:**
- Consumes: runnable example behavior and final public video filenames.
- Produces: a navigable Spanish guide at `/docs/n8n-invoice-reconciliation`.

- [ ] **Step 1: Add the page and navigation entry**

Use frontmatter:

```mdx
---
title: Conciliación de facturas con n8n
description: Automatiza las coincidencias y consulta únicamente las excepciones mediante AgentDialog
---
```

Import Fumadocs `Callout`, `Cards`, `Card`, `Steps`, and `Step`. Embed `/videos/n8n-invoice-reconciliation.mp4` with its poster and link the SRT. Explain the architecture, the 12/10/2 fixture, autonomous registration, Qwen's advisory-only role, the typed AgentDialog choice, the savings formula, and the no-payment boundary. Link the runnable directory at `https://github.com/horelvis/agentDialog/tree/main/examples/n8n-invoice-reconciliation`.

In `meta.json`, preserve the current content byte-for-byte except for adding `"n8n-invoice-reconciliation"` immediately after the existing introductory demo entries. The file is already modified outside this task; inspect its diff and stage only the intended merged result.

- [ ] **Step 2: Build the docs with npm**

Run:

```bash
cd docs-site
npm run build
```

Expected: Next.js build exits 0 and includes `/docs/n8n-invoice-reconciliation`.

- [ ] **Step 3: Inspect the rendered page**

Run the docs dev server, open the new route, and verify Spanish copy, navigation order, video sizing, code wrapping, and mobile layout. At this stage the video URL may be absent on disk; the page must still render without a compile error.

- [ ] **Step 4: Commit without swallowing unrelated docs changes**

Review `git diff -- docs-site/content/docs/meta.json` before staging. Then commit only:

```bash
git add docs-site/content/docs/n8n-invoice-reconciliation.mdx \
  docs-site/content/docs/meta.json
git commit -m "Add n8n invoice reconciliation guide"
```

### Task 8: Lock the Nine-Scene Story and Narration Generator

**Files:**
- Create: `docs-site/video-src/n8n-invoice-reconciliation/scenes.json`
- Create: `docs-site/video-src/n8n-invoice-reconciliation/generate_voiceover.py`
- Create: `docs-site/video-src/n8n-invoice-reconciliation/test_video_source.py`
- Create: `docs-site/video-src/n8n-invoice-reconciliation/README.md`

**Interfaces:**
- Consumes: verified facts and screen filenames from Tasks 1–7, plus `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` only during audio generation.
- Produces: exactly nine scene objects and `voiceover/<scene-id>.mp3`.

- [ ] **Step 1: Write failing scene and voice-client tests**

Test that `scenes.json` has ids `00-problem` through `08-outro`, unique ids, fields `id`, `eyebrow`, `title`, `caption`, `narration`, `visual`, and optional `screen`. Assert the combined story contains `12`, `10`, `2`, `56 minutos`, `28 EUR`, `n8n`, `Qwen`, `AgentDialog`, and the closing sentence. Assert it contains no email, `mge_ag_`, `.com`/`.dev` AgentDialog domain, or annual claim.

Load `generate_voiceover.py` in the test and assert:

- model `eleven_multilingual_v2`;
- output `mp3_44100_128`;
- missing key/voice id raises a message naming only the missing variable;
- existing MP3s are skipped unless `--force` is passed;
- responses write to `.tmp` and replace atomically.

- [ ] **Step 2: Run tests and verify missing sources**

Run:

```bash
python3 -m unittest \
  docs-site/video-src/n8n-invoice-reconciliation/test_video_source.py -v
```

Expected: ERROR because the manifest and generator do not exist.

- [ ] **Step 3: Write the nine-scene manifest**

Use this exact narrative contract, keeping total narration between 180 and 205 Spanish words:

| ID | Visual | Required point |
|---|---|---|
| `00-problem` | `problem` | Twelve invoices normally consume 60 human minutes. |
| `01-n8n` | `screen` | Local n8n orchestrates the batch and self-registers the agent. |
| `02-rules` | `batch` | Deterministic checks reconcile ten exact matches. |
| `03-exceptions` | `exceptions` | Two invoices require judgment; facts and recommendations remain separate. |
| `04-qwen` | `analysis` | Remote Qwen explains discrepancies but cannot decide. |
| `05-agentdialog` | `screen` | AgentDialog shows evidence and explicit consequences. |
| `06-answer` | `choice` | The reviewer approves, rejects, or keeps pending. |
| `07-savings` | `screen` | Final report shows 56 minutes and 28 EUR saved for this batch. |
| `08-outro` | `outro` | “Automatiza lo repetitivo. Consulta las excepciones.” and `docs.agentdialog.io`. |

Use `01-n8n-workflow.png` for `01-n8n`, `03-agentdialog-decision.png` for `05-agentdialog`, and `04-final-report.png` for `07-savings`. The remaining scenes are generated graphics.

- [ ] **Step 4: Implement the ElevenLabs generator**

Use Python standard-library `urllib.request`, the same safe contract as the existing video pipeline, and one file per scene. Expose the callable interfaces `synthesis_request(voice_id: str, text: str) -> urllib.request.Request` and `generate(force: bool = False) -> list[Path]`.

Use the existing Spanish voice **David Martin — Clear, Calm and Elegant** for continuity. The voice id remains an environment variable and must never be printed or committed.

- [ ] **Step 5: Document source generation and run tests**

The audiovisual README must explain safe screenshots, voice generation, `--force` cost, local regeneration, and final output paths. Run the Step 2 command; expected: all story and client tests PASS without network.

- [ ] **Step 6: Commit sources without audio**

```bash
git add docs-site/video-src/n8n-invoice-reconciliation/scenes.json \
  docs-site/video-src/n8n-invoice-reconciliation/generate_voiceover.py \
  docs-site/video-src/n8n-invoice-reconciliation/test_video_source.py \
  docs-site/video-src/n8n-invoice-reconciliation/README.md
git commit -m "Add n8n invoice video story"
```

### Task 9: Implement the Slide, Subtitle, Poster, and Video Pipeline

**Files:**
- Create: `docs-site/video-src/n8n-invoice-reconciliation/render_slides.py`
- Create: `docs-site/video-src/n8n-invoice-reconciliation/render_video.swift`
- Create: `docs-site/video-src/n8n-invoice-reconciliation/render.sh`
- Modify: `docs-site/video-src/n8n-invoice-reconciliation/test_video_source.py`

**Interfaces:**
- Consumes: `scenes.json`, four safe PNG screens, and nine MP3 tracks.
- Produces: `generated/slides/*.png`, `generated/timeline.json`, poster, SRT, and final MP4.

- [ ] **Step 1: Add failing render-source tests**

Test these functions and outputs:

```python
render_slides.money_eur(2800) == "28 EUR"
render_slides.srt_time(65.432) == "00:01:05,432"
render_slides.voiceover_audio("00-problem", voiceover_dir)
render_slides.safe_screen("01-n8n-workflow.png", screens_dir)
```

Also test that missing audio or screen raises `FileNotFoundError`, `save_poster` preserves 1920 × 1080, every generated caption becomes one SRT cue, and the timeline duration is within 80–90 seconds when mocked narration durations total 75 seconds.

- [ ] **Step 2: Run tests and verify renderer sources are missing**

Run the Task 8 unittest command. Expected: ERROR loading `render_slides.py`.

- [ ] **Step 3: Implement branded slide rendering**

Use the current dark AgentDialog palette, rounded cards, SF system fonts, and 1920 × 1080 canvas. Provide focused functions with these exact interfaces: `draw_problem(draw: ImageDraw.ImageDraw, scene: dict) -> None`, `draw_batch(draw: ImageDraw.ImageDraw, scene: dict) -> None`, `draw_exceptions(draw: ImageDraw.ImageDraw, scene: dict) -> None`, `draw_analysis(draw: ImageDraw.ImageDraw, scene: dict) -> None`, `draw_choice(draw: ImageDraw.ImageDraw, scene: dict) -> None`, `draw_outro(draw: ImageDraw.ImageDraw, scene: dict) -> None`, `safe_screen(name: str, screens_dir: Path = SCREENS) -> Path`, `voiceover_audio(scene_id: str, voiceover_dir: Path = VOICEOVER) -> Path`, and `build_timeline(scenes: list[dict], duration_reader=audio_duration) -> list[dict]`.

Generated batch visuals must show ten green automatic records and two amber exceptions without relying only on color; add labels and counts. The savings visual shows the calculation `60 min − 4 min = 56 min` and `56/60 × 30 EUR = 28 EUR`.

For `visual: "screen"`, fit the approved image within a branded frame. Never display a file that is not listed in the manifest.

- [ ] **Step 4: Add subtitle, poster, and timeline generation**

Duration for each scene is narration duration plus one second; audio begins 0.45 seconds into the scene. Write UTF-8 SRT cues from the complete Spanish captions with monotonically increasing times. The poster is the first rendered slide.

- [ ] **Step 5: Add the Swift renderer and shell entry point**

Copy the established `docs-site/video-src/hola-mundo-claude-mcp/render_video.swift` implementation into the new directory, change only the temporary silent filename to `.n8n-invoice-reconciliation-silent.mp4`, and keep 1920 × 1080, 30 fps, H.264, dissolve transitions, and narration composition.

Create `render.sh` with this exact contract:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
DOCS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
OUTPUT_DIR="$DOCS_DIR/public/videos"
PYTHON_BIN="${PYTHON_BIN:-python3}"

mkdir -p "$OUTPUT_DIR"
"$PYTHON_BIN" "$SCRIPT_DIR/render_slides.py"
swiftc -parse-as-library "$SCRIPT_DIR/render_video.swift" \
  -o "$SCRIPT_DIR/generated/render_video"
"$SCRIPT_DIR/generated/render_video" \
  "$SCRIPT_DIR/generated/timeline.json" \
  "$OUTPUT_DIR/n8n-invoice-reconciliation.mp4"
cp "$SCRIPT_DIR/poster.png" \
  "$OUTPUT_DIR/n8n-invoice-reconciliation-poster.png"
cp "$SCRIPT_DIR/generated/n8n-invoice-reconciliation.srt" \
  "$OUTPUT_DIR/n8n-invoice-reconciliation.srt"
```

- [ ] **Step 6: Run source tests and commit**

Run:

```bash
python3 -m unittest \
  docs-site/video-src/n8n-invoice-reconciliation/test_video_source.py -v
swiftc -typecheck \
  docs-site/video-src/n8n-invoice-reconciliation/render_video.swift
```

Expected: all Python tests PASS and Swift typecheck exits 0.

Commit:

```bash
git add docs-site/video-src/n8n-invoice-reconciliation/render_slides.py \
  docs-site/video-src/n8n-invoice-reconciliation/render_video.swift \
  docs-site/video-src/n8n-invoice-reconciliation/render.sh \
  docs-site/video-src/n8n-invoice-reconciliation/test_video_source.py
git commit -m "Add n8n invoice video renderer"
```

### Task 10: Generate, Inspect, and Publish the Final Media

**Files:**
- Create: `docs-site/video-src/n8n-invoice-reconciliation/voiceover/*.mp3`
- Create: `docs-site/video-src/n8n-invoice-reconciliation/poster.png`
- Create: `docs-site/public/videos/n8n-invoice-reconciliation.mp4`
- Create: `docs-site/public/videos/n8n-invoice-reconciliation-poster.png`
- Create: `docs-site/public/videos/n8n-invoice-reconciliation.srt`

**Interfaces:**
- Consumes: approved narration, renderer, and safe screens.
- Produces: final public media that satisfies resolution, duration, audio, subtitle, privacy, and factual checks.

- [ ] **Step 1: Generate narration without exposing credentials**

Check variables only by presence:

```bash
test -n "${ELEVENLABS_API_KEY:-}" && \
  test -n "${ELEVENLABS_VOICE_ID:-}"
```

If either is absent, stop and ask the user to provide it through the environment. Do not echo it. Then run:

```bash
python3 docs-site/video-src/n8n-invoice-reconciliation/generate_voiceover.py
```

Expected: nine non-empty MP3s. Do not use `--force` unless narration was changed and the user authorizes regeneration cost.

- [ ] **Step 2: Inspect narration before rendering**

Run `afinfo` for every MP3, listen for pronunciation of “n8n”, “Qwen”, “AgentDialog”, “cincuenta y seis minutos”, and “veintiocho euros”, and confirm the aggregate spoken duration is approximately 71–80 seconds so scene padding lands inside 80–90 seconds. Correct manifest text and regenerate only affected tracks if necessary.

- [ ] **Step 3: Render the final assets**

Run:

```bash
docs-site/video-src/n8n-invoice-reconciliation/render.sh
```

Expected: poster, SRT, and MP4 are written to the approved public paths.

- [ ] **Step 4: Verify media mechanically**

Run:

```bash
ffprobe -v error -show_entries \
  format=duration:stream=codec_type,codec_name,width,height \
  -of json docs-site/public/videos/n8n-invoice-reconciliation.mp4
python3 -m unittest \
  docs-site/video-src/n8n-invoice-reconciliation/test_video_source.py -v
```

Expected: H.264 video at 1920 × 1080, one audio stream, duration 80–90 seconds, and all tests PASS.

- [ ] **Step 5: Inspect visuals and privacy at original resolution**

View the poster, first frame, each screen-based slide, one batch slide, the AgentDialog choice, and the final savings slide. Verify no clipping, unreadable text, email, API key, token, real invoice, false annual claim, or incorrect amount. Watch the entire MP4 with sound and subtitles.

- [ ] **Step 6: Run the complete repository verification**

From the repository root:

```bash
bun test examples/n8n-invoice-reconciliation/tests
bun run typecheck
cd docs-site
npm run build
```

From the example directory:

```bash
docker compose config -q
docker compose exec -T n8n n8n import:workflow \
  --input=/demo/workflows/invoice-reconciliation.json
```

Expected: all checks exit 0. Treat root typecheck failures as real, per `AGENTS.md`.

- [ ] **Step 7: Scan the complete change for secrets and wrong domains**

Run:

```bash
rg -n "mge_ag_[A-Za-z0-9]{8,}|agentdialog\.(com|dev)" \
  examples/n8n-invoice-reconciliation \
  docs-site/content/docs/n8n-invoice-reconciliation.mdx \
  docs-site/video-src/n8n-invoice-reconciliation
rg -n "AGENTDIALOG_API_KEY" examples/n8n-invoice-reconciliation \
  --glob "!tests/**"
git diff --check
```

Expected: both secret/domain scans return no matches and `git diff --check` exits 0. Inspect any match manually rather than weakening the scan.

- [ ] **Step 8: Commit final media only**

```bash
git add docs-site/video-src/n8n-invoice-reconciliation/voiceover \
  docs-site/video-src/n8n-invoice-reconciliation/poster.png \
  docs-site/public/videos/n8n-invoice-reconciliation.mp4 \
  docs-site/public/videos/n8n-invoice-reconciliation-poster.png \
  docs-site/public/videos/n8n-invoice-reconciliation.srt
git commit -m "Publish n8n invoice reconciliation video"
```

After committing, run `git status --short` and confirm that every remaining path belongs to the pre-existing unrelated work rather than this plan.
