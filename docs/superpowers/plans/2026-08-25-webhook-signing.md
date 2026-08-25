# Firma de webhooks verificable — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el consumidor de un webhook pueda demostrar con una librería estándar que la entrega la emitimos nosotros, que no la han manipulado y que no es una repetición.

**Architecture:** El secreto se guarda cifrado con AES-256-GCM en una lista `secrets` (varios vivos a la vez para poder rotar), no hasheado. Cada entrega firma `msg_id.timestamp.body` con HMAC-SHA256 sobre los bytes crudos del secreto y emite una firma por secreto vivo, siguiendo Standard Webhooks.

**Tech Stack:** Bun, Hono, Drizzle/PostgreSQL, zod, `node:crypto`. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-08-25-webhook-signing-design.md`

## Global Constraints

- Código, comentarios y mensajes de commit **en inglés**. Los specs y planes van en español.
- Todas las rutas de agente responden `{ data: ... }`. Patrón: `src/routes/agent/webhooks.ts`.
- Nunca ejecutar `bun test` a secas ni `bun test tests/`. Siempre `bun test tests/unit tests/integration`.
- Las de integración necesitan Postgres y Redis, y una base de datos aparte. Si Redis acumula el contador de registro, limpiar con `redis-cli -n 1 FLUSHDB`.
- Formato del secreto entregado al consumidor: `whsec_` + base64 de 32 bytes aleatorios.
- La cadena firmada es exactamente `${msg_id}.${timestamp}.${body}`, con el timestamp en **segundos**.
- El HMAC usa los **bytes crudos** del secreto: base64-decodificado tras quitar `whsec_`. Firmar sobre la cadena literal produce firmas que las librerías de terceros rechazan.
- Cabeceras: `webhook-id`, `webhook-timestamp`, `webhook-signature`. Se conserva `X-AgentDialog-Event`, informativa, fuera de la firma.
- Tolerancia documentada al consumidor: **5 minutos**.
- Ventana de gracia de rotación: **24 h**, en `src/config/limits.ts`.

---

### Task 1: Caja fuerte de secretos (AES-256-GCM)

**Files:**
- Create: `src/lib/secret-box.ts`
- Modify: `src/env.ts` (añadir `WEBHOOK_ENCRYPTION_KEY` al esquema y al `superRefine`)
- Modify: `tests/setup.ts` (dar una clave a los tests)
- Modify: `.env.example`
- Test: `tests/unit/secret-box.test.ts`

**Interfaces:**
- Consumes: `env()` de `src/env.ts`.
- Produces: `seal(plaintext: string): SealedSecret`, `open(sealed: SealedSecret): string`, `interface SealedSecret { ciphertext: string; iv: string; tag: string }`.

- [ ] **Step 1: Dar una clave de cifrado a los tests**

En `tests/setup.ts`, añadir al final:

```ts
// 32 bytes en base64. Solo para tests; producción la recibe de Secret Manager.
process.env.WEBHOOK_ENCRYPTION_KEY = "dGVzdC13ZWJob29rLWtleS0zMi1ieXRlcy1sb25nISE=";
```

Comprobar que decodifica a 32 bytes exactos antes de seguir:

```bash
node -e 'console.log(Buffer.from("dGVzdC13ZWJob29rLWtleS0zMi1ieXRlcy1sb25nISE=","base64").length)'
```

Debe imprimir `32`. Si imprime otra cosa, generar una nueva con `openssl rand -base64 32` y usar esa.

- [ ] **Step 2: Escribir el test que falla**

Crear `tests/unit/secret-box.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { seal, open, type SealedSecret } from "../../src/lib/secret-box";

/**
 * The signing secret has to come back out — that is the whole point, and the
 * reason bcrypt was the wrong tool. What must not come back out is anything
 * an attacker tampered with.
 */

describe("seal / open", () => {
  it("returns the original secret", () => {
    const secret = "whsec_K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN";
    expect(open(seal(secret))).toBe(secret);
  });

  it("uses a fresh iv every time, so the same secret never seals alike", () => {
    const a = seal("whsec_same");
    const b = seal("whsec_same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses a tampered ciphertext", () => {
    const sealed = seal("whsec_original");
    const tampered: SealedSecret = { ...sealed, ciphertext: flipFirstByte(sealed.ciphertext) };
    expect(() => open(tampered)).toThrow();
  });

  it("refuses a tampered authentication tag", () => {
    const sealed = seal("whsec_original");
    const tampered: SealedSecret = { ...sealed, tag: flipFirstByte(sealed.tag) };
    expect(() => open(tampered)).toThrow();
  });

  it("refuses a tampered iv", () => {
    const sealed = seal("whsec_original");
    const tampered: SealedSecret = { ...sealed, iv: flipFirstByte(sealed.iv) };
    expect(() => open(tampered)).toThrow();
  });
});

function flipFirstByte(base64: string): string {
  const buf = Buffer.from(base64, "base64");
  buf[0] = buf[0] ^ 0xff;
  return buf.toString("base64");
}
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `bun test tests/unit/secret-box.test.ts`
Expected: FAIL con `Cannot find module '../../src/lib/secret-box'`

- [ ] **Step 4: Añadir la variable de entorno**

En `src/env.ts`, junto a las demás claves del esquema:

```ts
  // The key that encrypts webhook signing secrets at rest. 32 bytes, base64.
  // Losing it loses every signing secret; recovery is rotation.
  WEBHOOK_ENCRYPTION_KEY: z.string().optional(),
```

Y dentro del `superRefine` existente, después del bloque de `INBOUND_EMAIL_WEBHOOK_SECRET`:

```ts
  // Without this key a webhook secret cannot be stored recoverably, and a
  // secret we cannot recover cannot sign anything the consumer can verify —
  // which is the bug this exists to prevent recurring.
  if (env.NODE_ENV === "production" && !env.WEBHOOK_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["WEBHOOK_ENCRYPTION_KEY"],
      message:
        "WEBHOOK_ENCRYPTION_KEY is required in production: without it webhook " +
        "signing secrets cannot be stored recoverably and no delivery can be verified.",
    });
  }
```

En `.env.example`, junto a `WEBHOOK_TIMEOUT_MS`:

```
# 32 bytes in base64: openssl rand -base64 32
# Required in production. Losing it means rotating every webhook secret.
WEBHOOK_ENCRYPTION_KEY=
```

- [ ] **Step 5: Implementar la caja fuerte**

Crear `src/lib/secret-box.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "../env";

/**
 * Reversible encryption for secrets we must be able to hand back out.
 *
 * This is deliberately NOT in lib/crypto.ts. That module is one-way hashing
 * for credentials we only ever compare; mixing the two is what produced a
 * webhook signature keyed with a bcrypt hash. Keep the boundary.
 */

export interface SealedSecret {
  ciphertext: string; // base64
  iv: string; // base64, 96 bits, fresh per seal
  tag: string; // base64, GCM authentication tag
}

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function encryptionKey(): Buffer {
  const configured = env().WEBHOOK_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error("WEBHOOK_ENCRYPTION_KEY is not set");
  }

  const key = Buffer.from(configured, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `WEBHOOK_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }

  return key;
}

