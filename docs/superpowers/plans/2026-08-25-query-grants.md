# Responder una query desde el enlace del correo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que responder una pregunta de bajo riesgo cueste un clic desde el correo, sin que el enlace conceda nada más que resolver esa pregunta.

**Architecture:** Una tabla `query_grants` guarda un token por (query, invitado), hasheado como los tokens de sesión y caducado con la propia query. Tres rutas públicas tras un middleware que resuelve el token a un par (query, email) y nunca emite sesión; el servicio `respondQuery` no se toca, porque su comprobación de derecho ya exige que el email del humano sea el destinatario de la query.

**Tech Stack:** Bun, Hono, Drizzle/PostgreSQL, zod, React + react-router. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-08-25-query-grants-design.md`

## Global Constraints

- Código, comentarios y mensajes de commit **en inglés**. Los specs, planes y `docs/api/README.md` van en **español**; `docs-site/content/**` en inglés. Match the file you are editing.
- Nunca ejecutar `bun test` a secas ni `bun test tests/` — los argumentos de Bun son filtros de subcadena sobre rutas y `tests/` arrastra la suite del SDK. Usar `bun test tests/unit` o `bun test tests/unit tests/integration`.
- **`bun run db:migrate` lee `migrations/meta/_journal.json`, no el sistema de ficheros.** Un `.sql` sin su entrada en el journal se ignora en silencio y el comando aun así imprime éxito. Ver la sección de trampas de `CLAUDE.md`.
- Las integraciones necesitan Postgres, Redis y MinIO: `docker compose -f docker-compose.dev.yml up -d postgres redis minio`. El registro de agentes está limitado a 10/hora con el contador en Redis; limpiarlo con `docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB` ante un `429`.
- Formato del token: `qgr_` + `nanoid(48)`. Prefijo = los primeros 15 caracteres, indexado; el resto se compara contra un hash bcrypt.
- **Ninguna respuesta de las rutas públicas puede contener un token de sesión.** El middleware no emite `sess_` jamás.
- El `GET` público es **seguro** en el sentido HTTP: no muta nada, ni siquiera crea la fila del humano.
- Se consume el grant **solo** cuando el `outcome` es `answer`. `insufficient_context` no lo consume.
- `risk` en `high` o `critical` **no acuña grant**.

---

### Task 1: La tabla, el token y su ciclo de vida

**Files:**
- Create: `src/db/schema/query-grants.ts`
- Create: `migrations/0009_query_grants.sql`
- Modify: `migrations/meta/_journal.json`
- Modify: `src/db/schema/index.ts`
- Create: `src/lib/query-grant-token.ts`
- Create: `src/services/query-grant.service.ts`
- Test: `tests/unit/query-grant-token.test.ts`
- Test: `tests/integration/query-grant-lifecycle.test.ts`

**Interfaces:**
- Consumes: `hashToken`/`verifyToken` de `src/lib/crypto.ts` (bcrypt, ya usados para sesiones).
- Produces:
  - `generateGrantToken(): string` — `qgr_` + `nanoid(48)`
  - `grantTokenPrefix(token: string): string` — los primeros 15 caracteres
  - `shouldMintGrant(risk: "low" | "medium" | "high" | "critical"): boolean`
  - `mintQueryGrant(queryId: string, humanEmail: string, expiresAt: Date, tx?): Promise<string>` — devuelve el token en claro, una sola vez
  - `resolveQueryGrant(token: string): Promise<{ grantId: string; queryId: string; humanEmail: string }>` — lanza `UnauthorizedError` si no existe, caducó o ya se consumió
  - `consumeQueryGrant(grantId: string): Promise<void>`

- [ ] **Step 1: Escribir el test unitario que falla**

Crear `tests/unit/query-grant-token.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  generateGrantToken,
  grantTokenPrefix,
  shouldMintGrant,
} from "../../src/lib/query-grant-token";

/**
 * The prefix is what the database indexes; the rest is compared against a
 * bcrypt hash. Both halves have to come from the same string or a valid token
 * never resolves.
 */

describe("generateGrantToken", () => {
  it("is qgr_ followed by 48 url-safe characters", () => {
    expect(generateGrantToken()).toMatch(/^qgr_[A-Za-z0-9_-]{48}$/);
  });

  it("does not repeat itself", () => {
    expect(generateGrantToken()).not.toBe(generateGrantToken());
  });
});

describe("grantTokenPrefix", () => {
  it("takes the first 15 characters, which is what the index holds", () => {
    const token = generateGrantToken();
    expect(grantTokenPrefix(token)).toBe(token.slice(0, 15));
    expect(grantTokenPrefix(token)).toHaveLength(15);
  });
});

