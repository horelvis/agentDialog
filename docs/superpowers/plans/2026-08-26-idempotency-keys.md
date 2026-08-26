# Claves de idempotencia — plan de implementación

> **Para quien ejecute esto:** usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ir tarea a tarea. Los pasos
> llevan casilla (`- [ ]`) para poder marcarlos.

**Objetivo:** que repetir un POST con la misma `Idempotency-Key` devuelva la
respuesta original en vez de ejecutar la operación otra vez.

**Arquitectura:** un middleware de Hono que reserva la clave en Redis con
`SET NX` antes de dejar pasar al handler, guarda la respuesta si tuvo éxito y
libera la reserva si no. La decisión sobre lo almacenado vive en una función pura
aparte, para poder probarla sin Redis ni HTTP. El SDK genera y envía la cabecera.

**Stack:** Bun, Hono, ioredis, Zod, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-08-26-idempotency-keys-design.md` — léelo
antes de empezar; este plan argumenta desde él.

## Restricciones globales

- Código, comentarios y mensajes de commit **en inglés**. Este plan y el spec
  están en español porque el repositorio escribe así sus documentos de diseño.
- Los mensajes de commit son **prosa en imperativo**, sin prefijos tipo `feat:`.
  Mira `git log` antes de escribir el primero.
- La suite se ejecuta **nombrando las dos rutas**: `bun test tests/unit tests/integration`.
  Un `bun test tests/` recoge además la del SDK y falla en un clon limpio.
- **El alta de agentes está limitada a diez por hora** y el contador vive en Redis
  entre ejecuciones. Registra **un agente por fichero** en un `beforeAll` y
  reutilízalo. Si ves `429` inesperados: `docker exec <redis> redis-cli -n 1 FLUSHDB`.
- Los tests de integración necesitan `postgres`, `redis` y `minio` levantados, y
  la base `agentdialog_test`. Instrucciones en `CLAUDE.md`.
- Todas las rutas de agente responden `{ data: ... }`. Los errores los serializa
  `src/middleware/error-handler.ts` como `{ error: { code, message } }`.
- **Tocar el SDK obliga a actualizar su documentación en el mismo cambio** (Tarea 5).

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/idempotency.ts` *(nuevo)* | Tipos, clave de almacenamiento, resumen del cuerpo, validación y **decisión pura** sobre un registro |
| `src/middleware/idempotency.ts` *(nuevo)* | El middleware: reserva en Redis, deja pasar, guarda o libera |
| `src/lib/errors.ts` | Añadir `IdempotencyConflictError` |
| Siete ficheros de ruta | Aplicar el middleware donde toca |
| `sdks/typescript/src/client.ts` | Generar y enviar la cabecera; reusarla en el reintento |

---

### Tarea 1: La decisión, sin Redis y sin HTTP

**Ficheros:**
- Crear: `src/lib/idempotency.ts`
- Test: `tests/unit/idempotency.test.ts`

**Interfaces:**
- Consume: nada.
- Produce: `IDEMPOTENCY_TTL_SECONDS`, `IdempotencyRecord`, `IdempotencyDecision`,
  `assertValidIdempotencyKey(value: string): void`,
  `hashBody(raw: string): string`,
  `idempotencyStorageKey(agentId: string, method: string, path: string, key: string): string`,
  `decideFromRecord(record: IdempotencyRecord | null, bodyHash: string): IdempotencyDecision`.

- [ ] **Paso 1: escribe el test que falla**