export function seal(plaintext: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function open(sealed: SealedSecret): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 6: Ejecutar el test y verificar que pasa**

Run: `bun test tests/unit/secret-box.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/secret-box.ts src/env.ts tests/setup.ts tests/unit/secret-box.test.ts .env.example
git commit -m "Store a secret we can hand back, instead of one we can only compare"
```

---

### Task 2: Firma Standard Webhooks

**Files:**
- Create: `src/lib/webhook-signature.ts`
- Test: `tests/unit/webhook-signature.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `generateWebhookSecret(): string` — `whsec_` + base64 de 32 bytes. **Sustituye** a la de `src/lib/crypto.ts`, que devolvía hex sin prefijo.
  - `buildSignedContent(msgId: string, timestamp: number, body: string): string`
  - `signPayload(secret: string, msgId: string, timestamp: number, body: string): string` — devuelve `v1,<base64>`
  - `generateMessageId(): string` — `msg_` + `nanoid(27)`
  - `signatureHeader(secrets: string[], msgId: string, timestamp: number, body: string): string` — firmas separadas por espacio

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/webhook-signature.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createHmac } from "crypto";
import {
  buildSignedContent,
  generateMessageId,
  generateWebhookSecret,
  signPayload,
  signatureHeader,
} from "../../src/lib/webhook-signature";

/**
 * Standard Webhooks, verbatim. These tests recompute the expected signature
 * from the specification rather than from our own helper, because a helper
 * that agrees with itself is exactly how the bcrypt bug survived.
 */

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const BODY = '{"event":"query.answered","data":{}}';
const MSG_ID = "msg_2KWPBgLlAfxdpx2AI54pPJ85f4W";
const TIMESTAMP = 1674087231;

function expectedSignature(secret: string): string {
  const raw = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signed = `${MSG_ID}.${TIMESTAMP}.${BODY}`;
  return createHmac("sha256", raw).update(signed).digest("base64");
}

describe("generateWebhookSecret", () => {
  it("is whsec_ followed by 32 bytes of base64", () => {
    const secret = generateWebhookSecret();
    expect(secret).toStartWith("whsec_");
    expect(Buffer.from(secret.slice("whsec_".length), "base64")).toHaveLength(32);
  });

  it("does not repeat itself", () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});

describe("generateMessageId", () => {
  it("is msg_ followed by an opaque id", () => {
    expect(generateMessageId()).toMatch(/^msg_[A-Za-z0-9_-]{27}$/);
  });
});

describe("buildSignedContent", () => {
  it("joins id, timestamp and body with full stops", () => {
    expect(buildSignedContent(MSG_ID, TIMESTAMP, BODY)).toBe(
      `${MSG_ID}.${TIMESTAMP}.${BODY}`,
    );
  });
});

describe("signPayload", () => {
  it("matches a signature computed straight from the specification", () => {
    expect(signPayload(SECRET, MSG_ID, TIMESTAMP, BODY)).toBe(
      `v1,${expectedSignature(SECRET)}`,
    );
  });

  it("keys the hmac with the decoded bytes, not the literal string", () => {
    const literal = createHmac("sha256", SECRET)
      .update(`${MSG_ID}.${TIMESTAMP}.${BODY}`)
      .digest("base64");

    expect(signPayload(SECRET, MSG_ID, TIMESTAMP, BODY)).not.toBe(`v1,${literal}`);
  });

  it("changes when the body changes", () => {
    expect(signPayload(SECRET, MSG_ID, TIMESTAMP, BODY)).not.toBe(
      signPayload(SECRET, MSG_ID, TIMESTAMP, `${BODY} `),
    );
  });

  it("changes when the timestamp changes, which is what stops a replay", () => {
    expect(signPayload(SECRET, MSG_ID, TIMESTAMP, BODY)).not.toBe(
      signPayload(SECRET, MSG_ID, TIMESTAMP + 1, BODY),
    );
  });
});

describe("signatureHeader", () => {
  it("emits one signature per live secret, space delimited", () => {
    const second = generateWebhookSecret();
    const header = signatureHeader([SECRET, second], MSG_ID, TIMESTAMP, BODY);

    expect(header).toBe(
      `${signPayload(SECRET, MSG_ID, TIMESTAMP, BODY)} ${signPayload(second, MSG_ID, TIMESTAMP, BODY)}`,
    );
    expect(header.split(" ")).toHaveLength(2);
  });

  it("emits a single signature when only one secret is live", () => {
    expect(signatureHeader([SECRET], MSG_ID, TIMESTAMP, BODY).split(" ")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `bun test tests/unit/webhook-signature.test.ts`
Expected: FAIL con `Cannot find module '../../src/lib/webhook-signature'`

- [ ] **Step 3: Implementar la firma**

Crear `src/lib/webhook-signature.ts`:

```ts
import { createHmac, randomBytes } from "crypto";
import { nanoid } from "nanoid";

/**
 * Standard Webhooks (https://www.standardwebhooks.com).
 *
 * The signed content is `msg_id.timestamp.payload`, so the timestamp cannot be
 * altered without invalidating the signature — which is what makes a captured
 * delivery non-replayable. The consumer verifies with any off-the-shelf
 * implementation; nothing here is ours to invent.
 */

const SECRET_PREFIX = "whsec_";
const SECRET_BYTES = 32;
const MESSAGE_ID_SIZE = 27;

export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString("base64")}`;
}

export function generateMessageId(): string {
  return `msg_${nanoid(MESSAGE_ID_SIZE)}`;
}

export function buildSignedContent(msgId: string, timestamp: number, body: string): string {
  return `${msgId}.${timestamp}.${body}`;
}

/**
 * The key is the secret's decoded bytes, not the string. Signing the literal
 * produces a signature every standard verifier rejects, with no clue why.
 */
export function signPayload(
  secret: string,
  msgId: string,
  timestamp: number,
  body: string,
): string {
  const key = Buffer.from(
    secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
    "base64",
  );

  const signature = createHmac("sha256", key)
    .update(buildSignedContent(msgId, timestamp, body))
    .digest("base64");

  return `v1,${signature}`;
}

/** One signature per live secret, space delimited, so a rotation never drops a delivery. */
export function signatureHeader(
  secrets: string[],
  msgId: string,
  timestamp: number,
  body: string,
): string {
  return secrets.map((secret) => signPayload(secret, msgId, timestamp, body)).join(" ");
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `bun test tests/unit/webhook-signature.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Retirar la firma antigua**