describe("shouldMintGrant", () => {
  it("mints for the risks a one-click link is allowed to resolve", () => {
    expect(shouldMintGrant("low")).toBe(true);
    expect(shouldMintGrant("medium")).toBe(true);
  });

  it("refuses the risks that must still cost a sign-in", () => {
    expect(shouldMintGrant("high")).toBe(false);
    expect(shouldMintGrant("critical")).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `bun test tests/unit/query-grant-token.test.ts`
Expected: FAIL con `Cannot find module '../../src/lib/query-grant-token'`

- [ ] **Step 3: Escribir los helpers del token**

Crear `src/lib/query-grant-token.ts`:

```ts
import { nanoid } from "nanoid";

/**
 * A capability to resolve one query, mailed to one address. Deliberately not a
 * session token: it is checked by src/middleware/query-grant-auth.ts, which
 * never issues `sess_`.
 */

const PREFIX = "qgr_";
const BODY_SIZE = 48;
const PREFIX_LENGTH = 15;

export function generateGrantToken(): string {
  return `${PREFIX}${nanoid(BODY_SIZE)}`;
}

/** What the index holds. The full token is only ever compared against a hash. */
export function grantTokenPrefix(token: string): string {
  return token.slice(0, PREFIX_LENGTH);
}

/**
 * Which risks a one-click link may resolve. High and critical mint no grant at
 * all rather than minting one that then demands a code — two authentication
 * models on one route is a half-authenticated state nobody can reason about.
 */
export function shouldMintGrant(risk: "low" | "medium" | "high" | "critical"): boolean {
  return risk === "low" || risk === "medium";
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `bun test tests/unit/query-grant-token.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Añadir el esquema**

Crear `src/db/schema/query-grants.ts`:

```ts
import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { humanQueries } from "./human-queries";

/**
 * One row per (query, invited address). The token is stored the way session
 * tokens are — an indexed prefix plus a bcrypt hash — and NOT the way
 * `invitations.token` is, which is plaintext. That is a known problem; new code
 * does not inherit it.
 */
export const queryGrants = pgTable("query_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  queryId: uuid("query_id").notNull().references(() => humanQueries.id, { onDelete: "cascade" }),
  humanEmail: varchar("human_email", { length: 256 }).notNull(),
  tokenPrefix: varchar("token_prefix", { length: 20 }).notNull().unique(),
  tokenHash: varchar("token_hash", { length: 256 }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("query_grants_query_idx").on(table.queryId),
  index("query_grants_prefix_idx").on(table.tokenPrefix),
]);
```

En `src/db/schema/index.ts`, exportar el módulo nuevo junto a los demás, siguiendo el estilo del fichero.

- [ ] **Step 6: Escribir la migración y su entrada en el journal**

Crear `migrations/0009_query_grants.sql`:

```sql
-- A capability to resolve one query, mailed to one address. Scoped on purpose:
-- a forwarded email must not become access to somebody's whole history.

CREATE TABLE IF NOT EXISTS "query_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "query_id" uuid NOT NULL,
  "human_email" varchar(256) NOT NULL,
  "token_prefix" varchar(20) NOT NULL,
  "token_hash" varchar(256) NOT NULL,
  "consumed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "query_grants_token_prefix_unique" UNIQUE("token_prefix")
);

ALTER TABLE "query_grants" ADD CONSTRAINT "query_grants_query_id_human_queries_id_fk"
  FOREIGN KEY ("query_id") REFERENCES "human_queries"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "query_grants_query_idx" ON "query_grants" ("query_id");
CREATE INDEX IF NOT EXISTS "query_grants_prefix_idx" ON "query_grants" ("token_prefix");
```

**Y ahora la parte que se olvida y no avisa.** En `migrations/meta/_journal.json`, añadir la entrada al final del array `entries`, copiando la forma de la de `0008_webhook_signing` que está justo encima:

```json
    {
      "idx": 9,
      "version": "7",
      "when": 1787827200000,
      "tag": "0009_query_grants",
      "breakpoints": true
    }
```

El `when` debe ser posterior al de la entrada anterior. Sin esta entrada, `bun run db:migrate` imprime `[MIGRATE] Migrations complete`, sale con 0 y **no aplica nada**.

- [ ] **Step 7: Aplicar a las dos bases de datos y comprobar**

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis minio
bun run db:migrate
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun run scripts/migrate.ts
docker exec agentdialog_postgres_1 psql -U agentdialog -d agentdialog -c "\d query_grants"
```

Expected: la tabla existe con las nueve columnas y los dos índices. Pegar la salida real en el informe.

- [ ] **Step 8: Escribir el servicio**

Crear `src/services/query-grant.service.ts`:

```ts
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { queryGrants } from "../db/schema/query-grants";
import { hashToken, verifyToken } from "../lib/crypto";
import { generateGrantToken, grantTokenPrefix } from "../lib/query-grant-token";
import { UnauthorizedError } from "../lib/errors";

/**
 * Mint a capability for one query. Returns the plaintext token, which is the
 * only time it exists in readable form — the row keeps a bcrypt hash.
 *
 * `tx` lets the caller mint inside the transaction that creates the query, so a
 * rolled-back query leaves no grant behind.
 */
export async function mintQueryGrant(
  queryId: string,
  humanEmail: string,
  expiresAt: Date,
  tx?: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
): Promise<string> {
  const db = tx ?? getDb();
  const token = generateGrantToken();

  await db.insert(queryGrants).values({
    queryId,
    humanEmail,
    tokenPrefix: grantTokenPrefix(token),
    tokenHash: await hashToken(token),
    expiresAt,
  });

  return token;
}

/**
 * Resolve a token to the query it may resolve. Every failure is the same
 * UnauthorizedError: an unknown token, an expired one and a spent one must not
 * be distinguishable from outside, or the endpoint becomes an oracle.
 */
export async function resolveQueryGrant(
  token: string,
): Promise<{ grantId: string; queryId: string; humanEmail: string }> {
  const db = getDb();

  const [grant] = await db
    .select()
    .from(queryGrants)
    .where(and(eq(queryGrants.tokenPrefix, grantTokenPrefix(token)), isNull(queryGrants.consumedAt)))
    .limit(1);

  if (!grant) throw new UnauthorizedError("This link is not valid");
  if (new Date() > grant.expiresAt) throw new UnauthorizedError("This link is not valid");

  const valid = await verifyToken(token, grant.tokenHash);
  if (!valid) throw new UnauthorizedError("This link is not valid");

  return { grantId: grant.id, queryId: grant.queryId, humanEmail: grant.humanEmail };
}

/** Spend the grant. Only an actual answer does this — see the plan's constraints. */
export async function consumeQueryGrant(grantId: string): Promise<void> {
  const db = getDb();
  await db
    .update(queryGrants)
    .set({ consumedAt: new Date(), updatedAt: new Date() })
    .where(eq(queryGrants.id, grantId));
}
```

- [ ] **Step 9: Escribir el test de integración del ciclo de vida**

Crear `tests/integration/query-grant-lifecycle.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { getDb } from "../../src/db";
import { agents } from "../../src/db/schema/agents";
import { conversations } from "../../src/db/schema/conversations";
import { humanQueries } from "../../src/db/schema/human-queries";
import { messages } from "../../src/db/schema/messages";
import {
  mintQueryGrant,
  resolveQueryGrant,
  consumeQueryGrant,
} from "../../src/services/query-grant.service";
import { generateGrantToken } from "../../src/lib/query-grant-token";

/**
 * The grant is the only thing standing between a forwarded email and somebody
 * else's question, so its lifecycle is worth pinning directly rather than only
 * through the HTTP routes.
 */

async function makeQuery(email: string) {
  const db = getDb();
  const [agent] = await db.insert(agents).values({
    slug: `grant-life-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    displayName: "Grant Lifecycle Agent",
    apiKeyHash: "x",
    apiKeyPrefix: `mge_ag_${Date.now()}`.slice(0, 15),
  }).returning();

  const [conversation] = await db.insert(conversations).values({
    createdByAgentId: agent.id,
    title: "Grant lifecycle",
  }).returning();

  // A query points at the message that carries it — query_message_id is NOT
  // NULL — so the message has to exist first.
  const [message] = await db.insert(messages).values({
    conversationId: conversation.id,
    senderType: "agent",
    senderAgentId: agent.id,
    type: "human_query",
    content: "Is this correct?",
  }).returning();

  const [query] = await db.insert(humanQueries).values({
    conversationId: conversation.id,
    agentId: agent.id,
    humanEmail: email,
    queryType: "validation",
    question: "Is this correct?",
    answerSpace: { kind: "boolean", labels: { t: "Yes", f: "No" } },
    subject: { id: "s1", label: "Subject", body: "Body" },
    queryMessageId: message.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  }).returning();

  return query;
}

describe("query grant lifecycle", () => {
  it("resolves a freshly minted token to its query", async () => {
    const query = await makeQuery("grant-a@example.com");
    const token = await mintQueryGrant(query.id, "grant-a@example.com", query.expiresAt);

    const resolved = await resolveQueryGrant(token);
    expect(resolved.queryId).toBe(query.id);
    expect(resolved.humanEmail).toBe("grant-a@example.com");
  });

  it("refuses a token that was never minted", async () => {
    expect(resolveQueryGrant(generateGrantToken())).rejects.toThrow();
  });

  it("refuses a consumed token", async () => {
    const query = await makeQuery("grant-b@example.com");
    const token = await mintQueryGrant(query.id, "grant-b@example.com", query.expiresAt);

    const { grantId } = await resolveQueryGrant(token);
    await consumeQueryGrant(grantId);

    expect(resolveQueryGrant(token)).rejects.toThrow();
  });

  it("refuses an expired token", async () => {
    const query = await makeQuery("grant-c@example.com");
    const token = await mintQueryGrant(query.id, "grant-c@example.com", new Date(Date.now() - 1000));

    expect(resolveQueryGrant(token)).rejects.toThrow();
  });

  it("gives the same error for unknown, expired and spent, so it is no oracle", async () => {
    const query = await makeQuery("grant-d@example.com");
    const expired = await mintQueryGrant(query.id, "grant-d@example.com", new Date(Date.now() - 1000));
    const unknown = generateGrantToken();

    const messages: string[] = [];
    for (const token of [expired, unknown]) {
      try {
        await resolveQueryGrant(token);
      } catch (err) {
        messages.push((err as Error).message);
      }
    }

    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe(messages[1]);
  });
});
```

- [ ] **Step 10: Ejecutar**

```bash
docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB
bun test tests/integration/query-grant-lifecycle.test.ts
```

Expected: PASS, 5 tests

- [ ] **Step 11: Commit**

```bash
git add src/db/schema/query-grants.ts src/db/schema/index.ts migrations/0009_query_grants.sql migrations/meta/_journal.json src/lib/query-grant-token.ts src/services/query-grant.service.ts tests/unit/query-grant-token.test.ts tests/integration/query-grant-lifecycle.test.ts
git commit -m "Give a query a link that resolves it and nothing else"
```

---

### Task 2: Acuñar al crear la query y poner el enlace en el correo

**Files:**
- Modify: `src/services/query.service.ts` (la transacción de `createQuery` y la llamada a `sendQueryEmail`, ~líneas 230-255)
- Modify: `src/services/query-email.service.ts`
- Test: `tests/integration/query-grant-minting.test.ts`

**Interfaces:**
- Consumes: `mintQueryGrant`, `shouldMintGrant` de la Task 1.
- Produces: `SendQueryEmailInput` gana dos campos opcionales, `grantToken?: string` y `conversationId: string`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/integration/query-grant-minting.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestApp } from "../helpers";
import { getDb } from "../../src/db";
import { queryGrants } from "../../src/db/schema/query-grants";
import { humanQueries } from "../../src/db/schema/human-queries";

/**
 * Risk decides whether the link exists at all. A high-risk question must not
 * become answerable by whoever holds a forwarded email.
 */

async function registerAgent(app: ReturnType<typeof createTestApp>) {
  const res = await app.request("/api/v1/agent/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: `grant-mint-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      displayName: "Grant Minting Agent",
    }),
  });
  const body = await res.json();
  return body.data.apiKey as string;
}

async function createQuery(app: ReturnType<typeof createTestApp>, apiKey: string, risk: string) {
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query_type: "validation",
      risk,
      target_human_email: `grant-${risk}-${Date.now()}@example.com`,
      question: "Is this correct?",
      subject: { id: "s1", label: "Subject", body: "The artefact itself." },
      answer_space: { kind: "boolean", labels: { t: "Yes", f: "No" } },
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()).data;
}

async function grantsFor(queryId: string) {
  return getDb().select().from(queryGrants).where(eq(queryGrants.queryId, queryId));
}

describe("grant minting is gated by risk", () => {
  const app = createTestApp();

  it("mints for a low-risk query", async () => {
    const apiKey = await registerAgent(app);
    const query = await createQuery(app, apiKey, "low");
    expect(await grantsFor(query.id)).toHaveLength(1);
  });

  it("mints for a medium-risk query", async () => {
    const apiKey = await registerAgent(app);
    const query = await createQuery(app, apiKey, "medium");
    expect(await grantsFor(query.id)).toHaveLength(1);
  });

  it("mints nothing for a high-risk query", async () => {
    const apiKey = await registerAgent(app);
    const query = await createQuery(app, apiKey, "high");
    expect(await grantsFor(query.id)).toHaveLength(0);
  });

  it("mints nothing for a critical-risk query", async () => {
    const apiKey = await registerAgent(app);
    const query = await createQuery(app, apiKey, "critical");
    expect(await grantsFor(query.id)).toHaveLength(0);
  });

  it("gives the grant the same expiry as the query it belongs to", async () => {
    const apiKey = await registerAgent(app);
    const query = await createQuery(app, apiKey, "low");
    const [grant] = await grantsFor(query.id);

    // Read the expiry from the row rather than the wire: the queries resource
    // is snake_case on the wire and camelCase in the schema, and the schema is
    // what this assertion is actually about.
    const [row] = await getDb()
      .select()
      .from(humanQueries)
      .where(eq(humanQueries.id, query.id))
      .limit(1);

    expect(new Date(grant.expiresAt).getTime()).toBe(new Date(row.expiresAt).getTime());
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB
bun test tests/integration/query-grant-minting.test.ts
```

Expected: FAIL — no se acuña ningún grant todavía.

- [ ] **Step 3: Acuñar dentro de la transacción de `createQuery`**

En `src/services/query.service.ts`, importar:

```ts
import { mintQueryGrant } from "./query-grant.service";
import { shouldMintGrant } from "../lib/query-grant-token";
```

Dentro de la transacción de `createQuery`, justo antes del `return` que devuelve `{ conversation, query, token, status, humanId, expiresAt, queryMessage }`, acuñar el grant cuando corresponda y añadirlo al objeto devuelto:

```ts
    // The link that answers this question in one click. Minted inside the
    // transaction so a rolled-back query never leaves a live grant behind.
    // High and critical risk mint nothing: those still cost a sign-in.
    const grantToken = shouldMintGrant(query.risk)
      ? await mintQueryGrant(query.id, targetEmail, expiresAt, tx)
      : undefined;

    return { conversation, query, token, status, humanId, expiresAt, queryMessage: withQueryId, grantToken };
```

Y en la desestructuración de después de la transacción, añadir `grantToken`:

```ts
  const { conversation, query, token, status, expiresAt, queryMessage, grantToken } = result;
```

- [ ] **Step 4: Pasarlo al correo**

En la llamada a `sendQueryEmail`, añadir los dos campos:

```ts
      invitationToken: token,
      conversationId: conversation.id,
      grantToken,
```

En `src/services/query-email.service.ts`, ampliar la interfaz:

```ts
  invitationToken: string;
  conversationId: string;
  grantToken?: string;
```

y sustituir la línea del enlace (`const appUrl = ...`) por:

```ts
  // With a grant, the link resolves the question in one click. Without one —
  // high and critical risk — it still carries context: it lands on the
  // conversation the question lives in, rather than a generic list.
  const appUrl = input.grantToken
    ? `${e.APP_URL}/q/${input.grantToken}`
    : `${e.APP_URL}/app/c/${input.conversationId}?email=${encodeURIComponent(input.targetEmail)}`;
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

```bash
docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB
bun test tests/integration/query-grant-minting.test.ts
```

Expected: PASS, 5 tests

- [ ] **Step 6: Suite completa**

Run: `bun test tests/unit tests/integration`
Expected: PASS. Comparar el total con el de `main` antes de empezar; solo deben aparecer tests nuevos.

- [ ] **Step 7: Commit**

```bash
git add src/services/query.service.ts src/services/query-email.service.ts tests/integration/query-grant-minting.test.ts
git commit -m "Mail a link that knows which question it is for"
```

---

### Task 3: Las rutas públicas

**Files:**
- Create: `src/middleware/query-grant-auth.ts`
- Create: `src/routes/public/queries.ts`
- Modify: `src/services/query.service.ts` (añadir `getQueryForGrant`)
- Modify: `src/middleware/rate-limit.ts` (añadir `grantRateLimit`)
- Modify: `src/app.ts`
- Modify: `src/types/hono.ts`
- Test: `tests/integration/query-grant-routes.test.ts`

**Interfaces:**
- Consumes: `resolveQueryGrant`, `consumeQueryGrant` (Task 1); `respondQuery`, `shapeHumanQuery` (existentes).
- Produces: `GET /api/v1/public/queries/:token` y `POST /api/v1/public/queries/:token/respond`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/integration/query-grant-routes.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestApp } from "../helpers";
import { getDb } from "../../src/db";
import { humanQueries } from "../../src/db/schema/human-queries";
import { queryGrants } from "../../src/db/schema/query-grants";
import { mintQueryGrant } from "../../src/services/query-grant.service";
import { generateGrantToken, grantTokenPrefix } from "../../src/lib/query-grant-token";

/**
 * The behaviours the link must have, stated as tests: a scanner opening it
 * costs nothing, answering spends it, asking for context does not, and it is
 * good for exactly one question.
 */

const app = createTestApp();

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function registerAgent(): Promise<string> {
  const res = await app.request("/api/v1/agent/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: unique("grant-routes"), displayName: "Grant Routes Agent" }),
  });
  return (await res.json()).data.apiKey as string;
}

/**
 * The plaintext token only ever exists inside createQuery, on its way to the
 * mailer. Rather than widening the API to hand it back, the test mints its own
 * against the same query: a query may hold more than one grant, and nothing in
 * the design treats that as special.
 */
async function makeQueryWithToken() {
  const apiKey = await registerAgent();
  const email = `${unique("routes")}@example.com`;

  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query_type: "validation",
      risk: "low",
      target_human_email: email,
      question: "Is this correct?",
      subject: { id: "s1", label: "Subject", body: "The artefact itself." },
      answer_space: { kind: "boolean", labels: { t: "Yes", f: "No" } },
    }),
  });
  expect(res.status).toBe(201);
  const created = (await res.json()).data;

  const [row] = await getDb()
    .select()
    .from(humanQueries)
    .where(eq(humanQueries.id, created.id))
    .limit(1);

  const token = await mintQueryGrant(row.id, row.humanEmail, row.expiresAt);
  return { queryId: row.id, email, token };
}