```ts
// tests/unit/idempotency.test.ts
import { describe, expect, it } from "bun:test";
import {
  assertValidIdempotencyKey,
  decideFromRecord,
  hashBody,
  idempotencyStorageKey,
} from "../../src/lib/idempotency";

describe("idempotency key validation", () => {
  it("accepts an ordinary key", () => {
    expect(() => assertValidIdempotencyKey("a1b2c3")).not.toThrow();
  });

  it("refuses an empty key", () => {
    // An empty header is indistinguishable from sending none. Refusing it stops
    // a client believing it is protected when it is not.
    expect(() => assertValidIdempotencyKey("")).toThrow();
    expect(() => assertValidIdempotencyKey("   ")).toThrow();
  });

  it("refuses a key longer than 255 characters", () => {
    expect(() => assertValidIdempotencyKey("x".repeat(256))).toThrow();
  });
});

describe("storage key", () => {
  it("separates agents, methods and paths", () => {
    const a = idempotencyStorageKey("agent-1", "POST", "/api/v1/agent/queries", "same");
    const b = idempotencyStorageKey("agent-2", "POST", "/api/v1/agent/queries", "same");
    const c = idempotencyStorageKey("agent-1", "POST", "/api/v1/agent/webhooks", "same");

    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toStartWith("idem:agent-1:");
  });

  it("is stable for the same inputs", () => {
    const first = idempotencyStorageKey("agent-1", "POST", "/p", "k");
    const second = idempotencyStorageKey("agent-1", "POST", "/p", "k");
    expect(first).toBe(second);
  });
});

describe("decideFromRecord", () => {
  const hash = hashBody(JSON.stringify({ question: "ship?" }));

  it("proceeds when nothing is stored", () => {
    expect(decideFromRecord(null, hash)).toEqual({ kind: "proceed" });
  });

  it("reports a request still in flight", () => {
    expect(decideFromRecord({ state: "in_progress", bodyHash: hash }, hash)).toEqual({
      kind: "in_progress",
    });
  });

  it("replays a completed response for the same body", () => {
    const record = {
      state: "completed" as const,
      bodyHash: hash,
      status: 201,
      body: '{"data":{"query_id":"q1"}}',
    };
    expect(decideFromRecord(record, hash)).toEqual({
      kind: "replay",
      status: 201,
      body: '{"data":{"query_id":"q1"}}',
    });
  });

  it("refuses the same key with a different body", () => {
    const record = {
      state: "completed" as const,
      bodyHash: hash,
      status: 201,
      body: "{}",
    };
    expect(decideFromRecord(record, hashBody("{\"question\":\"other\"}"))).toEqual({
      kind: "reused",
    });
  });

  it("refuses a key reused with a different body while still in flight", () => {
    const record = { state: "in_progress" as const, bodyHash: hash };
    expect(decideFromRecord(record, hashBody("{}"))).toEqual({ kind: "reused" });
  });
});
```

- [ ] **Paso 2: ejecútalo y comprueba que falla**

Ejecuta: `bun test tests/unit/idempotency.test.ts`
Esperado: FAIL con `Cannot find module '../../src/lib/idempotency'`.

- [ ] **Paso 3: escribe la implementación mínima**

```ts
// src/lib/idempotency.ts
import { createHash } from "node:crypto";
import { ValidationError } from "./errors";

/** Twenty-four hours, which is what the industry does and far longer than any
 *  sane retry window. */
export const IDEMPOTENCY_TTL_SECONDS = 86_400;

const MAX_KEY_LENGTH = 255;

export type IdempotencyRecord =
  | { state: "in_progress"; bodyHash: string }
  | { state: "completed"; bodyHash: string; status: number; body: string };

export type IdempotencyDecision =
  | { kind: "proceed" }
  | { kind: "in_progress" }
  | { kind: "reused" }
  | { kind: "replay"; status: number; body: string };

export function assertValidIdempotencyKey(value: string): void {
  if (value.trim().length === 0) {
    throw new ValidationError("Idempotency-Key must not be empty");
  }
  if (value.length > MAX_KEY_LENGTH) {
    throw new ValidationError(
      `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`,
    );
  }
}

export function hashBody(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * The scope of a key is the agent, the method and the path. Two agents may pick
 * the same string without seeing each other, and the same agent reusing its key
 * on another route does not collide either.
 */
export function idempotencyStorageKey(
  agentId: string,
  method: string,
  path: string,
  key: string,
): string {
  const digest = createHash("sha256").update(`${method} ${path} ${key}`).digest("hex");
  return `idem:${agentId}:${digest}`;
}

export function decideFromRecord(
  record: IdempotencyRecord | null,
  bodyHash: string,
): IdempotencyDecision {
  if (record === null) return { kind: "proceed" };
  if (record.bodyHash !== bodyHash) return { kind: "reused" };
  if (record.state === "in_progress") return { kind: "in_progress" };
  return { kind: "replay", status: record.status, body: record.body };
}
```