Borrar de `src/lib/crypto.ts` las dos funciones que quedan sin uso, `generateWebhookSecret` (línea 46) y `signWebhookPayload` (línea 50), y su import de `createHmac` si no lo usa nada más en el fichero.

**Ojo al orden.** Hasta la Task 4, `src/services/webhook.service.ts` sigue
importando `generateWebhookSecret` de `../lib/crypto`, y hasta la Task 5
`src/lib/webhook-delivery.ts` sigue importando `signWebhookPayload`. Borrarlas
aquí deja el typecheck roto hasta entonces, lo cual es aceptable **si se sabe**.

Dos formas válidas de proceder, elegir una y no mezclarlas:

- borrarlas ahora y asumir que `bun run typecheck` falla en esos dos ficheros
  hasta cerrar la Task 5;
- dejar este paso pendiente y ejecutarlo al final de la Task 5, que es donde el
  plan vuelve a comprobarlo.

Al terminar la Task 5, en cualquiera de los dos casos:

```bash
grep -rn "signWebhookPayload\|generateWebhookSecret" src/lib/crypto.ts
```

Expected: sin resultados.

- [ ] **Step 6: Ejecutar la suite unitaria completa**

Run: `bun test tests/unit`
Expected: PASS. `tests/unit/crypto.test.ts` puede referirse a las funciones borradas; si lo hace, borrar esos casos concretos, no el fichero.

- [ ] **Step 7: Commit**

```bash
git add src/lib/webhook-signature.ts src/lib/crypto.ts tests/unit/webhook-signature.test.ts tests/unit/crypto.test.ts
git commit -m "Sign a webhook the way the rest of the industry does"
```

---

### Task 3: Esquema y migración

**Files:**
- Modify: `src/db/schema/webhooks.ts`
- Create: `migrations/0008_webhook_signing.sql`
- Modify: `src/config/limits.ts`

**Interfaces:**
- Consumes: `SealedSecret` de `src/lib/secret-box.ts` (Task 1).
- Produces: `webhooks.secrets` tipado como `StoredSecret[]`; `interface StoredSecret extends SealedSecret { id: string; createdAt: string; expiresAt: string | null }`; `getLimitsConfig().webhookSecretGraceMs`.

- [ ] **Step 1: Añadir el tipo y la columna al esquema**

En `src/db/schema/webhooks.ts`, sustituir la línea `secretHash: varchar("secret_hash", { length: 256 }).notNull(),` por:

```ts
  secrets: jsonb("secrets").$type<StoredSecret[]>().notNull().default([]),
```

y añadir arriba del `pgTable`:

```ts
import type { SealedSecret } from "../../lib/secret-box";

/**
 * A signing secret, encrypted at rest. A list rather than a value because a
 * rotation keeps the previous secret alive for a grace window and signs with
 * both, so the consumer migrates without dropping a delivery.
 */
export interface StoredSecret extends SealedSecret {
  id: string;
  createdAt: string;
  expiresAt: string | null; // null = live indefinitely
}
```

`varchar` deja de usarse en el fichero: quitarlo del import de `drizzle-orm/pg-core` si no queda otra columna que lo use (`url` sí lo usa, así que se queda).

- [ ] **Step 2: Escribir la migración**

Crear `migrations/0008_webhook_signing.sql`:

```sql
-- The signature was keyed with the bcrypt hash of the secret, so no consumer
-- could ever verify a delivery. The hashes are one-way and worthless; the
-- original secrets are unrecoverable.
--
-- Production holds zero webhooks as of 2026-08-25, so this breaks nobody. The
-- deactivation covers a webhook created between now and the deploy: its secret
-- was stored as a bcrypt hash too, so it is just as unrecoverable and its owner
-- must call rotate-secret to get a usable one.

ALTER TABLE "webhooks" ADD COLUMN "secrets" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "webhooks" SET "is_active" = false;

ALTER TABLE "webhooks" DROP COLUMN "secret_hash";
```

- [ ] **Step 3: Añadir la ventana de gracia a los límites**

En `src/config/limits.ts`, dentro del objeto devuelto, junto a `maxWebhooksPerAgent`:

```ts
    webhookSecretGraceMs: 24 * 60 * 60 * 1000, // a rotated secret stays live 24h
```

- [ ] **Step 4: Aplicar la migración y comprobar la forma de la tabla**

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis
bun run db:migrate
```

Comprobar:

```bash
docker exec $(docker ps -qf name=postgres) psql -U agentdialog -d agentdialog \
  -c "\d webhooks"
```

Expected: aparece `secrets | jsonb | not null`, y **no** aparece `secret_hash`.

- [ ] **Step 5: Aplicar también a la base de datos de tests**

```bash
DATABASE_URL="postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test" \
  bun run scripts/migrate.ts
```

- [ ] **Step 6: Verificar que el typecheck no se rompe todavía**

Run: `bun run typecheck`
Expected: errores en `src/services/webhook.service.ts` por `secretHash`, que ya no existe. **Es lo esperado** y lo arregla la Task 4. Anotar los errores; cualquier otro fichero que aparezca es una sorpresa que hay que investigar.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema/webhooks.ts migrations/0008_webhook_signing.sql src/config/limits.ts
git commit -m "Keep webhook secrets as a list of sealed values, not a hash"
```

---

### Task 4: Servicio de webhooks

**Files:**
- Modify: `src/services/webhook.service.ts`
- Test: `tests/unit/webhook-secrets.test.ts`

**Interfaces:**
- Consumes: `seal`/`open` (Task 1), `generateWebhookSecret`/`generateMessageId`/`signatureHeader` (Task 2), `StoredSecret` y `webhookSecretGraceMs` (Task 3).
- Produces:
  - `liveSecrets(secrets: StoredSecret[], now?: Date): StoredSecret[]` — exportada para poder probarla
  - `createWebhook(agentId, input): Promise<{ webhook: PublicWebhook; secret: string }>`
  - `rotateWebhookSecret(webhookId, agentId): Promise<{ webhook: PublicWebhook; secret: string }>`
  - `interface PublicWebhook` — la fila **sin** `secrets`
  - `listWebhooks`, `updateWebhook`, `deleteWebhook` devuelven `PublicWebhook`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/webhook-secrets.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { liveSecrets } from "../../src/services/webhook.service";
import type { StoredSecret } from "../../src/db/schema/webhooks";

/**
 * Which secrets sign a delivery. A rotated secret keeps signing until its
 * grace window closes, and then must stop — a secret that outlives its
 * expiry is a secret nobody can revoke.
 */

function secret(id: string, expiresAt: string | null): StoredSecret {
  return { id, ciphertext: "x", iv: "y", tag: "z", createdAt: "2026-08-25T00:00:00.000Z", expiresAt };
}

const NOW = new Date("2026-08-25T12:00:00.000Z");

