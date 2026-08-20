# Publicación de @agentdialog/sdk en npm — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar `@agentdialog/sdk` en npm, con las rutas REST de human queries que hoy faltan en el backend y con adaptadores para Vercel AI SDK y LangChain.js como subpath exports.

**Architecture:** Un único paquete npm construido desde `sdks/typescript/`, con tres puntos de entrada (`.`, `./ai`, `./langchain`). El núcleo mantiene cero dependencias en runtime y habla con la API REST mediante `fetch` nativo. Los frameworks van como peer dependencies opcionales. El backend gana `src/routes/agent/queries.ts`, envoltorio fino sobre funciones de servicio que ya existen.

**Tech Stack:** Bun, Hono, Drizzle, Zod, TypeScript 5.7, `bun test`, GitHub Actions con OIDC.

**Spec:** `docs/superpowers/specs/2026-08-20-npm-sdk-packaging-design.md`

## Global Constraints

- El paquete raíz `@agentdialog/sdk` mantiene **cero dependencias en runtime**. `ai`, `@langchain/core` y `zod` van en `peerDependencies` con `peerDependenciesMeta.optional = true`.
- Base URL por defecto del SDK: `https://api.agentdialog.io`. El dominio `agentdialog.com` es incorrecto y no debe aparecer en ningún fichero.
- El prefijo real de las claves de agente es `mge_ag_` (`src/config/auth.ts:11`). `ad_ag_` es incorrecto y no debe aparecer en ningún fichero.
- La superficie pública del SDK es **camelCase**. La API REST usa snake_case en el recurso de queries (`query_type`, `target_human_email`, `timeout_minutes`); la traducción ocurre en el borde del SDK.
- Todas las rutas de agente responden `{ data: ... }`, siguiendo `src/routes/agent/webhooks.ts`.
- Versión de publicación: `0.1.0`.
- Cuenta de npm: usuario `agentdialog`. El scope `@agentdialog` es su scope de usuario; no hay organización que crear. Se publica con `--access public`.
- Cualquier cambio en el SDK actualiza documentación y ejemplos de la web **en el mismo cambio** (Task 5).
- Orden de despliegue: las rutas REST tienen que estar vivas en Cloud Run antes de publicar el paquete.
- Los mensajes de commit y los comentarios de código van en inglés, como el resto del repositorio.

---

### Task 1: Rutas REST de queries para agentes

Las funciones de servicio `createQuery`, `getQuery` y `listAgentQueries` ya existen y ya reciben `agentId`, pero solo se alcanzan desde `src/mcp/server.ts`. Esta tarea las expone por REST.

**Files:**
- Create: `src/routes/agent/queries.ts`
- Modify: `src/validators/query.validators.ts` (añadir `listQueriesQuerySchema` al final)
- Modify: `src/app.ts` (import junto a los demás de agente, y `agentApi.route`)
- Test: `tests/integration/agent-queries.test.ts`
- Test: `tests/unit/validators.test.ts` (añadir casos)

**Interfaces:**
- Consumes: `createQuery(agentId, input)`, `getQuery(queryId, agentId)`, `listAgentQueries(agentId, { status?, limit })` de `src/services/query.service.ts`; `validateBody` y `validateQuery` de `src/middleware/validate.ts`.
- Produces: `POST /api/v1/agent/queries` → `201 { data: { query_id, status, conversation_id, message, next_step, expires_at } }`; `GET /api/v1/agent/queries/:id` → `200 { data: {...} }`; `GET /api/v1/agent/queries?status=&limit=` → `200 { data: [...] }`. Task 2 consume estas tres rutas.

- [ ] **Step 1: Escribir el test de validación que falla**

En `tests/unit/validators.test.ts`, añadir al final:

```typescript
import { listQueriesQuerySchema } from "../../src/validators/query.validators";

describe("listQueriesQuerySchema", () => {
  it("coerces limit from a query string into a number", () => {
    const result = listQueriesQuerySchema.parse({ limit: "50" });
    expect(result.limit).toBe(50);
  });

  it("defaults limit to 20 when absent", () => {
    const result = listQueriesQuerySchema.parse({});
    expect(result.limit).toBe(20);
  });

  it("rejects a limit above 100", () => {
    expect(() => listQueriesQuerySchema.parse({ limit: "101" })).toThrow();
  });

  it("rejects an unknown status", () => {
    expect(() => listQueriesQuerySchema.parse({ status: "bogus" })).toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `bun test tests/unit/validators.test.ts`
Expected: FAIL — `listQueriesQuerySchema` no está exportado.

- [ ] **Step 3: Añadir el esquema**

Al final de `src/validators/query.validators.ts`:

```typescript
// GET variant: query-string values always arrive as strings, so limit is coerced.
// listQueriesSchema is left untouched because the MCP list_queries tool uses it.
export const listQueriesQuerySchema = z.object({
  status: z.enum(["pending", "assigned", "answered", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQueriesQueryInput = z.infer<typeof listQueriesQuerySchema>;
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `bun test tests/unit/validators.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir el test de integración que falla**

Crear `tests/integration/agent-queries.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";

describe("Agent queries REST API", () => {
  const app = createTestApp();

  it("creates, reads and lists a query", async () => {
    const { authHeader } = await createTestAgent();

    const createRes = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        query_type: "validation",
        question: "Should we deploy on a Friday?",
        target_human_email: `queries-${Date.now()}@example.com`,
        timeout_minutes: 60,
      }),
    });
    expect(createRes.status).toBe(201);
    const { data: created } = await createRes.json();
    expect(created.query_id).toBeString();
    expect(created.status).toBe("pending");

    const getRes = await app.request(`/api/v1/agent/queries/${created.query_id}`, {
      headers: { Authorization: authHeader },
    });
    expect(getRes.status).toBe(200);
    const { data: fetched } = await getRes.json();
    expect(fetched.question).toBe("Should we deploy on a Friday?");
    expect(fetched.answer).toBeNull();

    const listRes = await app.request("/api/v1/agent/queries?limit=10", {
      headers: { Authorization: authHeader },
    });
    expect(listRes.status).toBe(200);
    const { data: list } = await listRes.json();
    expect(list.some((q: any) => q.query_id === created.query_id)).toBe(true);
  });

  it("rejects an invalid payload with 422", async () => {
    const { authHeader } = await createTestAgent();
    const res = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ query_type: "validation", question: "" }),
    });
    expect(res.status).toBe(422);
  });

  it("requires authentication", async () => {
    const res = await app.request("/api/v1/agent/queries");
    expect(res.status).toBe(401);
  });

  it("does not leak another agent's query", async () => {
    const owner = await createTestAgent();
    const stranger = await createTestAgent();

    const createRes = await app.request("/api/v1/agent/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: owner.authHeader },
      body: JSON.stringify({
        query_type: "expert_query",
        question: "Private question",
        target_human_email: `isolation-${Date.now()}@example.com`,
      }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/api/v1/agent/queries/${created.query_id}`, {
      headers: { Authorization: stranger.authHeader },
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Ejecutar el test y verificar que falla**

Run: `bun test tests/integration/agent-queries.test.ts`
Expected: FAIL con 404 en todas las rutas — todavía no están montadas.

Nota: estos tests necesitan la base de datos de test levantada. Si no lo está:
`docker compose -f docker-compose.dev.yml up -d postgres redis` y `bun run db:migrate`.

- [ ] **Step 7: Crear el fichero de rutas**

Crear `src/routes/agent/queries.ts`:

```typescript
import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { createQuery, getQuery, listAgentQueries } from "../../services/query.service";
import { validateBody, validateQuery } from "../../middleware/validate";
import { createQuerySchema, listQueriesQuerySchema } from "../../validators/query.validators";

const app = new Hono<AppEnv>();

app.post("/", validateBody(createQuerySchema), async (c) => {
  const agentId = c.get("agentId");
  const input = c.get("validatedBody");
  const result = await createQuery(agentId, input);
  return c.json({ data: result }, 201);
});

app.get("/", validateQuery(listQueriesQuerySchema), async (c) => {
  const agentId = c.get("agentId");
  const { status, limit } = c.get("validatedQuery");
  const queries = await listAgentQueries(agentId, { status, limit });
  return c.json({ data: queries });
});

app.get("/:id", async (c) => {
  const agentId = c.get("agentId");
  const query = await getQuery(c.req.param("id"), agentId);
  return c.json({ data: query });
});

export default app;
```

El orden importa: `GET /` va antes que `GET /:id` para que Hono no interprete la lista como un id.

- [ ] **Step 8: Montar las rutas**

En `src/app.ts`, junto a los demás imports de agente:

```typescript
import agentQueryRoutes from "./routes/agent/queries";
```

y dentro del bloque `agentApi`, después de `agentApi.route("/webhooks", agentWebhookRoutes);`:

```typescript
  agentApi.route("/queries", agentQueryRoutes);
```

- [ ] **Step 9: Ejecutar los tests y verificar que pasan**

Run: `bun test tests/integration/agent-queries.test.ts && bun run typecheck`
Expected: PASS, sin errores de tipos.

- [ ] **Step 10: Commit**

```bash
git add src/routes/agent/queries.ts src/validators/query.validators.ts src/app.ts tests/integration/agent-queries.test.ts tests/unit/validators.test.ts
git commit -m "Add agent REST routes for human queries

The query service already had createQuery, getQuery and listAgentQueries,
but they were only reachable over MCP. Any integrator using fetch or the
SDK could not ask a human anything.

listQueriesSchema is left as is because the MCP tool uses it; the GET
route gets its own schema that coerces limit from the query string."
```

---

### Task 2: Métodos de queries en el SDK y arreglo de los defectos

**Files:**
- Create: `sdks/typescript/src/queries.ts`
- Modify: `sdks/typescript/src/client.ts` (constante `DEFAULT_BASE_URL:32`, y métodos nuevos antes del bloque `// ── Internal ──`)
- Modify: `sdks/typescript/src/index.ts` (exports nuevos)
- Test: `sdks/typescript/tests/queries.test.ts`

**Interfaces:**
- Consumes: las tres rutas REST de Task 1; el método privado `request<T>(method, path, body?)` de `client.ts`, que ya devuelve `json.data`.
- Produces: `client.createQuery(input): Promise<CreatedQuery>`, `client.getQuery(queryId): Promise<Query>`, `client.listQueries(params?): Promise<QuerySummary[]>`, y los tipos `QueryType`, `QueryStatus`, `CreateQueryInput`, `CreatedQuery`, `Query`, `QuerySummary`, `ListQueriesParams`. Task 3 y Task 4 los consumen.

- [ ] **Step 1: Escribir el test que falla**

Crear `sdks/typescript/tests/queries.test.ts`:

```typescript
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

describe("query methods", () => {
  it("defaults to the production API host", async () => {
    const calls = mockFetch({ data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-20T12:00:00.000Z" } });
    const client = new AgentDialog({ apiKey: "mge_ag_test" });
    await client.createQuery({
      queryType: "validation",
      question: "Ship it?",
      targetHumanEmail: "someone@example.com",
    });
    expect(calls[0].url).toBe("https://api.agentdialog.io/api/v1/agent/queries");
  });

  it("sends camelCase input as snake_case", async () => {
    const calls = mockFetch({ data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-20T12:00:00.000Z" } });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    await client.createQuery({
      queryType: "expert_query",
      question: "Ship it?",
      targetHumanEmail: "someone@example.com",
      timeoutMinutes: 30,
    });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toEqual({
      query_type: "expert_query",
      question: "Ship it?",
      target_human_email: "someone@example.com",
      timeout_minutes: 30,
    });
  });

  it("maps a snake_case response into camelCase", async () => {
    mockFetch({
      data: {
        query_id: "q1", status: "answered", query_type: "validation",
        question: "Ship it?", context: null, confidence: null,
        answer: "yes", comment: "go ahead", human_confidence: 0.9,
        response_time_ms: 1234,
        created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
      },
    });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    const query = await client.getQuery("q1");
    expect(query.queryId).toBe("q1");
    expect(query.humanConfidence).toBe(0.9);
    expect(query.responseTimeMs).toBe(1234);
    expect(query.answer).toBe("yes");
  });

  it("passes list filters as query parameters", async () => {
    const calls = mockFetch({ data: [] });
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    await client.listQueries({ status: "answered", limit: 5 });
    expect(calls[0].url).toBe("https://example.test/api/v1/agent/queries?status=answered&limit=5");
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `cd sdks/typescript && bun test tests/queries.test.ts`
Expected: FAIL — `client.createQuery is not a function`, y la primera aserción del host también falla porque `DEFAULT_BASE_URL` sigue en `agentdialog.com`.

- [ ] **Step 3: Crear los tipos de query**

Crear `sdks/typescript/src/queries.ts`:

```typescript
export type QueryType = "validation" | "interpretation" | "expert_query" | "labeling";
export type QueryStatus = "pending" | "assigned" | "answered" | "expired";

export interface CreateQueryInput {
  queryType: QueryType;
  question: string;
  targetHumanEmail: string;
  context?: string;
  confidence?: number;
  timeoutMinutes?: number;
  metadata?: Record<string, unknown>;
}

export interface CreatedQuery {
  queryId: string;
  status: QueryStatus;
  conversationId: string;
  expiresAt: string;
}

export interface Query {
  queryId: string;
  status: QueryStatus;
  queryType: QueryType;
  question: string;
  context: string | null;
  confidence: number | null;
  answer: string | null;
  comment: string | null;
  humanConfidence: number | null;
  responseTimeMs: number | null;
  createdAt: string;
  expiresAt: string;
}

export interface QuerySummary {
  queryId: string;
  status: QueryStatus;
  queryType: QueryType;
  question: string;
  humanEmail: string;
  answer: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ListQueriesParams {
  status?: QueryStatus;
  limit?: number;
}

/** Wire shapes: the queries resource is snake_case on the API. */
export interface CreatedQueryWire {
  query_id: string;
  status: QueryStatus;
  conversation_id: string;
  expires_at: string;
}

export interface QueryWire {
  query_id: string;
  status: QueryStatus;
  query_type: QueryType;
  question: string;
  context: string | null;
  confidence: number | null;
  answer: string | null;
  comment: string | null;
  human_confidence: number | null;
  response_time_ms: number | null;
  created_at: string;
  expires_at: string;
}

export interface QuerySummaryWire {
  query_id: string;
  status: QueryStatus;
  query_type: QueryType;
  question: string;
  human_email: string;
  answer: string | null;
  created_at: string;
  expires_at: string;
}

export function toCreateQueryBody(input: CreateQueryInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query_type: input.queryType,
    question: input.question,
    target_human_email: input.targetHumanEmail,
  };
  if (input.context !== undefined) body.context = input.context;
  if (input.confidence !== undefined) body.confidence = input.confidence;
  if (input.timeoutMinutes !== undefined) body.timeout_minutes = input.timeoutMinutes;
  if (input.metadata !== undefined) body.metadata = input.metadata;
  return body;
}

export function fromCreatedQueryWire(wire: CreatedQueryWire): CreatedQuery {
  return {
    queryId: wire.query_id,
    status: wire.status,
    conversationId: wire.conversation_id,
    expiresAt: wire.expires_at,
  };
}

export function fromQueryWire(wire: QueryWire): Query {
  return {
    queryId: wire.query_id,
    status: wire.status,
    queryType: wire.query_type,
    question: wire.question,
    context: wire.context,
    confidence: wire.confidence,
    answer: wire.answer,
    comment: wire.comment,
    humanConfidence: wire.human_confidence,
    responseTimeMs: wire.response_time_ms,
    createdAt: wire.created_at,
    expiresAt: wire.expires_at,
  };
}

export function fromQuerySummaryWire(wire: QuerySummaryWire): QuerySummary {
  return {
    queryId: wire.query_id,
    status: wire.status,
    queryType: wire.query_type,
    question: wire.question,
    humanEmail: wire.human_email,
    answer: wire.answer,
    createdAt: wire.created_at,
    expiresAt: wire.expires_at,
  };
}
```

- [ ] **Step 4: Arreglar la base URL y añadir los métodos**

En `sdks/typescript/src/client.ts`, línea 32:

```typescript
const DEFAULT_BASE_URL = "https://api.agentdialog.io";
```

Añadir a los imports de tipos del principio del fichero:

```typescript
import {
  toCreateQueryBody,
  fromCreatedQueryWire,
  fromQueryWire,
  fromQuerySummaryWire,
} from "./queries.js";
import type {
  CreateQueryInput,
  CreatedQuery,
  CreatedQueryWire,
  ListQueriesParams,
  Query,
  QuerySummary,
  QuerySummaryWire,
  QueryWire,
} from "./queries.js";
```

Y dentro de la clase, justo antes del comentario `// ── Internal ──`:

```typescript
  // ── Human queries ──

  /** Ask a human a question. Returns immediately; the human answers by email. */
  async createQuery(input: CreateQueryInput): Promise<CreatedQuery> {
    const wire = await this.request<CreatedQueryWire>(
      "POST",
      "/agent/queries",
      toCreateQueryBody(input),
    );
    return fromCreatedQueryWire(wire);
  }

  /** Read a query's current status and, once answered, the human's answer. */
  async getQuery(queryId: string): Promise<Query> {
    const wire = await this.request<QueryWire>("GET", `/agent/queries/${queryId}`);
    return fromQueryWire(wire);
  }

  async listQueries(params?: ListQueriesParams): Promise<QuerySummary[]> {
    const wire = await this.request<QuerySummaryWire[]>(
      "GET",
      `/agent/queries${buildQuery(params as Record<string, unknown> | undefined)}`,
    );
    return wire.map(fromQuerySummaryWire);
  }
```

`buildQuery` ya existe al final de `client.ts` y omite las claves `undefined`.

- [ ] **Step 5: Exportar desde el índice**

En `sdks/typescript/src/index.ts`, añadir al bloque de tipos:

```typescript
export type {
  CreateQueryInput,
  CreatedQuery,
  ListQueriesParams,
  Query,
  QueryStatus,
  QuerySummary,
  QueryType,
} from "./queries.js";
```

- [ ] **Step 6: Ejecutar los tests y verificar que pasan**

Run: `cd sdks/typescript && bun test && bunx tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 7: Verificar que el dominio incorrecto ya no aparece**

Run: `grep -rn "agentdialog.com\|ad_ag_" sdks/typescript/src`
Expected: sin resultados. El README se arregla en Task 5.

- [ ] **Step 8: Commit**

```bash
git add sdks/typescript/src/queries.ts sdks/typescript/src/client.ts sdks/typescript/src/index.ts sdks/typescript/tests/queries.test.ts
git commit -m "Add human queries to the TypeScript SDK

Also fixes the default base URL, which pointed at agentdialog.com, a
domain that is not ours. The queries resource is snake_case on the wire;
the SDK surface stays camelCase and translates at the edge."
```

---

### Task 3: `waitForAnswer`

Un humano tarda minutos u horas en responder. Este helper hace el polling por quien pueda permitirse bloquear: scripts, workers, jobs.

**Files:**
- Modify: `sdks/typescript/src/client.ts` (método nuevo tras `listQueries`)
- Modify: `sdks/typescript/src/errors.ts` (clase nueva)
- Modify: `sdks/typescript/src/index.ts` (export nuevo)
- Test: `sdks/typescript/tests/wait-for-answer.test.ts`

**Interfaces:**
- Consumes: `client.getQuery(queryId)` de Task 2.
- Produces: `client.waitForAnswer(queryId, options?): Promise<Query>` y `QueryTimeoutError`. Task 4 no lo usa; Task 5 lo documenta.

- [ ] **Step 1: Escribir el test que falla**

Crear `sdks/typescript/tests/wait-for-answer.test.ts`:

```typescript
import { describe, expect, it, afterEach } from "bun:test";
import { AgentDialog } from "../src/client.js";
import { QueryTimeoutError } from "../src/errors.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function queryPayload(status: string, answer: string | null = null) {
  return {
    data: {
      query_id: "q1", status, query_type: "validation", question: "Ship it?",
      context: null, confidence: null, answer, comment: null,
      human_confidence: null, response_time_ms: null,
      created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
    },
  };
}

/** Serves the given statuses in order, repeating the last one forever. */
function mockSequence(statuses: string[]) {
  let i = 0;
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i++;
    state.calls++;
    const answer = status === "answered" ? "yes" : null;
    return new Response(JSON.stringify(queryPayload(status, answer)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return state;
}

describe("waitForAnswer", () => {
  const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });

  it("polls until the query is answered", async () => {
    const state = mockSequence(["pending", "assigned", "answered"]);
    const query = await client.waitForAnswer("q1", { pollIntervalMs: 1 });
    expect(query.status).toBe("answered");
    expect(query.answer).toBe("yes");
    expect(state.calls).toBe(3);
  });

  it("resolves rather than throwing when the query expires", async () => {
    mockSequence(["pending", "expired"]);
    const query = await client.waitForAnswer("q1", { pollIntervalMs: 1 });
    expect(query.status).toBe("expired");
  });

  it("throws QueryTimeoutError once timeoutMs elapses", async () => {
    mockSequence(["pending"]);
    await expect(
      client.waitForAnswer("q1", { pollIntervalMs: 1, timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(QueryTimeoutError);
  });

  it("stops when the signal is aborted", async () => {
    mockSequence(["pending"]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("caller gave up")), 10);
    await expect(
      client.waitForAnswer("q1", { pollIntervalMs: 1, signal: controller.signal }),
    ).rejects.toThrow("caller gave up");
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `cd sdks/typescript && bun test tests/wait-for-answer.test.ts`
Expected: FAIL — `QueryTimeoutError` no existe.

- [ ] **Step 3: Añadir el error**

Al final de `sdks/typescript/src/errors.ts`:

```typescript
export class QueryTimeoutError extends AgentDialogError {
  constructor(queryId: string, timeoutMs: number) {
    super(
      408,
      "QUERY_TIMEOUT",
      `Query ${queryId} was not answered within ${timeoutMs}ms`,
    );
    this.name = "QueryTimeoutError";
  }
}
```

La firma de `AgentDialogError` es `(status, code, message, details?)`, la misma que usa `errorFromResponse` en `client.ts`.

- [ ] **Step 4: Implementar el método**

En `sdks/typescript/src/client.ts`, tras `listQueries`:

```typescript
  /**
   * Poll a query until a human answers it or it expires.
   *
   * Backs off from pollIntervalMs up to maxPollIntervalMs, because humans
   * answer on human timescales and tight polling only burns rate limit.
   * An expired query resolves rather than throwing: expiry is an answer of
   * sorts, and the caller usually wants to branch on it.
   */
  async waitForAnswer(
    queryId: string,
    options: {
      pollIntervalMs?: number;
      maxPollIntervalMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<Query> {
    const {
      pollIntervalMs = 10_000,
      maxPollIntervalMs = 60_000,
      timeoutMs,
      signal,
    } = options;

    const startedAt = Date.now();
    let interval = pollIntervalMs;

    for (;;) {
      if (signal?.aborted) throw signal.reason ?? new Error("Aborted");

      const query = await this.getQuery(queryId);
      if (query.status === "answered" || query.status === "expired") return query;

      if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) {
        throw new QueryTimeoutError(queryId, timeoutMs);
      }

      await sleep(interval, signal);
      interval = Math.min(interval * 2, maxPollIntervalMs);
    }
  }
```

Añadir el import del error al bloque de imports de `errors.js` del principio del fichero:

```typescript
  QueryTimeoutError,
```

- [ ] **Step 5: Hacer que `sleep` respete el `AbortSignal`**

Al final de `client.ts`, sustituir el helper `sleep` existente por:

```typescript
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Aborted"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal!.reason ?? new Error("Aborted"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
```

El parámetro es opcional, así que las llamadas existentes en `request` y `requestPaginated` siguen compilando sin cambios.

- [ ] **Step 6: Exportar**

En `sdks/typescript/src/index.ts`, añadir `QueryTimeoutError` al bloque de exports de errores.

- [ ] **Step 7: Ejecutar los tests y verificar que pasan**

Run: `cd sdks/typescript && bun test && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add sdks/typescript/src/client.ts sdks/typescript/src/errors.ts sdks/typescript/src/index.ts sdks/typescript/tests/wait-for-answer.test.ts
git commit -m "Add waitForAnswer to the SDK

Polls with exponential backoff up to a minute, honours an AbortSignal,
and resolves on expiry instead of throwing, since callers usually want
to branch on an expired query rather than catch it."
```

---

### Task 4: Adaptadores de framework como subpath exports

**Files:**
- Create: `sdks/typescript/src/ai/index.ts`
- Create: `sdks/typescript/src/langchain/index.ts`
- Modify: `sdks/typescript/package.json`
- Test: `sdks/typescript/tests/adapters.test.ts`

**Interfaces:**
- Consumes: `client.createQuery` y `client.getQuery` de Task 2.
- Produces: `askHumanTool(client, options?)` y `checkAnswerTool(client)` desde `@agentdialog/sdk/ai` y desde `@agentdialog/sdk/langchain`.

- [ ] **Step 1: Instalar los peers como dependencias de desarrollo**

Run: `cd sdks/typescript && bun add -d ai @langchain/core zod`

Son solo para compilar y testear. En `package.json` van declaradas como peers opcionales en el Step 5.

- [ ] **Step 2: Comprobar la API real de los frameworks instalados**

Ambas librerías han cambiado la firma de sus helpers entre versiones mayores, así que no se puede escribir el adaptador de memoria. Comprobar contra lo instalado:

Run: `cd sdks/typescript && cat node_modules/ai/package.json | grep '"version"' && grep -n "inputSchema\|parameters?:" node_modules/ai/dist/index.d.ts | head -10`

- Si aparece `inputSchema`, es AI SDK v5 o posterior: usar `inputSchema` en el Step 5.
- Si aparece `parameters`, es v4: usar `parameters`.

Run: `cd sdks/typescript && cat node_modules/@langchain/core/package.json | grep '"version"' && grep -rn "DynamicStructuredTool\|declare function tool" node_modules/@langchain/core/dist/tools/index.d.ts | head -10`

- Si `DynamicStructuredTool` sigue exportado, usar la clase como en el Step 5.
- Si solo existe el helper `tool(func, config)`, usar `tool(async (args) => {...}, { name, description, schema })`, que recibe la misma función y el mismo esquema zod.

Anotar las dos versiones observadas: se usan en el Step 6 para fijar los rangos de `peerDependencies`.

- [ ] **Step 3: Escribir el test que falla**

Crear `sdks/typescript/tests/adapters.test.ts`:

```typescript
import { describe, expect, it, afterEach } from "bun:test";
import { AgentDialog } from "../src/client.js";
import { askHumanTool, checkAnswerTool } from "../src/ai/index.js";
import { askHumanTool as lcAskHumanTool } from "../src/langchain/index.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(payload: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });

describe("Vercel AI SDK adapter", () => {
  it("askHumanTool creates a query and returns the id", async () => {
    const calls = mockFetch({
      data: { query_id: "q1", status: "pending", conversation_id: "c1", expires_at: "2026-08-20T12:00:00.000Z" },
    });
    const tool = askHumanTool(client, { defaultEmail: "owner@example.com" });
    const result = await tool.execute!(
      { question: "Ship it?", queryType: "validation" },
      {} as any,
    );
    expect(result.queryId).toBe("q1");
    expect(result.status).toBe("pending");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.target_human_email).toBe("owner@example.com");
    expect(body.question).toBe("Ship it?");
  });

  it("checkAnswerTool reads a query", async () => {
    mockFetch({
      data: {
        query_id: "q1", status: "answered", query_type: "validation",
        question: "Ship it?", context: null, confidence: null,
        answer: "yes", comment: null, human_confidence: null,
        response_time_ms: null,
        created_at: "2026-08-20T10:00:00.000Z", expires_at: "2026-08-20T12:00:00.000Z",
      },
    });
    const tool = checkAnswerTool(client);
    const result = await tool.execute!({ queryId: "q1" }, {} as any);
    expect(result.status).toBe("answered");
    expect(result.answer).toBe("yes");
  });

  it("askHumanTool rejects when no email is available", async () => {
    mockFetch({ data: {} });
    const tool = askHumanTool(client);
    await expect(
      tool.execute!({ question: "Ship it?", queryType: "validation" }, {} as any),
    ).rejects.toThrow(/target email/i);
  });
});

describe("LangChain adapter", () => {
  it("exposes a structured tool that creates a query", async () => {
    mockFetch({
      data: { query_id: "q2", status: "pending", conversation_id: "c2", expires_at: "2026-08-20T12:00:00.000Z" },
    });
    const tool = lcAskHumanTool(client, { defaultEmail: "owner@example.com" });
    expect(tool.name).toBe("ask_human");
    const raw = await tool.invoke({ question: "Ship it?", queryType: "validation" });
    expect(JSON.parse(raw).queryId).toBe("q2");
  });
});
```

- [ ] **Step 4: Ejecutar el test y verificar que falla**

Run: `cd sdks/typescript && bun test tests/adapters.test.ts`
Expected: FAIL — los módulos `src/ai/index.ts` y `src/langchain/index.ts` no existen.

- [ ] **Step 5: Escribir los adaptadores**

Crear `sdks/typescript/src/ai/index.ts`. El código de abajo usa `inputSchema`, la forma del AI SDK v5 en adelante (la instalada por el Step 1 será v7 o superior). **Si el Step 2 mostró `parameters`, renombrar los dos `inputSchema:` a `parameters:` y no cambiar nada más** — el resto de la firma es igual en ambas versiones.

```typescript
import { tool, jsonSchema } from "ai";
import type { AgentDialog } from "../client.js";
import type { QueryType } from "../queries.js";

export interface AskHumanOptions {
  /** Used when the model does not supply a target email. */
  defaultEmail?: string;
  timeoutMinutes?: number;
}

interface AskHumanArgs {
  question: string;
  queryType: QueryType;
  context?: string;
  targetHumanEmail?: string;
}

const ASK_HUMAN_DESCRIPTION = `Ask a human a question and get a query id back immediately.

The human answers by email, which takes minutes or hours. This tool does NOT
wait for them. It returns a query id; use check_answer later to see whether
they have replied.`;

export function askHumanTool(client: AgentDialog, options: AskHumanOptions = {}) {
  return tool({
    description: ASK_HUMAN_DESCRIPTION,
    inputSchema: jsonSchema<AskHumanArgs>({
      type: "object",
      properties: {
        question: { type: "string", description: "The question to ask the human" },
        queryType: {
          type: "string",
          enum: ["validation", "interpretation", "expert_query", "labeling"],
          description:
            "validation (yes/no), interpretation (explain), expert_query (domain knowledge), labeling (classify)",
        },
        context: { type: "string", description: "Extra context: code, data, anything that helps them answer" },
        targetHumanEmail: { type: "string", description: "Email of the human to ask" },
      },
      required: ["question", "queryType"],
    }),
    execute: async (args: AskHumanArgs) => {
      const email = args.targetHumanEmail ?? options.defaultEmail;
      if (!email) {
        throw new Error(
          "No target email: pass targetHumanEmail in the tool call or defaultEmail in askHumanTool options",
        );
      }
      const created = await client.createQuery({
        queryType: args.queryType,
        question: args.question,
        context: args.context,
        targetHumanEmail: email,
        timeoutMinutes: options.timeoutMinutes,
      });
      return {
        queryId: created.queryId,
        status: created.status,
        expiresAt: created.expiresAt,
      };
    },
  });
}

export function checkAnswerTool(client: AgentDialog) {
  return tool({
    description:
      "Check whether a human has answered a query created with ask_human. Returns the status and, once answered, their answer.",
    inputSchema: jsonSchema<{ queryId: string }>({
      type: "object",
      properties: {
        queryId: { type: "string", description: "The id returned by ask_human" },
      },
      required: ["queryId"],
    }),
    execute: async ({ queryId }: { queryId: string }) => {
      const query = await client.getQuery(queryId);
      return {
        status: query.status,
        answer: query.answer,
        comment: query.comment,
      };
    },
  });
}
```

Crear `sdks/typescript/src/langchain/index.ts`:

```typescript
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentDialog } from "../client.js";

export interface AskHumanOptions {
  /** Used when the model does not supply a target email. */
  defaultEmail?: string;
  timeoutMinutes?: number;
}

const queryTypeSchema = z.enum(["validation", "interpretation", "expert_query", "labeling"]);

export function askHumanTool(client: AgentDialog, options: AskHumanOptions = {}) {
  return new DynamicStructuredTool({
    name: "ask_human",
    description:
      "Ask a human a question and get a query id back immediately. The human answers by email, which takes minutes or hours, so this does not wait. Use check_answer later.",
    schema: z.object({
      question: z.string().describe("The question to ask the human"),
      queryType: queryTypeSchema.describe(
        "validation (yes/no), interpretation (explain), expert_query (domain knowledge), labeling (classify)",
      ),
      context: z.string().optional().describe("Extra context that helps them answer"),
      targetHumanEmail: z.string().optional().describe("Email of the human to ask"),
    }),
    func: async (args) => {
      const email = args.targetHumanEmail ?? options.defaultEmail;
      if (!email) {
        throw new Error(
          "No target email: pass targetHumanEmail in the tool call or defaultEmail in askHumanTool options",
        );
      }
      const created = await client.createQuery({
        queryType: args.queryType,
        question: args.question,
        context: args.context,
        targetHumanEmail: email,
        timeoutMinutes: options.timeoutMinutes,
      });
      return JSON.stringify({
        queryId: created.queryId,
        status: created.status,
        expiresAt: created.expiresAt,
      });
    },
  });
}

export function checkAnswerTool(client: AgentDialog) {
  return new DynamicStructuredTool({
    name: "check_answer",
    description:
      "Check whether a human has answered a query created with ask_human. Returns the status and, once answered, their answer.",
    schema: z.object({
      queryId: z.string().describe("The id returned by ask_human"),
    }),
    func: async ({ queryId }) => {
      const query = await client.getQuery(queryId);
      return JSON.stringify({
        status: query.status,
        answer: query.answer,
        comment: query.comment,
      });
    },
  });
}
```

- [ ] **Step 6: Declarar los subpaths y los peers**

Sustituir los campos correspondientes de `sdks/typescript/package.json`:

```json
{
  "name": "@agentdialog/sdk",
  "version": "0.1.0",
  "description": "Official TypeScript SDK for AgentDialog — ask humans, get answers by email",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./ai": {
      "types": "./dist/ai/index.d.ts",
      "import": "./dist/ai/index.js"
    },
    "./langchain": {
      "types": "./dist/langchain/index.d.ts",
      "import": "./dist/langchain/index.js"
    }
  },
  "files": ["dist"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/horelvis/agentDialog.git",
    "directory": "sdks/typescript"
  },
  "homepage": "https://agentdialog.io",
  "bugs": { "url": "https://github.com/horelvis/agentDialog/issues" },
  "keywords": ["agentdialog", "agent", "sdk", "api", "human-in-the-loop", "mcp", "ai"],
  "license": "MIT",
  "peerDependencies": {
    "ai": ">=5",
    "@langchain/core": ">=0.3",
    "zod": ">=3"
  },
  "peerDependenciesMeta": {
    "ai": { "optional": true },
    "@langchain/core": { "optional": true },
    "zod": { "optional": true }
  }
}
```

Conservar los `scripts` y `devDependencies` que ya tiene el fichero, añadiendo `ai`, `@langchain/core` y `zod` a `devDependencies` (los instaló el Step 1).

El campo `repository.directory` es lo que permite a npm enlazar al subdirectorio correcto del monorepo desde la página del paquete.

- [ ] **Step 7: Ejecutar los tests y verificar que pasan**

Run: `cd sdks/typescript && bun test && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Verificar el contenido del paquete**

Run: `cd sdks/typescript && bun run build && npm pack --dry-run`
Expected: el listado incluye `dist/index.js`, `dist/index.d.ts`, `dist/ai/index.js`, `dist/ai/index.d.ts`, `dist/langchain/index.js`, `dist/langchain/index.d.ts`. Si falta alguno, `tsc` no está emitiendo los subdirectorios: comprobar que `include` de `tsconfig.json` sigue siendo `["src"]`.

Verificar además que los peers no se colaron como dependencias reales:

Run: `node -e "const p=require('./package.json'); if (p.dependencies) { console.error('FAIL: runtime deps', p.dependencies); process.exit(1); } console.log('OK: zero runtime deps')"`
Expected: `OK: zero runtime deps`.

- [ ] **Step 9: Commit**

```bash
git add sdks/typescript/src/ai sdks/typescript/src/langchain sdks/typescript/package.json sdks/typescript/tests/adapters.test.ts sdks/typescript/bun.lockb
git commit -m "Add Vercel AI SDK and LangChain adapters as subpath exports

Two tools rather than one blocking tool: a human answers by email over
minutes or hours, and a framework tool runs inside a streaming request.
ask_human returns a query id straight away and check_answer polls it,
the same shape the MCP tools already describe.

The frameworks are optional peers, so the root entry point keeps its
zero runtime dependencies."
```

---

### Task 5: Sincronizar documentación y ejemplos

Restricción del proyecto: el SDK y su documentación viajan juntos.

**Files:**
- Create: `docs-site/content/docs/api-reference/agent/queries.mdx`
- Create: `docs-site/content/docs/concepts/queries.mdx`
- Create: `scripts/sync-integration-guide.sh`
- Modify: `docs-site/content/docs/api-reference/agent/meta.json`
- Modify: `docs-site/content/docs/concepts/meta.json`
- Modify: `docs-site/content/docs/sdks/typescript.mdx`
- Modify: `docs-site/content/docs/quickstart.mdx`
- Modify: `docs-site/src/app/docs/layout.tsx:23-24`
- Modify: `web/src/components/landing/CodeExamples.tsx`
- Modify: `web/src/components/layout/Footer.tsx`
- Modify: `docs/api/README.md`
- Modify: `sdks/typescript/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: la superficie pública de Tasks 2, 3 y 4.
- Produces: nada que consuma código.

- [ ] **Step 1: Arreglar los dos enlaces rotos del nav de docs**

En `docs-site/src/app/docs/layout.tsx`, sustituir las líneas 23-24:

```tsx
        { text: "Home", url: "https://agentdialog.io" },
        { text: "GitHub", url: "https://github.com/horelvis/agentDialog", external: true },
```

`agentdialog.dev` no resuelve; el dominio es `.io`.

- [ ] **Step 2: Añadir enlaces al footer de la landing**

En `web/src/components/layout/Footer.tsx`, sustituir el párrafo suelto por el párrafo más una fila de enlaces:

```tsx
          <div className="flex items-center gap-6">
            <p className="text-sm text-gray-400">
              Agent-first messaging platform. Built for the AI era.
            </p>
            <a
              href="https://github.com/horelvis/agentDialog"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200"
            >
              GitHub
            </a>
            <a
              href="https://docs.agentdialog.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-200"
            >
              Docs
            </a>
          </div>
```

- [ ] **Step 3: Verificar los enlaces en el navegador**

Run: `cd web && bun run dev`
Comprobar en `http://localhost:5173` que los dos enlaces del footer abren su destino. Detener el servidor al terminar.

- [ ] **Step 4: Commit de los enlaces**

```bash
git add docs-site/src/app/docs/layout.tsx web/src/components/layout/Footer.tsx
git commit -m "Fix broken navigation links

The docs nav pointed Home at agentdialog.dev, a domain that does not
resolve, and GitHub at '#'. The landing footer had no links at all."
```

- [ ] **Step 5: Escribir la referencia de API de queries**

Crear `docs-site/content/docs/api-reference/agent/queries.mdx`, siguiendo el formato de `docs-site/content/docs/api-reference/agent/webhooks.mdx` (leerlo antes para copiar la estructura de bloques de petición/respuesta). Empieza con:

```mdx
---
title: Queries
description: "Ask a human a question and poll for their answer"
---
```

Contenido obligatorio:

- `POST /api/v1/agent/queries` — cuerpo con `query_type`, `question`, `target_human_email`, `context`, `confidence`, `timeout_minutes`, `metadata`; respuesta 201 con `query_id`, `status`, `conversation_id`, `expires_at`.
- `GET /api/v1/agent/queries/{id}` — respuesta con `status`, `answer`, `comment`, `human_confidence`, `response_time_ms`.
- `GET /api/v1/agent/queries` — parámetros `status` y `limit` (máximo 100, por defecto 20).
- Tabla de los cuatro estados: `pending`, `assigned`, `answered`, `expired`, con lo que significa cada uno (copiar las descripciones de `statusHints` en `src/services/query.service.ts:320-325`).

- [ ] **Step 6: Escribir el concepto**

Crear `docs-site/content/docs/concepts/queries.mdx`, empezando con:

```mdx
---
title: Human queries
description: How an agent asks a human a question and gets the answer back from their inbox
---
```

Explicar el flujo completo: el agente crea la query → el humano recibe un email con `Reply-To: reply+{queryId}@reply.agentdialog.io` → responde desde su bandeja → el webhook de entrada procesa la respuesta, acepta la invitación automáticamente y la registra → el agente la lee con `get_query`. Explicar la diferencia entre `pending` y `assigned` (auto-trust de humanos que ya aceptaron antes de ese agente).

- [ ] **Step 7: Darlos de alta en la navegación**

En `docs-site/content/docs/api-reference/agent/meta.json` añadir `"queries"` a `pages`, después de `"messages"`.
En `docs-site/content/docs/concepts/meta.json` añadir `"queries"` a `pages`.

- [ ] **Step 8: Reescribir la página del SDK**

En `docs-site/content/docs/sdks/typescript.mdx`, sustituir el contenido por: instalación (`npm install @agentdialog/sdk`), inicialización, el flujo de queries con `createQuery` y `waitForAnswer`, los adaptadores con sus instalaciones (`npm install @agentdialog/sdk ai` y `npm install @agentdialog/sdk @langchain/core`), y la tabla de errores. Todos los ejemplos con `mge_ag_...` como forma de la clave.

Ejemplo mínimo que debe aparecer:

```typescript
import { AgentDialog } from "@agentdialog/sdk";

const client = new AgentDialog({ apiKey: process.env.AGENTDIALOG_API_KEY! });

const { queryId } = await client.createQuery({
  queryType: "validation",
  question: "Deploy v2.3 to production?",
  context: "12 commits since the last release. All checks green.",
  targetHumanEmail: "oncall@example.com",
  timeoutMinutes: 120,
});

const answer = await client.waitForAnswer(queryId);
console.log(answer.status, answer.answer);
```

Y el del adaptador:

```typescript
import { AgentDialog } from "@agentdialog/sdk";
import { askHumanTool, checkAnswerTool } from "@agentdialog/sdk/ai";
import { generateText } from "ai";

const client = new AgentDialog({ apiKey: process.env.AGENTDIALOG_API_KEY! });

await generateText({
  model,
  tools: {
    ask_human: askHumanTool(client, { defaultEmail: "oncall@example.com" }),
    check_answer: checkAnswerTool(client),
  },
  prompt: "Check with the on-call engineer whether we can deploy.",
});
```

- [ ] **Step 9: Añadir el camino con SDK al quickstart**

En `docs-site/content/docs/quickstart.mdx`, junto al camino de cURL existente, añadir el equivalente con el SDK usando el mismo ejemplo del Step 8.

- [ ] **Step 10: Añadir la pestaña de TypeScript a la landing**

En `web/src/components/landing/CodeExamples.tsx`, añadir un objeto al array `tabs` antes del de Python:

```typescript
  {
    label: "TypeScript",
    language: "typescript",
    code: `import { AgentDialog } from "@agentdialog/sdk";

const client = new AgentDialog({ apiKey: "mge_ag_..." });

// Ask a human. They answer from their inbox.
const { queryId } = await client.createQuery({
  queryType: "validation",
  question: "Deploy v2.3 to production?",
  targetHumanEmail: "oncall@example.com",
});

const answer = await client.waitForAnswer(queryId);
console.log(answer.answer); // "yes, go ahead"`,
  },
```

- [ ] **Step 11: Documentar las rutas nuevas en la guía maestra**

En `docs/api/README.md`, añadir la sección de las tres rutas REST de queries, con el mismo nivel de detalle que el resto de la guía.

- [ ] **Step 12: Dejar de mantener la copia a mano**

Crear `scripts/sync-integration-guide.sh`:

```bash
#!/bin/bash
# Copy the API guide into the web app's public folder.
# docs/api/README.md is the source of truth; the public copy is generated.
set -euo pipefail

SRC="docs/api/README.md"
DEST="web/public/agentdialog-integration-guide.md"

cp "$SRC" "$DEST"
echo "Synced $SRC -> $DEST"
```

Run: `chmod +x scripts/sync-integration-guide.sh && ./scripts/sync-integration-guide.sh`

En `web/package.json`, encadenar el script al build para que la copia nunca se quede atrás:

```json
"build": "bash ../scripts/sync-integration-guide.sh && tsc -b && vite build"
```

Leer el `build` actual antes de sustituirlo y conservar sus pasos.

- [ ] **Step 13: Arreglar el README del SDK**

En `sdks/typescript/README.md`: sustituir `agentdialog.com` por `agentdialog.io`, `ad_ag_` por `mge_ag_`, y añadir al principio, bajo el título, el badge y la sección de queries y adaptadores:

```markdown
[![npm](https://img.shields.io/npm/v/@agentdialog/sdk)](https://www.npmjs.com/package/@agentdialog/sdk)
```

- [ ] **Step 14: Añadir la tabla de paquetes al README raíz**

En `README.md`, tras la sección de Features:

```markdown
## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@agentdialog/sdk`](https://www.npmjs.com/package/@agentdialog/sdk) | [![npm](https://img.shields.io/npm/v/@agentdialog/sdk)](https://www.npmjs.com/package/@agentdialog/sdk) | TypeScript SDK, with Vercel AI SDK and LangChain adapters |

```bash
npm install @agentdialog/sdk
```
```

El badge lee npm en vivo, así que no hay que tocar el README en cada release.

- [ ] **Step 15: Verificar que no queda rastro de los datos incorrectos**

Run: `grep -rn "agentdialog\.com\|agentdialog\.dev\|ad_ag_" --include="*.md" --include="*.mdx" --include="*.tsx" --include="*.ts" . | grep -v node_modules | grep -v "/dist/"`
Expected: sin resultados.

- [ ] **Step 16: Compilar la documentación y la web**

Run: `cd docs-site && npm run build && cd ../web && bun run build`
Expected: ambos compilan sin errores. Comprobar que las dos páginas nuevas aparecen en la salida de `docs-site`.

- [ ] **Step 17: Commit**

```bash
git add docs-site web/src web/package.json docs/api/README.md web/public/agentdialog-integration-guide.md sdks/typescript/README.md README.md scripts/sync-integration-guide.sh
git commit -m "Document human queries and the published SDK

The queries flow is what the landing page sells and it was documented
nowhere on docs.agentdialog.io. Adds the API reference and the concept
page, a TypeScript tab to the landing examples, and version badges.

The integration guide was two byte-identical copies maintained by hand;
the public one is now generated from docs/api/README.md at build time."
```

---

### Task 6: Workflow de publicación

**Files:**
- Create: `.github/workflows/publish-sdk.yml`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: el paquete construido de Task 4.
- Produces: `@agentdialog/sdk@0.1.0` en npm.

- [ ] **Step 1: Escribir el workflow**

Crear `.github/workflows/publish-sdk.yml`:

```yaml
name: Publish SDK to npm

on:
  push:
    tags:
      - "sdk-v*"

jobs:
  publish:
    name: Build & Publish
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          registry-url: "https://registry.npmjs.org"

      - name: Install root dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Test
        run: bun test tests/unit

      - name: Install SDK dependencies
        working-directory: sdks/typescript
        run: bun install --frozen-lockfile

      - name: Test SDK
        working-directory: sdks/typescript
        run: bun test

      - name: Build SDK
        working-directory: sdks/typescript
        run: bun run build

      - name: Publish
        working-directory: sdks/typescript
        run: npm publish --provenance --access public
```

Solo se corren los tests unitarios: los de integración necesitan Postgres y Redis, que este job no levanta. Los de integración ya se ejecutan en local antes del tag.

`npm publish` con `id-token: write` y sin `NODE_AUTH_TOKEN` usa Trusted Publishing: npm valida el token OIDC de GitHub contra el trusted publisher dado de alta en el paquete.

- [ ] **Step 2: Anotar la publicación en el changelog**

En `CHANGELOG.md`, dentro de `## [Unreleased]`, bajo `### Added`:

```markdown
- **`@agentdialog/sdk` en npm** — SDK de TypeScript publicado, con `createQuery`, `waitForAnswer` y adaptadores para Vercel AI SDK (`@agentdialog/sdk/ai`) y LangChain (`@agentdialog/sdk/langchain`).
- **API REST de human queries** — `POST /api/v1/agent/queries`, `GET /api/v1/agent/queries/{id}` y `GET /api/v1/agent/queries`. Hasta ahora las queries solo eran accesibles por MCP.
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-sdk.yml CHANGELOG.md
git commit -m "Add npm publishing workflow for the SDK

Trusted Publishing over OIDC, so there is no long-lived NPM_TOKEN in the
repository secrets. Publishing emits provenance, which npm shows on the
package page."
```

- [ ] **Step 4: Desplegar el backend antes de publicar**

El SDK no sirve de nada hasta que las rutas de Task 1 estén vivas.

Run: `GCP_PROJECT_ID=agentdialog ./scripts/deploy.sh`

Verificar después:

Run: `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer mge_ag_..." https://api.agentdialog.io/api/v1/agent/queries`
Expected: `200`. Un `404` significa que el despliegue no llevó las rutas nuevas.

- [ ] **Step 5: Primera publicación**

La primera publicación no puede usar Trusted Publishing, porque el formulario para dar de alta el trusted publisher solo existe sobre un paquete ya publicado. Esta primera vez es manual, desde la cuenta `agentdialog`:

```bash
cd sdks/typescript
npm login          # cuenta agentdialog
bun run build
npm publish --access public
```

- [ ] **Step 6: Dar de alta el trusted publisher**

En npmjs.com → `@agentdialog/sdk` → Settings → Trusted Publisher, con:
- Repositorio: `horelvis/agentDialog`
- Workflow: `publish-sdk.yml`

A partir de aquí las publicaciones salen del tag, sin token.

- [ ] **Step 7: Verificar el paquete publicado**

```bash
cd $(mktemp -d)
npm init -y
npm install @agentdialog/sdk
node --input-type=module -e "import { AgentDialog } from '@agentdialog/sdk'; console.log(typeof AgentDialog);"
```

Expected: `function`.

- [ ] **Step 8: Etiquetar**

```bash
git tag sdk-v0.1.0
git push origin sdk-v0.1.0
```

Este tag no dispara nada en la primera vuelta, porque la publicación ya se hizo a mano. Sirve para marcar el punto y para que el siguiente `sdk-v0.1.1` tenga un predecesor.