- [ ] **Paso 4: ejecuta el test y comprueba que pasa**

Ejecuta: `bun test tests/unit/idempotency.test.ts`
Esperado: PASS, 9 tests.

- [ ] **Paso 5: commit**

```bash
git add src/lib/idempotency.ts tests/unit/idempotency.test.ts
git commit -m "Decide what a repeated request means, before any of it touches Redis"
```

---

### Tarea 2: El middleware

**Ficheros:**
- Crear: `src/middleware/idempotency.ts`
- Modificar: `src/lib/errors.ts` (añadir `IdempotencyConflictError`)
- Test: `tests/integration/idempotency-middleware.test.ts`

**Interfaces:**
- Consume: todo lo que produce la Tarea 1; `getRedis()` de `src/lib/redis.ts`.
- Produce: `idempotency(): MiddlewareHandler<AppEnv>` y
  `IdempotencyConflictError(message: string, code: string)`.

Este test necesita **Redis**, pero no base de datos: monta una app de Hono de
usar y tirar con un contador, que es la forma de ver si el handler corrió dos
veces.

- [ ] **Paso 1: escribe el test que falla**

```ts
// tests/integration/idempotency-middleware.test.ts
import { describe, expect, it, beforeEach } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../src/types/hono";
import { idempotency } from "../../src/middleware/idempotency";
import { errorHandler } from "../../src/middleware/error-handler";
import { getRedis } from "../../src/lib/redis";

function appWithCounter() {
  let calls = 0;
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("agentId", "agent-under-test");
    await next();
  });
  app.post("/thing", idempotency(), async (c) => {
    calls += 1;
    const body = await c.req.json();
    if (body.fail) return c.json({ error: { code: "NOPE", message: "no" } }, 422);
    return c.json({ data: { calls } }, 201);
  });
  return { app, calls: () => calls };
}

const KEY = () => `k-${Math.random().toString(36).slice(2)}`;

function post(app: Hono<AppEnv>, key: string, body: unknown) {
  return app.request("/thing", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

describe("idempotency middleware", () => {
  beforeEach(() => getRedis());

  it("runs the handler once and replays the first response", async () => {
    const { app, calls } = appWithCounter();
    const key = KEY();

    const first = await post(app, key, { ship: true });
    const second = await post(app, key, { ship: true });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.text()).toBe(await first.clone().text());
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    expect(calls()).toBe(1);
  });

  it("refuses the same key with a different body", async () => {
    const { app, calls } = appWithCounter();
    const key = KEY();

    await post(app, key, { ship: true });
    const conflicting = await post(app, key, { ship: false });

    expect(conflicting.status).toBe(409);
    expect((await conflicting.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(calls()).toBe(1);
  });

  it("leaves the key free after a failed request", async () => {
    // A 422 from the admission gate tells the agent what to add. It will fix the
    // body and retry with the same key, and that retry has to be allowed.
    const { app, calls } = appWithCounter();
    const key = KEY();

    const rejected = await post(app, key, { fail: true });
    expect(rejected.status).toBe(422);

    const corrected = await post(app, key, { ship: true });
    expect(corrected.status).toBe(201);
    expect(calls()).toBe(2);
  });

  it("ignores requests that carry no key", async () => {
    const { app, calls } = appWithCounter();

    await app.request("/thing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ship: true }),
    });
    await app.request("/thing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ship: true }),
    });

    expect(calls()).toBe(2);
  });

  it("refuses an empty key", async () => {
    const { app } = appWithCounter();
    const res = await post(app, "   ", { ship: true });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Paso 2: ejecútalo y comprueba que falla**

Ejecuta: `bun test tests/integration/idempotency-middleware.test.ts`
Esperado: FAIL con `Cannot find module '../../src/middleware/idempotency'`.

- [ ] **Paso 3: añade el error**

```ts
// src/lib/errors.ts — junto a las demás clases
/**
 * Two different conflicts share 409 and are told apart by `code`, which is what
 * an agent can branch on without reading prose.
 */