describe("liveSecrets", () => {
  it("keeps a secret that never expires", () => {
    expect(liveSecrets([secret("a", null)], NOW).map((s) => s.id)).toEqual(["a"]);
  });

  it("keeps a rotated secret while its grace window is open", () => {
    const secrets = [secret("new", null), secret("old", "2026-08-25T18:00:00.000Z")];
    expect(liveSecrets(secrets, NOW).map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("drops a secret whose window has closed", () => {
    const secrets = [secret("new", null), secret("old", "2026-08-25T06:00:00.000Z")];
    expect(liveSecrets(secrets, NOW).map((s) => s.id)).toEqual(["new"]);
  });

  it("returns nothing when every secret has expired", () => {
    expect(liveSecrets([secret("old", "2026-08-24T00:00:00.000Z")], NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `bun test tests/unit/webhook-secrets.test.ts`
Expected: FAIL — `liveSecrets` no existe.

- [ ] **Step 3: Reescribir el servicio**

Sustituir `src/services/webhook.service.ts` por:

```ts
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { webhooks, type StoredSecret } from "../db/schema/webhooks";
import { seal, open } from "../lib/secret-box";
import {
  generateMessageId,
  generateWebhookSecret,
  signatureHeader,
} from "../lib/webhook-signature";
import { deliverWebhook } from "../lib/webhook-delivery";
import { NotFoundError, ForbiddenError } from "../lib/errors";
import { getLimitsConfig } from "../config/limits";

/**
 * A webhook as the API is allowed to describe it. `secrets` is absent by
 * construction rather than by remembering to strip it: the previous code
 * returned the whole row, and the row carried the signing key.
 */
export interface PublicWebhook {
  id: string;
  agentId: string;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastDeliveryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const publicColumns = {
  id: webhooks.id,
  agentId: webhooks.agentId,
  url: webhooks.url,
  events: webhooks.events,
  isActive: webhooks.isActive,
  failureCount: webhooks.failureCount,
  lastDeliveryAt: webhooks.lastDeliveryAt,
  createdAt: webhooks.createdAt,
  updatedAt: webhooks.updatedAt,
};

function newSecret(): { record: StoredSecret; plaintext: string } {
  const plaintext = generateWebhookSecret();
  return {
    plaintext,
    record: {
      id: nanoid(12),
      ...seal(plaintext),
      createdAt: new Date().toISOString(),
      expiresAt: null,
    },
  };
}

/** The secrets that still sign a delivery. Exported so the rule can be tested. */
export function liveSecrets(secrets: StoredSecret[], now: Date = new Date()): StoredSecret[] {
  return secrets.filter((s) => s.expiresAt === null || new Date(s.expiresAt) > now);
}

export async function createWebhook(
  agentId: string,
  input: { url: string; events: string[] },
): Promise<{ webhook: PublicWebhook; secret: string }> {
  const db = getDb();
  const limits = getLimitsConfig();

  const existing = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(eq(webhooks.agentId, agentId));

  if (existing.length >= limits.maxWebhooksPerAgent) {
    throw new ForbiddenError(`Maximum ${limits.maxWebhooksPerAgent} webhooks per agent`);
  }

  const { record, plaintext } = newSecret();

  const [webhook] = await db
    .insert(webhooks)
    .values({ agentId, url: input.url, events: input.events, secrets: [record] })
    .returning(publicColumns);

  return { webhook, secret: plaintext };
}

export async function listWebhooks(agentId: string): Promise<PublicWebhook[]> {
  const db = getDb();
  return db.select(publicColumns).from(webhooks).where(eq(webhooks.agentId, agentId));
}

export async function updateWebhook(
  webhookId: string,
  agentId: string,
  input: { url?: string; events?: string[]; isActive?: boolean },
): Promise<PublicWebhook> {
  const db = getDb();
  const [webhook] = await db
    .update(webhooks)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.agentId, agentId)))
    .returning(publicColumns);

  if (!webhook) throw new NotFoundError("Webhook", webhookId);
  return webhook;
}

export async function deleteWebhook(
  webhookId: string,
  agentId: string,
): Promise<PublicWebhook> {
  const db = getDb();
  const [deleted] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.agentId, agentId)))
    .returning(publicColumns);

  if (!deleted) throw new NotFoundError("Webhook", webhookId);
  return deleted;
}

/**
 * Issue a new signing secret and give the old one a grace window. Both sign
 * every delivery until the window closes, so the consumer switches when it
 * likes. Works on an inactive webhook and reactivates it: that is how a
 * webhook disabled by the 0008 migration comes back.
 */
export async function rotateWebhookSecret(
  webhookId: string,
  agentId: string,
): Promise<{ webhook: PublicWebhook; secret: string }> {
  const db = getDb();
  const limits = getLimitsConfig();

  const [current] = await db
    .select({ secrets: webhooks.secrets })
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.agentId, agentId)))
    .limit(1);

  if (!current) throw new NotFoundError("Webhook", webhookId);

  const { record, plaintext } = newSecret();
  const expiresAt = new Date(Date.now() + limits.webhookSecretGraceMs).toISOString();

  const retired = liveSecrets(current.secrets).map((s) => ({
    ...s,
    expiresAt: s.expiresAt ?? expiresAt,
  }));

  const [webhook] = await db
    .update(webhooks)
    .set({ secrets: [record, ...retired], isActive: true, updatedAt: new Date() })
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.agentId, agentId)))
    .returning(publicColumns);

  return { webhook, secret: plaintext };
}

export async function dispatchWebhooks(
  agentId: string,
  event: string,
  data: Record<string, unknown>,
) {
  const db = getDb();
  const activeWebhooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.agentId, agentId), eq(webhooks.isActive, true)));

  const payload = { event, data, timestamp: new Date().toISOString() };
  const body = JSON.stringify(payload);

  for (const webhook of activeWebhooks) {
    const events = webhook.events as string[];
    if (events.length > 0 && !events.includes(event) && !events.includes("*")) {
      continue;
    }

    const secrets = liveSecrets(webhook.secrets).map((s) => open(s));
    if (secrets.length === 0) {
      // Every secret expired without a rotation. Signing with nothing would
      // send an unverifiable delivery, which is the bug we are removing.
      continue;
    }

    const msgId = generateMessageId();
    const timestamp = Math.floor(Date.now() / 1000);

    // Fire and forget with error tracking. Durable retries are a separate
    // piece of work; msgId is per message so a retry can reuse it.
    deliverWebhook(webhook.url, {
      body,
      event,
      msgId,
      timestamp,
      signature: signatureHeader(secrets, msgId, timestamp, body),
    }).then(async (result) => {
      if (!result.success) {
        await db
          .update(webhooks)
          .set({
            failureCount: webhook.failureCount + 1,
            isActive: webhook.failureCount + 1 >= 10 ? false : webhook.isActive,
            updatedAt: new Date(),
          })
          .where(eq(webhooks.id, webhook.id));
      } else {
        await db
          .update(webhooks)
          .set({ failureCount: 0, lastDeliveryAt: new Date(), updatedAt: new Date() })
          .where(eq(webhooks.id, webhook.id));
      }
    });
  }
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `bun test tests/unit/webhook-secrets.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/services/webhook.service.ts tests/unit/webhook-secrets.test.ts
git commit -m "Sign with the secret the consumer holds, and stop returning the row that carries it"
```

---

### Task 5: Entrega

**Files:**
- Modify: `src/lib/webhook-delivery.ts`

**Interfaces:**
- Consumes: la llamada que hace `dispatchWebhooks` en la Task 4.
- Produces: `deliverWebhook(url: string, delivery: WebhookDelivery): Promise<{ success: boolean; statusCode?: number; error?: string }>` con `interface WebhookDelivery { body: string; event: string; msgId: string; timestamp: number; signature: string }`.

- [ ] **Step 1: Reescribir la entrega**

Sustituir `src/lib/webhook-delivery.ts` por:

```ts
import { env } from "../env";

export interface WebhookDelivery {
  body: string;
  event: string;
  msgId: string;
  timestamp: number; // unix seconds, and part of the signed content
  signature: string; // one "v1,<base64>" per live secret, space delimited
}

/**
 * Headers follow Standard Webhooks, so a consumer verifies with an existing
 * library instead of a snippet of ours. X-AgentDialog-Event is a convenience
 * for routing and is deliberately outside the signature.
 */
export async function deliverWebhook(
  url: string,
  delivery: WebhookDelivery,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const e = env();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), e.WEBHOOK_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": delivery.msgId,
        "webhook-timestamp": String(delivery.timestamp),
        "webhook-signature": delivery.signature,
        "X-AgentDialog-Event": delivery.event,
        "User-Agent": "AgentDialog-Webhook/2.0",
      },
      body: delivery.body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return { success: response.ok, statusCode: response.status };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

- [ ] **Step 2: Comprobar que no queda nadie llamando a la firma vieja**

```bash
grep -rn "signWebhookPayload\|X-AgentDialog-Signature\|X-AgentDialog-Timestamp" src/
```

Expected: sin resultados. Si aparece `src/lib/crypto.ts`, completar el borrado pendiente de la Task 2 Step 5.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: exit 0, sin errores. Los de `secretHash` de la Task 3 deben haber desaparecido.

- [ ] **Step 4: Commit**

```bash
git add src/lib/webhook-delivery.ts src/lib/crypto.ts
git commit -m "Deliver with the Standard Webhooks headers"
```

---

### Task 6: Ruta de rotación

**Files:**
- Modify: `src/routes/agent/webhooks.ts`

**Interfaces:**
- Consumes: `rotateWebhookSecret` (Task 4).
- Produces: `POST /api/v1/agent/webhooks/:id/rotate-secret` → `{ data: { ...PublicWebhook, secret } }`, 200.

- [ ] **Step 1: Añadir la ruta**

En `src/routes/agent/webhooks.ts`, importar `rotateWebhookSecret` junto a las demás funciones del servicio y añadir, **antes** de `app.delete("/:id", ...)` para que no compita con `/:id`:

```ts
app.post("/:id/rotate-secret", async (c) => {
  const webhookId = c.req.param("id");
  const agentId = c.get("agentId");
  const { webhook, secret } = await rotateWebhookSecret(webhookId, agentId);

  return c.json({
    data: {
      ...webhook,
      secret, // Only returned once!
    },
  });
});
```

- [ ] **Step 2: Simplificar la creación**

En el `app.post("/")`, `createWebhook` ya devuelve una fila sin secretos, así que el spread sigue siendo correcto y no hay nada que cambiar. Verificar leyendo que el objeto devuelto no menciona `secretHash` ni `secrets`.

- [ ] **Step 3: Typecheck y suite unitaria**

Run: `bun run typecheck && bun test tests/unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/routes/agent/webhooks.ts
git commit -m "Let an agent rotate a webhook secret without dropping a delivery"
```

---

### Task 7: Prueba de integración de extremo a extremo

**Files:**
- Create: `tests/integration/webhook-signature.test.ts`

**Interfaces:**
- Consumes: la API HTTP completa vía `createTestApp()` de `tests/helpers`.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/integration/webhook-signature.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createHmac } from "crypto";
import { createTestApp } from "../helpers";
import { dispatchWebhooks } from "../../src/services/webhook.service";

/**
 * The test the codebase did not have, and the reason a signature keyed with a
 * bcrypt hash shipped: nothing ever verified a delivery the way a consumer
 * does. This captures a real request and verifies it from the specification.
 */

interface Captured {
  headers: Record<string, string>;
  body: string;
}

describe("Webhook signature", () => {
  const app = createTestApp();
  const captured: Captured[] = [];
  let server: ReturnType<typeof Bun.serve>;
  let receiverUrl: string;
  let apiKey: string;
  let agentId: string;

  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        captured.push({
          headers: Object.fromEntries(req.headers.entries()),
          body: await req.text(),
        });
        return new Response("ok");
      },
    });
    receiverUrl = `http://localhost:${server.port}/hook`;

    const res = await app.request("/api/v1/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `webhook-sig-${Date.now()}`,
        displayName: "Webhook Signature Test Agent",
      }),
    });
    const body = await res.json();
    apiKey = body.data.apiKey;
    agentId = body.data.id;
  });

  afterAll(() => server.stop(true));

  function verify(entry: Captured, secret: string): boolean {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signed = `${entry.headers["webhook-id"]}.${entry.headers["webhook-timestamp"]}.${entry.body}`;
    const expected = createHmac("sha256", key).update(signed).digest("base64");

    return entry.headers["webhook-signature"]
      .split(" ")
      .some((s) => s === `v1,${expected}`);
  }

  it("delivers a signature the creation secret can verify", async () => {
    const created = await app.request("/api/v1/agent/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: receiverUrl, events: ["*"] }),
    });
    const { data } = await created.json();
    expect(data.secret).toStartWith("whsec_");

    captured.length = 0;
    await dispatchWebhooks(agentId, "query.answered", { queryId: "test" });
    await Bun.sleep(500);

    expect(captured).toHaveLength(1);
    expect(verify(captured[0], data.secret)).toBe(true);
  });

  it("signs with both secrets during the rotation window", async () => {
    const created = await app.request("/api/v1/agent/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: receiverUrl, events: ["*"] }),
    });
    const first = await created.json();

    const rotated = await app.request(
      `/api/v1/agent/webhooks/${first.data.id}/rotate-secret`,
      { method: "POST", headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const second = await rotated.json();
    expect(second.data.secret).not.toBe(first.data.secret);

    captured.length = 0;
    await dispatchWebhooks(agentId, "query.answered", { queryId: "test" });
    await Bun.sleep(500);

    const forThisHook = captured.find((c) => c.headers["webhook-signature"].includes(" "));
    expect(forThisHook).toBeDefined();
    expect(verify(forThisHook!, first.data.secret)).toBe(true);
    expect(verify(forThisHook!, second.data.secret)).toBe(true);
  });

  it("never returns secret material from list, update or delete", async () => {
    const created = await app.request("/api/v1/agent/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: receiverUrl, events: ["*"] }),
    });
    const { data } = await created.json();

    const listed = await (
      await app.request("/api/v1/agent/webhooks", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    ).text();

    const updated = await (
      await app.request(`/api/v1/agent/webhooks/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ events: ["query.answered"] }),
      })
    ).text();

    const removed = await (
      await app.request(`/api/v1/agent/webhooks/${data.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    ).text();

    for (const payload of [listed, updated, removed]) {
      expect(payload).not.toContain("whsec_");
      expect(payload).not.toContain("secrets");
      expect(payload).not.toContain("ciphertext");
      expect(payload).not.toContain("secretHash");
    }
  });
});
```

- [ ] **Step 2: Levantar las dependencias y ejecutar**

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis
redis-cli -n 1 FLUSHDB
bun test tests/integration/webhook-signature.test.ts
```

Expected: PASS, 3 tests. Si sale `429`, es el contador de registro en Redis: repetir el `FLUSHDB`.

- [ ] **Step 3: Suite completa**

Run: `bun test tests/unit tests/integration`
Expected: PASS. Comparar el total con el de `main` antes de empezar; solo deben aparecer tests nuevos, ninguno perdido.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/webhook-signature.test.ts
git commit -m "Verify a delivery the way a consumer does, over the real HTTP path"
```

---

### Task 8: SDK

**Files:**
- Modify: `sdks/typescript/src/client.ts`
- Modify: `sdks/typescript/src/types.ts`
- Modify: `sdks/typescript/src/index.ts`
- Create: `sdks/typescript/src/webhooks.ts`
- Test: `sdks/typescript/tests/webhooks.test.ts`

**Interfaces:**
- Consumes: el endpoint de la Task 6.
- Produces: `verifyWebhook(options): boolean`, `client.rotateWebhookSecret(id): Promise<WebhookWithSecret>`.

- [ ] **Step 1: Escribir el test que falla**

Crear `sdks/typescript/tests/webhooks.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createHmac } from "crypto";
import { verifyWebhook } from "../src/webhooks.js";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const BODY = '{"event":"query.answered","data":{}}';
const MSG_ID = "msg_2KWPBgLlAfxdpx2AI54pPJ85f4W";