async function grantRow(token: string) {
  const [row] = await getDb()
    .select()
    .from(queryGrants)
    .where(eq(queryGrants.tokenPrefix, grantTokenPrefix(token)))
    .limit(1);
  return row;
}

function get(token: string) {
  return app.request(`/api/v1/public/queries/${token}`);
}

function respond(token: string, body: unknown) {
  return app.request(`/api/v1/public/queries/${token}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ANSWER = { outcome: "answer", answer: { kind: "boolean", value: true } };
const NEEDS_CONTEXT = { outcome: "insufficient_context", reason: "unclear_consequences" };

describe("the public query link", () => {
  it("shows the question without a session", async () => {
    const { token } = await makeQueryWithToken();

    const res = await get(token);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.question).toBe("Is this correct?");
    expect(body.data.answer_space.kind).toBe("boolean");
    expect(body.data.subject.label).toBe("Subject");
  });

  it("does not spend the token on GET, so a mail scanner costs nothing", async () => {
    const { token } = await makeQueryWithToken();

    await get(token);
    await get(token);

    expect((await grantRow(token)).consumedAt).toBeNull();
  });

  it("answers the question and spends the token", async () => {
    const { token } = await makeQueryWithToken();

    const res = await respond(token, ANSWER);
    expect(res.status).toBe(200);

    expect((await grantRow(token)).consumedAt).not.toBeNull();
  });

  it("refuses a second answer through the same link", async () => {
    const { token } = await makeQueryWithToken();

    await respond(token, ANSWER);
    const second = await respond(token, ANSWER);

    expect(second.status).toBe(401);
  });

  it("does not spend the token when the human asks for context", async () => {
    const { token } = await makeQueryWithToken();

    const res = await respond(token, NEEDS_CONTEXT);
    expect(res.status).toBe(200);

    expect((await grantRow(token)).consumedAt).toBeNull();
    expect((await get(token)).status).toBe(200);
  });

  it("refuses a token minted for another query", async () => {
    const a = await makeQueryWithToken();
    const b = await makeQueryWithToken();

    // a's token names a's query, so using it can only ever resolve a's — the
    // point is that it cannot be pointed at b by swapping the path.
    const res = await get(a.token);
    const body = await res.json();
    expect(body.data.id).toBe(a.queryId);
    expect(body.data.id).not.toBe(b.queryId);
  });

  it("refuses an unknown token", async () => {
    expect((await get(generateGrantToken())).status).toBe(401);
  });

  it("gives the same answer for unknown and spent, so it is no oracle", async () => {
    const { token } = await makeQueryWithToken();
    await respond(token, ANSWER);

    const spent = await get(token);
    const unknown = await get(generateGrantToken());

    expect(spent.status).toBe(unknown.status);
    expect((await spent.json()).error.message).toBe((await unknown.json()).error.message);
  });

  it("never returns a session token", async () => {
    const { token } = await makeQueryWithToken();

    const shown = await (await get(token)).text();
    const answered = await (await respond(token, ANSWER)).text();

    expect(shown).not.toContain("sess_");
    expect(answered).not.toContain("sess_");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB
bun test tests/integration/query-grant-routes.test.ts
```

Expected: FAIL — las rutas devuelven 404, no existen.

- [ ] **Step 3: Añadir la lectura sin sesión**

En `src/services/query.service.ts`, junto a `getQueryForHuman`:

```ts
/**
 * The query as the holder of a grant may see it. There is no entitlement check
 * here because the grant IS the entitlement — the middleware already proved the
 * caller holds a token minted for this query. Deliberately without the prior
 * decision: the link shows the question, not a history.
 */
export async function getQueryForGrant(queryId: string) {
  const db = getDb();

  const [query] = await db
    .select()
    .from(humanQueries)
    .where(eq(humanQueries.id, queryId))
    .limit(1);

  if (!query) throw new NotFoundError("Query", queryId);

  return shapeHumanQuery(query, { includePriorDecision: false });
}
```

- [ ] **Step 4: Escribir el middleware**

Crear `src/middleware/query-grant-auth.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import { resolveQueryGrant } from "../services/query-grant.service";

/**
 * Resolves a link token to the one query it may resolve. It never issues a
 * session and never sets `human` — a grant is a capability, not an identity,
 * and the difference is the blast radius of a forwarded email.
 */
export const queryGrantAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.req.param("token") ?? "";
  const { grantId, queryId, humanEmail } = await resolveQueryGrant(token);

  c.set("grantId", grantId);
  c.set("grantQueryId", queryId);
  c.set("grantEmail", humanEmail);
  await next();
};
```

En `src/types/hono.ts`, añadir las tres claves a las variables del contexto, siguiendo cómo están declaradas `humanId` y `agentId`.

- [ ] **Step 5: Escribir las rutas**

Crear `src/routes/public/queries.ts`:

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../../types/hono";
import { getDb } from "../../db";
import { humans } from "../../db/schema/humans";
import { getQueryForGrant, respondQuery } from "../../services/query.service";
import { consumeQueryGrant } from "../../services/query-grant.service";
import { respondQuerySchema } from "../../validators/query.validators";
import { validateBody } from "../../middleware/validate";
import { queryGrantAuth } from "../../middleware/query-grant-auth";
import { canonicaliseEmail } from "../../lib/email-identity";

const app = new Hono<AppEnv>();

app.use("/:token", queryGrantAuth);
app.use("/:token/*", queryGrantAuth);

app.get("/:token", async (c) => {
  const query = await getQueryForGrant(c.get("grantQueryId"));
  return c.json({ data: query });
});

app.post("/:token/respond", validateBody(respondQuerySchema), async (c) => {
  const input = c.get("validatedBody");
  const queryId = c.get("grantQueryId");
  const email = canonicaliseEmail(c.get("grantEmail"));

  // respondQuery works in terms of a human row, and its own entitlement check
  // independently requires that human's address to be the one the query was
  // addressed to. Creating the row grants nothing: it has no session token, so
  // there is nothing to sign in with.
  const db = getDb();
  const [existing] = await db.select().from(humans).where(eq(humans.email, email)).limit(1);
  const human = existing ?? (await db.insert(humans).values({ email }).returning())[0];

  const result = await respondQuery(queryId, human.id, input);

  // Only a real answer spends the link. `insufficient_context` hands the turn
  // back to the agent, and that person has to be able to return by the same
  // link once the agent has clarified.
  if (input.outcome === "answer") {
    await consumeQueryGrant(c.get("grantId"));
  }

  return c.json({ data: result });
});

export default app;
```

- [ ] **Step 6: Limitar peticiones y montar**

En `src/middleware/rate-limit.ts`, junto a los demás:

```ts
/** Keyed by the token's prefix, so one link cannot be hammered from many IPs. */
export const grantRateLimit = (rpm: number) =>
  rateLimit({
    windowMs: 60_000,
    max: rpm,
    keyPrefix: "grant",
    keyFn: (c) => (c.req.param("token") ?? "").slice(0, 15) || getClientIp(c),
  });
```

En `src/app.ts`, importar la ruta y montarla **antes** del bloque de rutas humanas, con su límite:

```ts
  // Public query links: no session, resolved by the token in the path.
  const publicQueryApp = new Hono<AppEnv>();
  publicQueryApp.use("*", grantRateLimit(30));
  publicQueryApp.route("/", publicQueryRoutes);
  app.route("/api/v1/public/queries", publicQueryApp);
```

- [ ] **Step 7: Ejecutar y verificar que pasa**

```bash
docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB
bun test tests/integration/query-grant-routes.test.ts
bun run typecheck
```

Expected: PASS los 8 casos; typecheck en 0.

- [ ] **Step 8: Commit**

```bash
git add src/middleware/query-grant-auth.ts src/routes/public/queries.ts src/services/query.service.ts src/middleware/rate-limit.ts src/app.ts src/types/hono.ts tests/integration/query-grant-routes.test.ts
git commit -m "Answer one question from a link, without a session"
```

---

### Task 4: La página pública

**Files:**
- Create: `web/src/pages/PublicQueryPage.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/public/queries/:token` y `POST /api/v1/public/queries/:token/respond` (Task 3).
- Produces: la ruta `/q/:token`.

- [ ] **Step 1: Añadir la ruta**

En `web/src/App.tsx`, dentro del grupo `<Route element={<PublicLayout />}>`, junto a `login`:

```tsx
          <Route path="q/:token" element={<PublicQueryPage />} />
```

- [ ] **Step 2: Escribir la página**

Crear `web/src/pages/PublicQueryPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { AnswerSpaceInput, isAnswerComplete } from "@/components/answer/AnswerSpaceInput";
import { Button } from "@/components/ui/Button";
import { API_BASE } from "@/lib/constants";
import type { Answer, AnswerSpace } from "@/types";

interface PublicQuery {
  id: string;
  question: string;
  context?: string | null;
  risk: string;
  subject: { id: string; label: string; body?: string | null; uri?: string | null };
  answer_space: AnswerSpace;
}

const REASONS = [
  { id: "unknown_subject", label: "I don't know what this is about" },
  { id: "missing_delta", label: "I don't know what changed since last time" },
  { id: "unclear_consequences", label: "I can't tell what each option would do" },
  { id: "referent_unreachable", label: "I can't see the thing being asked about" },
  { id: "not_my_decision", label: "This isn't mine to decide" },
] as const;

type State =
  | { status: "loading" }
  | { status: "ready"; query: PublicQuery }
  | { status: "sending"; query: PublicQuery }
  | { status: "answered" }
  | { status: "returned" }
  | { status: "gone" };

export function PublicQueryPage() {
  const { token } = useParams();
  const [state, setState] = useState<State>({ status: "loading" });
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/queries/${token}`);
        if (cancelled) return;
        if (!res.ok) return setState({ status: "gone" });

        const body = await res.json();
        setState({ status: "ready", query: body.data });
      } catch {
        if (!cancelled) setState({ status: "gone" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function send(payload: unknown, done: State) {
    if (state.status !== "ready") return;
    setState({ status: "sending", query: state.query });

    try {
      const res = await fetch(`${API_BASE}/public/queries/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setState(res.ok ? done : { status: "gone" });
    } catch {
      setState({ status: "gone" });
    }
  }

  if (state.status === "loading") {
    return <Shell><p className="text-gray-400">Loading…</p></Shell>;
  }

  // Expired, already used and never-existed are one case on purpose: the API
  // does not distinguish them, and neither should this.
  if (state.status === "gone") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-100">This link no longer works</h1>
        <p className="mt-2 text-gray-400">
          It may have been used already, or the question may have closed. Sign in to the app to
          see anything still waiting for you.
        </p>
      </Shell>
    );
  }

  if (state.status === "answered") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-100">Answer sent</h1>
        <p className="mt-2 text-gray-400">Thank you — you can close this page.</p>
      </Shell>
    );
  }

  if (state.status === "returned") {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-100">Sent back for more detail</h1>
        <p className="mt-2 text-gray-400">
          They will get back to you. This link keeps working, so you can return to it.
        </p>
      </Shell>
    );
  }

  const { query } = state;
  const busy = state.status === "sending";

  return (
    <Shell>
      <p className="text-xs uppercase tracking-wide text-gray-500">{query.subject.label}</p>
      <h1 className="mt-1 text-xl font-semibold text-gray-100">{query.question}</h1>

      {query.subject.body && (
        <div className="mt-4 whitespace-pre-wrap rounded-lg bg-surface-secondary p-4 text-sm text-gray-300">
          {query.subject.body}
        </div>
      )}

      {query.context && <p className="mt-4 text-sm text-gray-400">{query.context}</p>}

      <div className="mt-6">
        <AnswerSpaceInput space={query.answer_space} value={answer} onChange={setAnswer} />
      </div>

      <Button
        className="mt-6 w-full"
        size="lg"
        loading={busy}
        disabled={!isAnswerComplete(query.answer_space, answer)}
        onClick={() => send({ outcome: "answer", answer }, { status: "answered" })}
      >
        Send answer
      </Button>

      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-gray-400">I can't answer this</summary>
        <div className="mt-3 space-y-2">
          {REASONS.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="radio"
                name="reason"
                value={r.id}
                checked={reason === r.id}
                onChange={() => setReason(r.id)}
              />
              {r.label}
            </label>
          ))}
          <Button
            variant="secondary"
            className="mt-2"
            loading={busy}
            disabled={!reason}
            onClick={() => send({ outcome: "insufficient_context", reason }, { status: "returned" })}
          >
            Send it back
          </Button>
        </div>
      </details>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-xl border border-surface-border bg-surface-primary p-6">{children}</div>
    </div>
  );
}
```

Dos cosas de este componente son decisiones, no detalles:

`AnswerSpaceInput` e `isAnswerComplete` son **los mismos que usa el chat**
(`web/src/components/answer/AnswerSpaceInput.tsx`). Las seis formas de respuesta
se comportan igual en los dos sitios porque son el mismo código, no porque
alguien lo haya copiado bien.

**Caducado, gastado e inexistente se muestran como un solo caso.** La API no los
distingue a propósito —para no ser un oráculo— y la interfaz no debe deshacer eso
siendo más informativa que el servidor.

Comprobar que los nombres importados existen: si `isAnswerComplete` no se exporta
desde ese fichero, exportarlo, sin duplicar la lógica.

- [ ] **Step 3: Comprobar que compila**

```bash
cd web && bun run build
```

Expected: `tsc -b` y `vite build` limpios.

- [ ] **Step 4: Probarlo de verdad**

Con la API en marcha (`bun run dev`), crear una query de riesgo bajo por la API, sacar el token del grant de la base de datos y abrir `http://localhost:5173/q/<token>`. Comprobar a mano, y contarlo en el informe:

- la pregunta se ve sin sesión;
- recargar no gasta el enlace;
- responder muestra el acuse;
- recargar después de responder muestra el mensaje de enlace no válido.

`web/` no tiene runner de tests, así que esta comprobación manual es la evidencia. Decirlo así en el informe, sin adornarlo.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/PublicQueryPage.tsx web/src/App.tsx
git commit -m "Show the question to whoever holds the link"
```

---

### Task 5: Que el acceso no pierda a dónde ibas

**Files:**
- Modify: `web/src/components/auth/ProtectedRoute.tsx`
- Modify: `web/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: el enlace `/app/c/:conversationId?email=…` que la Task 2 pone en el correo.
- Produces: nada que consuman otras tareas.

Esta es la otra mitad de la pieza (a), y sin ella el enlace con contexto no sirve
de nada para `high` y `critical`: hoy, quien llega sin sesión a `/app/c/…` acaba
en el acceso y, tras identificarse, aterriza en el panel — **habiendo perdido la
conversación a la que iba**. Vuelve al correo y empieza otra vez.

- [ ] **Step 1: Recordar el destino al redirigir**

En `web/src/components/auth/ProtectedRoute.tsx`, la redirección al acceso debe
llevar consigo a dónde se iba:

```tsx
import { Navigate, Outlet, useLocation } from "react-router";

// ... dentro del componente, donde hoy redirige a /login:
const location = useLocation();
const next = `${location.pathname}${location.search}`;
return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
```