export class IdempotencyConflictError extends AppError {
  constructor(message: string, code: "IDEMPOTENCY_IN_PROGRESS" | "IDEMPOTENCY_KEY_REUSED") {
    super(409, message, code);
  }
}
```

- [ ] **Paso 4: escribe el middleware**

```ts
// src/middleware/idempotency.ts
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import { getRedis } from "../lib/redis";
import { IdempotencyConflictError } from "../lib/errors";
import {
  IDEMPOTENCY_TTL_SECONDS,
  assertValidIdempotencyKey,
  decideFromRecord,
  hashBody,
  idempotencyStorageKey,
  type IdempotencyRecord,
} from "../lib/idempotency";

/**
 * Applied per route rather than globally, so adding a POST is a decision
 * somebody makes rather than something inherited by accident. It must sit after
 * agentAuth, which is what puts `agentId` in the context.
 */
export function idempotency(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header("Idempotency-Key");
    if (key === undefined) return next();

    assertValidIdempotencyKey(key);

    // Reading the body here does not starve validateBody downstream: Hono caches
    // the body per type, and a later json() re-parses from the cached text.
    const raw = await c.req.text();
    const bodyHash = hashBody(raw);

    const redis = getRedis();
    const storageKey = idempotencyStorageKey(
      c.get("agentId"),
      c.req.method,
      new URL(c.req.url).pathname,
      key,
    );

    const reserved = await redis.set(
      storageKey,
      JSON.stringify({ state: "in_progress", bodyHash } satisfies IdempotencyRecord),
      "EX",
      IDEMPOTENCY_TTL_SECONDS,
      "NX",
    );

    if (reserved === null) {
      const stored = await redis.get(storageKey);
      const record = stored ? (JSON.parse(stored) as IdempotencyRecord) : null;
      const decision = decideFromRecord(record, bodyHash);

      if (decision.kind === "in_progress") {
        throw new IdempotencyConflictError(
          "A request with this Idempotency-Key is still in progress",
          "IDEMPOTENCY_IN_PROGRESS",
        );
      }
      if (decision.kind === "reused") {
        throw new IdempotencyConflictError(
          "This Idempotency-Key was already used with a different request body",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      if (decision.kind === "replay") {
        c.res = new Response(decision.body, {
          status: decision.status,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Replayed": "true",
          },
        });
        return;
      }
      // "proceed": the record expired between SET and GET. Fall through and run.
    }

    await next();

    const status = c.res.status;
    if (status >= 200 && status < 300) {
      const body = await c.res.clone().text();
      // KEEPTTL is not a detail: a plain SET restarts the clock, and then the
      // window is measured from the last write instead of the first request.
      await redis.set(
        storageKey,
        JSON.stringify({ state: "completed", bodyHash, status, body } satisfies IdempotencyRecord),
        "KEEPTTL",
      );
    } else {
      // Only successful responses are remembered. A rejected request must leave
      // the key free for the corrected retry.
      await redis.del(storageKey);
    }
  };
}
```

- [ ] **Paso 5: ejecuta el test y comprueba que pasa**

Ejecuta: `bun test tests/integration/idempotency-middleware.test.ts`
Esperado: PASS, 5 tests.

- [ ] **Paso 6: commit**

```bash
git add src/middleware/idempotency.ts src/lib/errors.ts tests/integration/idempotency-middleware.test.ts
git commit -m "Reserve the key before the handler runs, and release it if it fails"
```

---

### Tarea 3: Aplicarlo a las siete rutas

**Ficheros:**
- Modificar: `src/routes/agent/queries.ts` (el `POST /`)
- Modificar: `src/routes/agent/conversations.ts` (el `POST /`)
- Modificar: `src/routes/agent/messages.ts` (el `POST /:id/messages`)
- Modificar: `src/routes/agent/invitations.ts` (el `POST /:id/invitations`)
- Modificar: `src/routes/agent/webhooks.ts` (el `POST /` y el `POST /:id/rotate-secret`)
- Modificar: `src/routes/agent/key.ts` (el `POST /key/rotate`)
- Test: `tests/integration/idempotency-queries.test.ts`

**Interfaces:**
- Consume: `idempotency()` de la Tarea 2.
- Produce: nada nuevo; cambia el comportamiento de siete rutas.

- [ ] **Paso 1: escribe el test que falla**

```ts
// tests/integration/idempotency-queries.test.ts
import { describe, expect, it, beforeAll } from "bun:test";
import { createTestApp } from "../helpers";