function sign(secret: string, msgId: string, timestamp: number, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${msgId}.${timestamp}.${body}`).digest("base64")}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe("verifyWebhook", () => {
  it("accepts a delivery we signed", () => {
    const timestamp = nowSeconds();
    expect(
      verifyWebhook({
        secret: SECRET,
        body: BODY,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": sign(SECRET, MSG_ID, timestamp, BODY),
        },
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const timestamp = nowSeconds();
    expect(
      verifyWebhook({
        secret: SECRET,
        body: `${BODY} `,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": sign(SECRET, MSG_ID, timestamp, BODY),
        },
      }),
    ).toBe(false);
  });

  it("rejects a replay older than the tolerance", () => {
    const timestamp = nowSeconds() - 6 * 60;
    expect(
      verifyWebhook({
        secret: SECRET,
        body: BODY,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": sign(SECRET, MSG_ID, timestamp, BODY),
        },
      }),
    ).toBe(false);
  });

  it("accepts when one of several signatures matches, which is how rotation works", () => {
    const timestamp = nowSeconds();
    const other = "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    expect(
      verifyWebhook({
        secret: SECRET,
        body: BODY,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": `${sign(other, MSG_ID, timestamp, BODY)} ${sign(SECRET, MSG_ID, timestamp, BODY)}`,
        },
      }),
    ).toBe(true);
  });

  it("rejects when no signature in the list matches", () => {
    const timestamp = nowSeconds();
    const other = "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    expect(
      verifyWebhook({
        secret: SECRET,
        body: BODY,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": sign(other, MSG_ID, timestamp, BODY),
        },
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

```bash
cd sdks/typescript && bun install && bun test tests/webhooks.test.ts
```

Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el verificador**

Crear `sdks/typescript/src/webhooks.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET_PREFIX = "whsec_";
const DEFAULT_TOLERANCE_SECONDS = 300;

export interface VerifyWebhookOptions {
  /** The signing secret AgentDialog returned when the webhook was created. */
  secret: string;
  /** The raw request body, byte for byte. Re-serialising it breaks the signature. */
  body: string;
  headers: Record<string, string | undefined>;
  /** How old a delivery may be, in seconds. Defaults to five minutes. */
  toleranceSeconds?: number;
  /** Injectable for tests. */
  now?: () => number;
}

/**
 * Verify a delivery: that we signed it, that nobody altered it, and that it is
 * not a replay. Several signatures may arrive while a secret is being rotated;
 * any one of them matching is enough.
 */
export function verifyWebhook(options: VerifyWebhookOptions): boolean {
  const { secret, body, headers } = options;
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = options.now ? options.now() : Math.floor(Date.now() / 1000);

  const id = headers["webhook-id"];
  const rawTimestamp = headers["webhook-timestamp"];
  const signatures = headers["webhook-signature"];
  if (!id || !rawTimestamp || !signatures) return false;

  const timestamp = Number(rawTimestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const key = Buffer.from(
    secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
    "base64",
  );
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();

  return signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;

    const received = Buffer.from(value, "base64");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
```

- [ ] **Step 4: Exponer la rotación en el cliente**

En `sdks/typescript/src/client.ts`, en la sección `// ── Webhooks ──`, después de `createWebhook`:

```ts
  async rotateWebhookSecret(id: string): Promise<WebhookWithSecret> {
    return this.request<WebhookWithSecret>("POST", `/agent/webhooks/${id}/rotate-secret`);
  }
```

En `sdks/typescript/src/types.ts`, la interfaz `Webhook` (línea 124) se queda
corta respecto a lo que devuelve `PublicWebhook`. Añadir los dos campos que
faltan, dentro de la interfaz y antes de `createdAt`:

```ts
  failureCount: number;
  lastDeliveryAt: string | null;
```

`WebhookWithSecret` ya extiende `Webhook` y no necesita cambios: el `secret` que
declara es exactamente lo que devuelven la creación y la rotación.

Y exportar el verificador desde el índice del paquete. En `sdks/typescript/src/index.ts`, junto a las demás exportaciones:

```ts
export { verifyWebhook, type VerifyWebhookOptions } from "./webhooks.js";
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

```bash
cd sdks/typescript && bun test tests/webhooks.test.ts && bun run typecheck
```

Expected: PASS, 4 tests, typecheck limpio.

- [ ] **Step 6: Commit**

```bash
git add sdks/typescript/src/webhooks.ts sdks/typescript/src/client.ts sdks/typescript/src/types.ts sdks/typescript/src/index.ts sdks/typescript/tests/webhooks.test.ts
git commit -m "Give the SDK a webhook verifier, so nobody writes their own"
```

---

### Task 9: Documentación

**Files:**
- Modify: `docs-site/content/docs/realtime/webhooks.mdx`
- Modify: `docs/api/README.md` (bloque de la línea 1181)
- Modify: `docs/operations.md`
- Modify: `sdks/typescript/README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada de código.

- [ ] **Step 1: Reescribir la página de webhooks**

En `docs-site/content/docs/realtime/webhooks.mdx`, sustituir la sección de verificación (hoy documenta `X-Webhook-Signature`, que nunca ha existido) por las tres cabeceras reales, la cadena firmada, la tolerancia de cinco minutos y el ejemplo con el SDK:

```ts
import { verifyWebhook } from "@agentdialog/sdk";

app.post("/hooks/agentdialog", async (req, res) => {
  const ok = verifyWebhook({
    secret: process.env.AGENTDIALOG_WEBHOOK_SECRET!,
    body: req.rawBody,           // the raw bytes; a re-serialised body will not verify
    headers: req.headers,
  });

  if (!ok) return res.status(400).end();

  // Deduplicate on webhook-id: the same message may arrive more than once.
  res.status(200).end();
});
```

Documentar además que las entregas siguen Standard Webhooks, con enlace a `https://www.standardwebhooks.com`, y que cualquier verificador compatible sirve.

- [ ] **Step 2: Corregir la guía de la API**

En `docs/api/README.md`, sustituir el bloque de cabeceras de ejemplo de la línea 1181 por:

```
webhook-id: msg_2KWPBgLlAfxdpx2AI54pPJ85f4W
webhook-timestamp: 1674087231
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=
X-AgentDialog-Event: query.answered
```

Y documentar `POST /api/v1/agent/webhooks/:id/rotate-secret` junto al resto de operaciones de webhooks, siguiendo el formato del fichero.

- [ ] **Step 3: Documentar la operativa**

En `docs/operations.md`, en la sección de configuración y secretos, añadir `WEBHOOK_ENCRYPTION_KEY`: qué es, que va en Secret Manager como `SMTP_PASS`, cómo se genera (`openssl rand -base64 32`) y la consecuencia de perderla — se pierden todos los secretos de firma y la única recuperación es que cada agente llame a `rotate-secret`.

- [ ] **Step 4: Actualizar el README del SDK**

En `sdks/typescript/README.md`, añadir `verifyWebhook` y `rotateWebhookSecret` con el mismo ejemplo del Step 1. Es lo que npm renderiza, y un ejemplo obsoleto ahí es un fallo de confianza con el integrador.

- [ ] **Step 5: Verificar que no queda ninguna referencia a lo viejo**

```bash
grep -rn "X-Webhook-Signature\|X-AgentDialog-Signature\|secretHash" docs/ docs-site/content sdks/typescript/README.md
```

Expected: sin resultados.

- [ ] **Step 6: Construir los docs**

```bash
cd docs-site && npm run build
```

Expected: build limpio. `docs-site` usa **npm**, no Bun.

- [ ] **Step 7: Commit**

```bash
git add docs/ docs-site/content sdks/typescript/README.md
git commit -m "Document the signature that is actually sent"
```

---

## Verificación final

Antes de abrir el PR:

```bash
bun run typecheck
bunx biome check src/ tests/
bun test tests/unit tests/integration
cd sdks/typescript && bun test && bun run typecheck
cd ../../docs-site && npm run build
```

Y una comprobación que ninguna de las anteriores cubre: que un verificador de terceros acepta nuestras entregas. Con el receptor de la Task 7 levantado, verificar una entrega capturada con la librería `svix` instalada aparte, fuera del repo. Si esa falla y la nuestra pasa, el error está casi seguro en el punto del `Global Constraints`: estaremos firmando la cadena literal en vez de los bytes decodificados.