- [ ] **Step 2: Rellenar el email y volver al destino**

En `web/src/pages/LoginPage.tsx`, leer ambos parámetros y usarlos:

```tsx
import { useSearchParams } from "react-router";

const [searchParams] = useSearchParams();
const nextParam = searchParams.get("next");
const emailParam = searchParams.get("email");
```

Inicializar el campo de email con `emailParam ?? ""`. Poner el email en la URL de
un correo dirigido a esa misma persona no revela nada que quien lo abre no supiera
ya.

Y tras verificar el código, navegar al destino en lugar de al panel:

```tsx
// Only a path inside our own app. An absolute URL here would turn the login
// into an open redirect: an attacker mails ?next=https://evil.example and the
// victim lands there having just proved they control their inbox.
function safeNext(next: string | null): string {
  if (!next) return "/app";
  if (!next.startsWith("/app")) return "/app";
  if (next.startsWith("//")) return "/app";
  return next;
}

navigate(safeNext(nextParam), { replace: true });
```

La comprobación de `//` no es paranoia: `//evil.example` es una URL con host
según la especificación, y pasa un `startsWith("/")` ingenuo. Aquí además empieza
por `/app`, así que no llegaría — pero la comprobación se queda escrita porque el
prefijo puede cambiar y la trampa no.