/**
 * The route that matters most: a duplicate here is a second email to the same
 * person about the same decision, with two links resolving two queries.
 */
describe("Idempotent query creation", () => {
  const app = createTestApp();
  let apiKey: string;

  beforeAll(async () => {
    // One registration per file: the budget is ten per hour across the suite.
    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `idem-queries-${Date.now()}`,
        displayName: "Idempotency Test Agent",
      }),
    });
    apiKey = (await res.json()).data.apiKey;
  });

  function createQuery(key: string | undefined, question: string) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    if (key) headers["Idempotency-Key"] = key;

    return app.request("/api/v1/agent/queries", {
      method: "POST",
      headers,
      body: JSON.stringify({
        query_type: "validation",
        risk: "low",
        subject: {
          id: "q4-revenue",
          label: "Q4 revenue figure",
          body: "Q4 revenue: 2,300,000 EUR (+15% YoY), from finance.quarterly_revenue.",
        },
        answer_space: { kind: "boolean", labels: { t: "Correct", f: "Incorrect" } },
        question,
        target_human_email: "idem@example.com",
        timeout_minutes: 30,
      }),
    });
  }

  it("creates one query for two identical requests", async () => {
    const key = `key-${Date.now()}`;

    const first = await createQuery(key, "Is the Q4 revenue figure correct?");
    const second = await createQuery(key, "Is the Q4 revenue figure correct?");

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(secondBody.data.query_id).toBe(firstBody.data.query_id);
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
  });

  it("refuses the same key with a different question", async () => {
    const key = `key-other-${Date.now()}`;

    await createQuery(key, "Is the Q4 revenue figure correct?");
    const conflicting = await createQuery(key, "Is the Q3 revenue figure correct?");

    expect(conflicting.status).toBe(409);
    expect((await conflicting.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("still creates two queries when no key is sent", async () => {
    const first = await createQuery(undefined, "Is the figure correct?");
    const second = await createQuery(undefined, "Is the figure correct?");

    expect((await first.json()).data.query_id).not.toBe((await second.json()).data.query_id);
  });
});
```

- [ ] **Paso 2: ejecútalo y comprueba que falla**

Ejecuta:
```bash
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun test tests/integration/idempotency-queries.test.ts
```
Esperado: FAIL — el segundo `query_id` es distinto del primero, y no hay cabecera
`Idempotency-Replayed`.

- [ ] **Paso 3: aplica el middleware en las siete rutas**

En cada fichero, importa y colócalo **antes** de `validateBody`, que es quien lee
el cuerpo ya parseado:

```ts
// src/routes/agent/queries.ts
import { idempotency } from "../../middleware/idempotency";

app.post("/", idempotency(), validateBody(createQuerySchema), async (c) => {
```

```ts
// src/routes/agent/conversations.ts
import { idempotency } from "../../middleware/idempotency";

app.post("/", idempotency(), validateBody(createConversationSchema), async (c) => {
```

```ts
// src/routes/agent/messages.ts
import { idempotency } from "../../middleware/idempotency";

app.post("/:id/messages", idempotency(), validateBody(createMessageSchema), async (c) => {
```

```ts
// src/routes/agent/invitations.ts
import { idempotency } from "../../middleware/idempotency";

app.post("/:id/invitations", idempotency(), validateBody(createInvitationSchema), async (c) => {
```

```ts
// src/routes/agent/webhooks.ts
import { idempotency } from "../../middleware/idempotency";

app.post("/", idempotency(), validateBody(createWebhookSchema), async (c) => {
// ...y más abajo:
app.post("/:id/rotate-secret", idempotency(), async (c) => {
```

```ts
// src/routes/agent/key.ts
import { idempotency } from "../../middleware/idempotency";

app.post("/key/rotate", idempotency(), async (c) => {
```

- [ ] **Paso 4: ejecuta el test y comprueba que pasa**

Ejecuta:
```bash
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun test tests/integration/idempotency-queries.test.ts
```
Esperado: PASS, 3 tests.

- [ ] **Paso 5: ejecuta la suite entera, que es donde aparecen los daños colaterales**

Ejecuta:
```bash
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun test tests/unit tests/integration
```
Esperado: todo en verde. Si ves `429` en ficheros que no has tocado, es el
presupuesto de altas: vacía Redis y repite.

- [ ] **Paso 6: commit**

```bash
git add src/routes/agent tests/integration/idempotency-queries.test.ts
git commit -m "Honour the key on the seven POSTs where repeating costs something"
```

---

### Tarea 4: Que el SDK la envíe solo

**Ficheros:**
- Modificar: `sdks/typescript/src/client.ts`
- Test: `sdks/typescript/tests/idempotency.test.ts`

**Interfaces:**
- Consume: la cabecera que acepta el servidor (Tarea 3).
- Produce: `request()` acepta un quinto parámetro `idempotencyKey?: string`, y
  los siete métodos públicos aceptan `options?: { idempotencyKey?: string }`.

Ojo: la suite del SDK se ejecuta desde `sdks/typescript` y necesita su propio
`bun install`.

- [ ] **Paso 1: escribe el test que falla**

```ts
// sdks/typescript/tests/idempotency.test.ts
import { describe, expect, it, afterEach } from "bun:test";
import { AgentDialog } from "../src/client.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(payload: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const subject = { id: "deploy-v2.3", label: "Deploy v2.3 to production" };
const answerSpace = { kind: "boolean" as const, labels: { t: "Yes", f: "No" } };

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string>)[name];
}

describe("idempotency keys", () => {
  it("sends one on a created query", async () => {
    const calls = mockFetch({ data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-27T12:00:00.000Z" } });
    const client = new AgentDialog({ apiKey: "mge_ag_test" });

    await client.createQuery({
      queryType: "validation",
      risk: "low",
      subject,
      answerSpace,
      question: "Ship it?",
      targetHumanEmail: "sarah@example.com",
    });

    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeTruthy();
  });

  it("reuses the same key when it retries a 429", async () => {
    // The retry repeats an operation that may already have run. Without the key
    // being the same, the retry is exactly the duplicate this feature prevents.
    const seen: Array<string | undefined> = [];
    globalThis.fetch = (async (_url: string, init: RequestInit = {}) => {
      seen.push(headerOf(init, "Idempotency-Key"));
      if (seen.length === 1) {
        return new Response(JSON.stringify({ error: { code: "RATE_LIMIT", message: "slow down" } }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "0" },
        });
      }
      return new Response(JSON.stringify({ data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-27T12:00:00.000Z" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const client = new AgentDialog({ apiKey: "mge_ag_test" });
    await client.createQuery({
      queryType: "validation",
      risk: "low",
      subject,
      answerSpace,
      question: "Ship it?",
      targetHumanEmail: "sarah@example.com",
    });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeTruthy();
    expect(seen[0]).toBe(seen[1]);
  });

  it("lets the caller supply its own key", async () => {
    const calls = mockFetch({ data: { id: "w1", url: "https://example.test/hook", events: ["*"], isActive: true, secret: "whsec_x" } });
    const client = new AgentDialog({ apiKey: "mge_ag_test" });

    await client.createWebhook({ url: "https://example.test/hook" }, { idempotencyKey: "job-42" });

    expect(headerOf(calls[0].init, "Idempotency-Key")).toBe("job-42");
  });

  it("sends none on a read", async () => {
    const calls = mockFetch({ data: [] });
    const client = new AgentDialog({ apiKey: "mge_ag_test" });

    await client.listWebhooks();

    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeUndefined();
  });
});
```

- [ ] **Paso 2: ejecútalo y comprueba que falla**

Ejecuta: `cd sdks/typescript && bun install && bun test tests/idempotency.test.ts`
Esperado: FAIL — no se envía ninguna cabecera.

- [ ] **Paso 3: pasa la clave por `request()`**

```ts
// sdks/typescript/src/client.ts
private async request<T>(
  method: string,
  path: string,
  body?: unknown,
  retries = 0,
  signal?: AbortSignal,
  idempotencyKey?: string,
): Promise<T> {
  const url = `${this.baseUrl}/api/v1${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${this.apiKey}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  // The same key travels into the retry below. A retry with a fresh key would be
  // the duplicate this exists to prevent.
  if (idempotencyKey !== undefined) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 429 && retries < MAX_RETRIES) {
    const retryAfter = parseRetryAfter(res);
    await sleep(retryAfter * 1000, signal);
    return this.request<T>(method, path, body, retries + 1, signal, idempotencyKey);
  }

  const json = await res.json() as { data: T };
  if (!res.ok) throw errorFromResponse(res.status, json);

  return json.data;
}
```

- [ ] **Paso 4: genera una por llamada en los siete métodos**

Añade el tipo y el ayudante cerca de la clase:

```ts
/** Lets a caller govern the key, for instance deriving it from its own job id. */
export interface WriteOptions {
  idempotencyKey?: string;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
```

Y en cada uno de los siete métodos, con esta forma exacta:

```ts
async createQuery(input: CreateQueryInput, options: WriteOptions = {}): Promise<CreatedQuery> {
  return this.request<CreatedQuery>(
    "POST",
    "/agent/queries",
    toWireQuery(input),
    0,
    undefined,
    options.idempotencyKey ?? newIdempotencyKey(),
  );
}
```

Los otros seis quedan con estas firmas exactas. El cuerpo de cada uno es el que
ya tenían; lo único que cambia es el parámetro `options` y los tres argumentos
finales de `request()`:

```ts
async createConversation(input: CreateConversationInput, options: WriteOptions = {}): Promise<Conversation>
async sendMessage(conversationId: string, input: SendMessageInput, options: WriteOptions = {}): Promise<Message>
async inviteHuman(conversationId: string, input: InviteHumanInput, options: WriteOptions = {}): Promise<Invitation>
async createWebhook(input: CreateWebhookInput, options: WriteOptions = {}): Promise<WebhookWithSecret>
async rotateWebhookSecret(id: string, options: WriteOptions = {}): Promise<WebhookWithSecret>
async rotateApiKey(options: WriteOptions = {}): Promise<RotateKeyResponse>
```

Cada uno llama a `request()` así, con `undefined` en el hueco de `signal` salvo
que el método ya recibiera uno:

```ts
return this.request<Conversation>(
  "POST",
  "/agent/conversations",
  input,
  0,
  undefined,
  options.idempotencyKey ?? newIdempotencyKey(),
);
```

- [ ] **Paso 5: ejecuta los tests del SDK**

Ejecuta: `cd sdks/typescript && bun test`
Esperado: PASS, incluidos los que ya existían.

- [ ] **Paso 6: commit**

```bash
git add sdks/typescript/src/client.ts sdks/typescript/tests/idempotency.test.ts
git commit -m "Send an idempotency key from the SDK, and keep it across a retry"
```

---

### Tarea 5: Documentación

**Ficheros:**
- Modificar: `docs/api/README.md`
- Modificar: `docs-site/content/docs/api-reference/agent/queries.mdx`,
  `conversations.mdx`, `messages.mdx`, `invitations.mdx`, `webhooks.mdx` y
  `key-rotate.mdx` — las seis páginas que documentan las siete rutas
- Modificar: `docs-site/content/docs/authentication.mdx` — donde viven las
  convenciones transversales de la API, que es donde va la explicación larga
- Modificar: `sdks/typescript/README.md`
- Modificar: `web/public/agentdialog-integration-guide.md` (**regenerado**, no editado a mano)

**Interfaces:**
- Consume: el comportamiento de las Tareas 3 y 4.
- Produce: nada de código.

- [ ] **Paso 1: escribe la sección en `docs/api/README.md`**

Colócala junto a las convenciones generales de la API, no dentro de una ruta
concreta, e incluye exactamente esto:

- La cabecera es `Idempotency-Key`, **opcional**, cadena no vacía de hasta 255
  caracteres.
- Las siete rutas que la honran, en una tabla.
- Los tres desenlaces: respuesta original con `Idempotency-Replayed: true`;
  `409 IDEMPOTENCY_IN_PROGRESS`; `409 IDEMPOTENCY_KEY_REUSED`.
- **Solo se recuerdan las respuestas con éxito**: tras un `4xx` o un `5xx` la
  clave queda libre, para que el agente corrija el cuerpo y reintente.
- La memoria dura 24 horas.
- El SDK de TypeScript la envía sola; se puede sobrescribir con
  `{ idempotencyKey }`.

- [ ] **Paso 2: lleva lo mismo a `docs-site` y al README del SDK**

La explicación larga —los tres desenlaces, las 24 horas y la regla de que solo se
recuerdan los éxitos— va una sola vez, en
`docs-site/content/docs/authentication.mdx`, junto al resto de convenciones
transversales. En cada una de las seis páginas de `api-reference/agent/` basta
una línea que diga que esa ruta acepta la cabecera y enlace a la explicación.

En `sdks/typescript/README.md`, un ejemplo con la opción:

```ts
// The SDK sends a key on every write. Pass your own when you want to govern it —
// deriving it from your job id makes your whole job replayable.
await client.createQuery(input, { idempotencyKey: job.id });
```

- [ ] **Paso 3: regenera la guía pública**

```bash
cd web && bun run build
```

Eso ejecuta `scripts/sync-integration-guide.sh` y reescribe
`web/public/agentdialog-integration-guide.md`. **No lo edites a mano**: es una
copia generada, y editarla se pierde en la siguiente construcción.

- [ ] **Paso 4: comprueba que todo sigue verde**

```bash
bunx tsc --noEmit
bun run lint
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun test tests/unit tests/integration
```

- [ ] **Paso 5: commit**

```bash
git add docs/api/README.md docs-site sdks/typescript/README.md web/public/agentdialog-integration-guide.md
git commit -m "Document the header, and that only successes are remembered"
```

---

## Lo que este plan deja fuera a propósito

- **Las tres rutas de subida** y `POST /agent/register`, con las razones del spec.
- **Reintentar fallos de red en el SDK**, que ahora sería seguro y sigue siendo
  otro trabajo.
- **Publicar una versión del SDK.** El cambio es compatible hacia atrás; cuándo
  se publica es una decisión aparte, y va por etiqueta `sdk-v*`, nunca por una
  GitHub Release.