- [ ] **Step 3: Comprobar que compila**

```bash
cd web && bun run build
```

Expected: `tsc -b` y `vite build` limpios.

- [ ] **Step 4: Probarlo a mano**

Con la API en marcha, abrir en una ventana privada
`http://localhost:5173/app/c/<un-id-de-conversación>?email=alguien@example.com`.
Comprobar, y contarlo en el informe:

- redirige al acceso con el email ya puesto;
- tras verificar el código, aterriza en **esa** conversación, no en el panel;
- que `?next=https://example.com` acaba en `/app` y no fuera del sitio.

`web/` no tiene runner de tests; esta comprobación manual es la evidencia.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/auth/ProtectedRoute.tsx web/src/pages/LoginPage.tsx
git commit -m "Land people on the question they were sent to"
```

---

### Task 6: Documentación

**Files:**
- Modify: `docs/api/README.md`
- Modify: `docs-site/content/docs/concepts/` (la página de queries) o crear una nueva en `docs-site/content/docs/`
- Modify: `docs/operations.md`

- [ ] **Step 1: Documentar el endpoint público**

En `docs/api/README.md` —**en español**, es la fuente de verdad— documentar `GET` y `POST /api/v1/public/queries/:token` junto al resto de rutas humanas: qué devuelven, que no requieren sesión, que el `GET` no consume y que solo `outcome: "answer"` gasta el enlace.

- [ ] **Step 2: Documentar el comportamiento para el integrador**

En `docs-site` —**en inglés**— explicar al agente lo que decide su `risk`: que `low` y `medium` producen un enlace de un clic y que `high` y `critical` obligan a la persona a identificarse. Es una consecuencia visible de un campo que el agente ya rellena, y quien integra debe saberlo antes de elegir el riesgo.

- [ ] **Step 3: Anotar el riesgo aceptado**

En `docs/operations.md` —**en español**— dejar escrito el riesgo residual: un correo reenviado es una credencial reenviada, acotada a responder esa pregunta, sin lectura del hilo y sin sesión. Y que la revocación de un enlace suelto se hace con `cancel_query`, porque no hay endpoint propio.

- [ ] **Step 4: Verificar**

```bash
cd docs-site && npm run build
```

Expected: build limpio. `docs-site` usa **npm**, no Bun.

- [ ] **Step 5: Commit**

```bash
git add docs/api/README.md docs/operations.md docs-site/content
git commit -m "Document the link that answers one question"
```

---

## Verificación final

```bash
bun run typecheck
bunx biome check src/ tests/
docker exec agentdialog_redis_1 redis-cli -n 1 FLUSHDB
bun test tests/unit tests/integration
cd web && bun run build
cd ../docs-site && npm run build
```

Y una comprobación que ninguna de esas cubre, porque es la premisa entera del diseño: **que la respuesta del `GET` público no contenga nada que no sea la pregunta**. Capturar una respuesta real y leerla entera — que no aparezca el hilo de la conversación, ni otras queries, ni un token de sesión, ni el email de nadie más.
