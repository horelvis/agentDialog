# Ingesta de correo entrante por IMAP — Plan de implementación

> **ESTE PLAN SE EJECUTÓ Y LUEGO SE REVIRTIÓ.** Las siete tareas se completaron y
> pasaron su revisión; la revisión de rama completa encontró después tres fallos
> —dos de ellos no arreglables con más cuidado— y el andamio entero se retiró.
> Se conserva como registro del intento, no como trabajo pendiente. Ver
> `docs/operations.md`, sección «Inbound email: tried, measured, rejected».

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la respuesta de un humano a un email de query llegue al agente que preguntó, leyendo el buzón `agentdialog.app@gmail.com` por IMAP.

**Architecture:** Cloud Scheduler llama cada cinco minutos a `POST /api/v1/internal/email/poll`, autenticado con un secreto compartido en cabecera. El endpoint abre una conexión IMAP, y bajo un cerrojo en Redis recorre los mensajes no leídos: de cada uno extrae el `queryId` del destinatario (`agentdialog.app+{uuid}@gmail.com`), y se lo pasa a `processEmailReply`, la misma función que ya usa el webhook de proveedor. El acceso al buzón vive detrás de la interfaz `MailboxClient`, así que la ingesta entera se prueba con un doble, sin red y sin credenciales.

**Tech Stack:** Bun, Hono, Drizzle, ioredis, `imapflow`, `mailparser`, zod, `bun test`.

**Spec:** `docs/superpowers/specs/2026-08-20-inbound-email-ingestion-design.md`

## Global Constraints

- **Esto es un andamio con criterio de salida escrito.** Los tres ficheros nuevos —`src/lib/mailbox.ts`, `src/services/email-ingest.service.ts`, `src/routes/internal/email-poll.ts`— y el job de Cloud Scheduler se borran el día que haya un proveedor transaccional sobre dominio propio. No añadas nada fuera de esos tres ficheros que dependa de que la ingesta exista.
- **`processEmailReply` es el único punto de entrada al dominio.** Los dos caminos —webhook de proveedor e ingesta IMAP— entran por ahí. No dupliques lógica de respuesta en la ingesta.
- **Enviar correo es responsabilidad del llamante, no de `email-response.service.ts`.** Ese servicio devuelve el resultado; el aviso al remitente lo manda la ingesta.
- Código, comentarios y mensajes de commit **en inglés**. Este plan y la documentación del repositorio, en español.
- `bun run typecheck` en la raíz **falla con seis errores preexistentes en `src/mcp/server.ts`**. No son tuyos. Verifica tu trabajo con `bunx tsc --noEmit` y comprueba que no aparece ningún error nuevo fuera de ese fichero.
- Los tests de integración **no son herméticos**: el registro de agentes está limitado a 10 por hora y el contador vive en Redis, que sobrevive entre ejecuciones. Si ves `429` inesperados, `redis-cli -n 1 FLUSHDB` contra la base de datos de test.
- `tests/unit/` no puede tocar ni PostgreSQL ni Redis. Todo lo que necesite una de las dos va a `tests/integration/`.
- Prefijo de claves de agente: `mge_ag_`. Dominio: `agentdialog.io`, API en `api.agentdialog.io`. `agentdialog.com` y `agentdialog.dev` son incorrectos y no deben aparecer.
- Las variables de IMAP son **opcionales**: sin ellas nada del sistema cambia de comportamiento y el endpoint de sondeo responde 503.
- Trabaja en una rama a partir de `main` (`feat-inbound-email-imap`), una vez fusionado el PR #8 con el spec.

## Nota sobre una contradicción del spec, y cómo se resuelve

El spec dice dos cosas incompatibles sobre un mensaje del que no se puede sacar
un `queryId`:

- en la tabla de errores: «No se puede extraer el `queryId` → marcar leído»;
- en *Correo que no es una respuesta*: «El resto **no se toca ni se marca como
  leído**, para que el buzón siga siendo usable por una persona».

Y su lista de pruebas pide las dos: «mensaje sin `queryId` extraíble → marcado
como leído» y «correo ajeno en el buzón → ignorado y sin marcar».

Se resuelven partiendo el caso en dos, que es lo que ambas frases querían decir
por separado:

| Destinatario | Qué es | Qué se hace |
|---|---|---|
| `agentdialog.app+{uuid}@gmail.com` | una respuesta | procesar |
| `agentdialog.app+basura@gmail.com` | va dirigido a nosotros, pero es inservible | **marcar leído** — reintentar no lo arregla |
| cualquier otra dirección | correo ajeno | **no tocar** |

Esto obliga a que la extracción **valide la forma de UUID**, no solo que haya un
`+`. Con el regex permisivo del spec (`/\+([^@]+)@/`), un correo a
`agentdialog.app+newsletter@gmail.com` produciría el `queryId` `"newsletter"`,
`processEmailReply` devolvería `not_found`, y el mensaje acabaría marcado como
leído: exactamente el criterio de aceptación 3 incumplido. Los `queryId` son
`uuid.defaultRandom()` de PostgreSQL (`src/db/schema/human-queries.ts:9`), así
que validar la forma es gratis y cierra el agujero.

---

### Task 1: Direccionamiento de respuesta como módulo compartido

Hoy la dirección de respuesta se construye en un sitio
(`src/services/query-email.service.ts:45`) y se interpreta en otro
(`src/routes/webhooks/email-inbound.ts:170`), con dos literales que tienen que
coincidir y no lo verifica nada. Esta tarea los junta en un módulo con las dos
mitades juntas, generaliza la parte local a una variable de entorno, y valida la
forma del `queryId`.

**Files:**
- Create: `src/lib/reply-address.ts`
- Create: `tests/unit/reply-address.test.ts`
- Modify: `src/env.ts:46` (añadir `REPLY_LOCAL_PART`)
- Modify: `src/services/query-email.service.ts:45`
- Modify: `src/routes/webhooks/email-inbound.ts:107-112,167-173`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `buildReplyToAddress(queryId: string, config?: ReplyAddressConfig): string`
  - `classifyRecipient(address: string, config?: ReplyAddressConfig): RecipientMatch`
  - `classifyRecipients(addresses: string[], config?: ReplyAddressConfig): RecipientMatch`
  - `extractBareAddress(input: string): string | null`
  - `replyAddressConfig(): ReplyAddressConfig`
  - `type RecipientMatch = { kind: "reply"; queryId: string } | { kind: "malformed" } | { kind: "foreign" }`
  - `interface ReplyAddressConfig { localPart: string; domain: string }`
  - Variable de entorno `REPLY_LOCAL_PART`, por defecto `"reply"`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/unit/reply-address.test.ts`. Los tests pasan la configuración
explícitamente, para no depender de las variables de entorno del proceso:

```ts
import { describe, expect, it } from "bun:test";
import {
  buildReplyToAddress,
  classifyRecipient,
  classifyRecipients,
  extractBareAddress,
} from "../../src/lib/reply-address";

/**
 * The query id travels in the Reply-To address and comes back in the To header
 * of the human's reply. Building and reading that address are two halves of one
 * contract, so they live in one module and are tested against each other.
 */

const gmail = { localPart: "agentdialog.app", domain: "gmail.com" };
const own = { localPart: "reply", domain: "reply.agentdialog.io" };

const QUERY_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("buildReplyToAddress", () => {
  it("builds a plus address from the configured local part and domain", () => {
    expect(buildReplyToAddress(QUERY_ID, gmail)).toBe(
      `agentdialog.app+${QUERY_ID}@gmail.com`,
    );
    expect(buildReplyToAddress(QUERY_ID, own)).toBe(
      `reply+${QUERY_ID}@reply.agentdialog.io`,
    );
  });
});

describe("classifyRecipient", () => {
  it("round-trips an address it built itself", () => {
    for (const config of [gmail, own]) {
      const built = buildReplyToAddress(QUERY_ID, config);
      expect(classifyRecipient(built, config)).toEqual({
        kind: "reply",
        queryId: QUERY_ID,
      });
    }
  });

  it("reads the address out of a display-name header", () => {
    const header = `AgentDialog <${buildReplyToAddress(QUERY_ID, gmail)}>`;
    expect(classifyRecipient(header, gmail)).toEqual({
      kind: "reply",
      queryId: QUERY_ID,
    });
  });

  it("ignores case in the local part and the domain", () => {
    expect(
      classifyRecipient(`AgentDialog.App+${QUERY_ID.toUpperCase()}@GMAIL.COM`, gmail),
    ).toEqual({ kind: "reply", queryId: QUERY_ID });
  });

  // A tag that is not a query id is addressed to us but unusable. Retrying it
  // will never work, so the caller marks it read rather than looping forever.
  it("reports a plus tag that is not a query id as malformed", () => {
    expect(classifyRecipient("agentdialog.app+newsletter@gmail.com", gmail)).toEqual({
      kind: "malformed",
    });
    expect(classifyRecipient("agentdialog.app+@gmail.com", gmail)).toEqual({
      kind: "malformed",
    });
    expect(classifyRecipient("agentdialog.app+not-a-uuid-at-all@gmail.com", gmail)).toEqual({
      kind: "malformed",
    });
  });

  // Anything else is somebody else's mail. The mailbox belongs to a person too.
  it("reports mail that is not addressed to the reply alias as foreign", () => {
    expect(classifyRecipient("agentdialog.app@gmail.com", gmail)).toEqual({ kind: "foreign" });
    expect(classifyRecipient("someone@example.com", gmail)).toEqual({ kind: "foreign" });
    expect(classifyRecipient(`support+${QUERY_ID}@gmail.com`, gmail)).toEqual({ kind: "foreign" });
    expect(classifyRecipient(`agentdialog.app+${QUERY_ID}@example.com`, gmail)).toEqual({
      kind: "foreign",
    });
    expect(classifyRecipient("not an address", gmail)).toEqual({ kind: "foreign" });
    expect(classifyRecipient("", gmail)).toEqual({ kind: "foreign" });
  });
});

describe("classifyRecipients", () => {
  it("finds the reply address among several recipients", () => {
    const result = classifyRecipients(
      ["someone@example.com", buildReplyToAddress(QUERY_ID, gmail), "cc@example.com"],
      gmail,
    );
    expect(result).toEqual({ kind: "reply", queryId: QUERY_ID });
  });

  it("prefers a usable reply address over a malformed one", () => {
    const result = classifyRecipients(
      ["agentdialog.app+junk@gmail.com", buildReplyToAddress(QUERY_ID, gmail)],
      gmail,
    );
    expect(result).toEqual({ kind: "reply", queryId: QUERY_ID });
  });

  it("reports malformed when the only address of ours is unusable", () => {
    expect(
      classifyRecipients(["boss@example.com", "agentdialog.app+junk@gmail.com"], gmail),
    ).toEqual({ kind: "malformed" });
  });

  it("reports foreign when none of the addresses is ours", () => {
    expect(classifyRecipients(["a@example.com", "b@example.com"], gmail)).toEqual({
      kind: "foreign",
    });
    expect(classifyRecipients([], gmail)).toEqual({ kind: "foreign" });
  });
});

describe("extractBareAddress", () => {
  it("strips a display name", () => {
    expect(extractBareAddress("Ada Lovelace <ada@example.com>")).toBe("ada@example.com");
  });

  it("passes a bare address through, trimmed", () => {
    expect(extractBareAddress("  ada@example.com ")).toBe("ada@example.com");
  });

  it("returns null for something that is not an address", () => {
    expect(extractBareAddress("undisclosed-recipients")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `bun test tests/unit/reply-address.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/reply-address'`

- [ ] **Step 3: Añadir `REPLY_LOCAL_PART` al esquema de entorno**

En `src/env.ts`, junto a `REPLY_DOMAIN` (línea 46):

```ts
  REPLY_DOMAIN: z.string().default("reply.agentdialog.io"),
  // The local part of the reply address. Defaults to "reply" so today's
  // behaviour is unchanged; production sets it to the Gmail account name while
  // the mailbox is a Gmail inbox reached by plus addressing.
  REPLY_LOCAL_PART: z.string().default("reply"),
  INBOUND_EMAIL_WEBHOOK_SECRET: z.string().optional(),
```

- [ ] **Step 4: Escribir la implementación**

Crea `src/lib/reply-address.ts`:

```ts
import { env } from "../env";

/**
 * Building the Reply-To address and reading the query id back out of the
 * human's reply are two halves of one contract. They used to live in two files
 * — the sender in query-email.service.ts, the reader in the inbound webhook —
 * with two literals that had to agree and nothing checking that they did.
 */

export interface ReplyAddressConfig {
  localPart: string;
  domain: string;
}

export type RecipientMatch =
  | { kind: "reply"; queryId: string }
  | { kind: "malformed" }
  | { kind: "foreign" };

/**
 * Query ids are `uuid.defaultRandom()` values (db/schema/human-queries.ts).
 * Validating the shape is what keeps somebody else's mail to
 * `<account>+newsletter@gmail.com` from being read as a reply, looked up,
 * missed, and marked read — quietly consuming mail the mailbox owner wanted.
 */
const QUERY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function replyAddressConfig(): ReplyAddressConfig {
  const e = env();
  return { localPart: e.REPLY_LOCAL_PART, domain: e.REPLY_DOMAIN };
}

export function buildReplyToAddress(
  queryId: string,
  config: ReplyAddressConfig = replyAddressConfig(),
): string {
  return `${config.localPart}+${queryId}@${config.domain}`;
}

/** Pull the bare address out of `Name <addr>` or a plain address. */
export function extractBareAddress(input: string): string | null {
  const angled = input.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : input).trim();
  return candidate.includes("@") ? candidate : null;
}

export function classifyRecipient(
  address: string,
  config: ReplyAddressConfig = replyAddressConfig(),
): RecipientMatch {
  const bare = extractBareAddress(address);
  if (!bare) return { kind: "foreign" };

  const at = bare.lastIndexOf("@");
  if (at <= 0) return { kind: "foreign" };

  const local = bare.slice(0, at).toLowerCase();
  const domain = bare.slice(at + 1).toLowerCase();
  if (domain !== config.domain.toLowerCase()) return { kind: "foreign" };

  const plus = local.indexOf("+");
  if (plus === -1) return { kind: "foreign" };
  if (local.slice(0, plus) !== config.localPart.toLowerCase()) {
    return { kind: "foreign" };
  }

  const tag = local.slice(plus + 1);
  return QUERY_ID_PATTERN.test(tag)
    ? { kind: "reply", queryId: tag }
    : { kind: "malformed" };
}

/**
 * Classify every recipient of a message and report the most actionable result:
 * a usable reply address wins over a malformed one, which wins over none.
 * A reply can arrive with the alias in Cc rather than To.
 */
export function classifyRecipients(
  addresses: string[],
  config: ReplyAddressConfig = replyAddressConfig(),
): RecipientMatch {
  let sawMalformed = false;
  for (const address of addresses) {
    const match = classifyRecipient(address, config);
    if (match.kind === "reply") return match;
    if (match.kind === "malformed") sawMalformed = true;
  }
  return sawMalformed ? { kind: "malformed" } : { kind: "foreign" };
}
```

- [ ] **Step 5: Ejecutar el test y comprobar que pasa**

Run: `bun test tests/unit/reply-address.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 6: Usar el módulo al construir el `Reply-To`**

En `src/services/query-email.service.ts`, añade el import y sustituye la línea 45:

```ts
import { buildReplyToAddress } from "../lib/reply-address";
```

```ts
  const e = env();
  const replyTo = buildReplyToAddress(input.queryId);
```

- [ ] **Step 7: Usar el módulo al leer el `queryId` en el webhook**

En `src/routes/webhooks/email-inbound.ts`, añade el import:

```ts
import { classifyRecipient } from "../../lib/reply-address";
```

Sustituye el bloque 3 (líneas 107-112) por:

```ts
  // 3. Extract queryId from the reply address
  const match = classifyRecipient(toAddress);
  if (match.kind !== "reply") {
    console.warn(
      `[EMAIL-INBOUND] Not a reply address (${match.kind}): ${toAddress}`,
    );
    return c.json({ ok: true }); // Don't retry
  }
  const queryId = match.queryId;
```

Y **borra** la función local `extractQueryId` (líneas 167-173) junto con su
comentario. Su regex `reply\+([^@]+)@` devolvía `null` para cualquier dirección
que no empezara literalmente por `reply+`, así que en cuanto la parte local sea
`agentdialog.app` este camino habría descartado la respuesta en silencio.

- [ ] **Step 8: Documentar la variable en `.env.example`**

Sustituye la sección `# Email (for verification codes)` por esta, que además
corrige `agentdialog.dev` —un dominio purgado del proyecto— en `SMTP_FROM`:

```
# Email (SMTP, outbound)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@agentdialog.io

# Reply addressing: queries are answered by replying to
# {REPLY_LOCAL_PART}+{queryId}@{REPLY_DOMAIN}
REPLY_LOCAL_PART=reply
REPLY_DOMAIN=reply.agentdialog.io
```

- [ ] **Step 9: Ejecutar toda la suite unitaria y el typecheck**

Run: `bun test tests/unit`
Expected: PASS, sin regresiones

Run: `bunx tsc --noEmit`
Expected: solo los seis errores preexistentes de `src/mcp/server.ts`

- [ ] **Step 10: Commit**

```bash
git add src/lib/reply-address.ts tests/unit/reply-address.test.ts src/env.ts \
  src/services/query-email.service.ts src/routes/webhooks/email-inbound.ts .env.example
git commit -m "Make the reply address one module instead of two literals

Building the Reply-To and reading the query id back out of it were in two
files with matching literals and nothing checking they matched. The reader
also hardcoded the local part as \"reply\", so any other mailbox name would
have dropped replies silently.

The query id is now validated as a UUID, which separates mail addressed to
us but unusable from mail that is simply somebody else's."
```

---

### Task 2: Rechazar respuestas de un remitente que no es el destinatario

Hoy `email-response.service.ts:53-60` comprueba el remitente y, si no coincide,
**deja un `console.warn` y sigue adelante**: crea el humano, acepta la
invitación en su nombre y registra la respuesta. Cualquiera a quien le reenvíen
el correo puede responder en nombre del destinatario, y el agente recibe esa
respuesta como si fuera legítima.

**Files:**
- Modify: `src/services/email-response.service.ts:19-24,53-60`
- Create: `tests/integration/email-reply.test.ts`

**Interfaces:**
- Consumes: Task 1 (`buildReplyToAddress`), aunque solo indirectamente.
- Produces: `ProcessEmailReplyResult` gana la variante `{ sender_mismatch: true }`.
  Los llamantes de Task 4 dependen de ese nombre exacto.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/email-reply.test.ts`. Necesita PostgreSQL y Redis
levantados y la base `agentdialog_test` migrada.

```ts
import { describe, expect, it } from "bun:test";
import { createTestApp, createTestAgent } from "../helpers";
import { processEmailReply } from "../../src/services/email-response.service";

/**
 * The sender check used to warn and carry on, so anyone the query email was
 * forwarded to could answer in the target's name and the agent could not tell.
 */

async function createQuery(targetEmail: string) {
  const app = createTestApp();
  const { authHeader } = await createTestAgent();
  const res = await app.request("/api/v1/agent/queries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      query_type: "validation",
      question: "Is this reply from the right person?",
      target_human_email: targetEmail,
      timeout_minutes: 60,
    }),
  });
  expect(res.status).toBe(201);
  const { data } = await res.json();
  return { app, authHeader, queryId: data.query_id as string };
}

describe("processEmailReply sender verification", () => {
  it("rejects a reply from someone other than the target and leaves the query alone", async () => {
    const target = `target-${Date.now()}@example.com`;
    const { app, authHeader, queryId } = await createQuery(target);

    const result = await processEmailReply({
      queryId,
      senderEmail: `intruder-${Date.now()}@example.com`,
      replyText: "Yes, ship it.",
    });

    expect(result).toEqual({ sender_mismatch: true });

    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      headers: { Authorization: authHeader },
    });
    const { data } = await res.json();
    expect(data.status).toBe("pending");
    expect(data.answer).toBeNull();
  });

  it("accepts a reply from the target, and is idempotent afterwards", async () => {
    const target = `target-${Date.now()}-ok@example.com`;
    const { app, authHeader, queryId } = await createQuery(target);

    const result = await processEmailReply({
      queryId,
      senderEmail: target,
      replyText: "Yes, ship it.",
    });
    expect(result).toEqual({ success: true, query_id: queryId });

    const res = await app.request(`/api/v1/agent/queries/${queryId}`, {
      headers: { Authorization: authHeader },
    });
    const { data } = await res.json();
    expect(data.status).toBe("answered");
    expect(data.answer).toBe("Yes, ship it.");

    // A second pass over the same message must not disturb the answer.
    const again = await processEmailReply({
      queryId,
      senderEmail: target,
      replyText: "Yes, ship it.",
    });
    expect(again).toEqual({ already_answered: true });
  });

  it("ignores case and surrounding whitespace when comparing addresses", async () => {
    const target = `target-${Date.now()}-case@example.com`;
    const { queryId } = await createQuery(target);

    const result = await processEmailReply({
      queryId,
      senderEmail: `  ${target.toUpperCase()} `,
      replyText: "Fine by me.",
    });
    expect(result).toEqual({ success: true, query_id: queryId });
  });

  it("reports a query that does not exist", async () => {
    const result = await processEmailReply({
      queryId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      senderEmail: "someone@example.com",
      replyText: "Hello?",
    });
    expect(result).toEqual({ not_found: true });
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Levanta las dependencias si no lo están:

```bash
docker compose -f docker-compose.dev.yml up -d postgres redis
redis-cli -n 1 FLUSHDB
```

Run: `bun test tests/integration/email-reply.test.ts`
Expected: FAIL en el primer test — el resultado es `{ success: true, ... }` y la
query aparece como `answered`, porque hoy el remitente distinto se acepta.

- [ ] **Step 3: Escribir la implementación**

En `src/services/email-response.service.ts`, añade la variante al tipo de
resultado (líneas 19-24):

```ts
type ProcessEmailReplyResult =
  | { success: true; query_id: string }
  | { already_answered: true }
  | { expired: true }
  | { empty_reply: true }
  | { sender_mismatch: true }
  | { not_found: true };
```

Y sustituye el bloque 2 (líneas 53-60) por:

```ts
  // 2. Verify the sender is the person the question was addressed to.
  //
  // This used to warn and carry on, which meant anyone the query email had been
  // forwarded to could answer in the target's name — creating them as a human,
  // accepting the invitation on their behalf and recording the answer — with
  // nothing on the agent's side to tell the two apart.
  //
  // The mismatch is not reported to the caller in any more detail than this:
  // the target's address must not leak to whoever sent the message.
  const normalizedSender = input.senderEmail.toLowerCase().trim();
  const normalizedTarget = query.humanEmail.toLowerCase().trim();
  if (normalizedSender !== normalizedTarget) {
    console.warn(
      `[EMAIL-REPLY] Rejected reply to query ${input.queryId}: sender is not the target`,
    );
    return { sender_mismatch: true };
  }
```

El aviso al remitente **no se envía desde aquí**: aquí vive la lógica de dominio
y mandar correo es un efecto de la capa de arriba. Lo envía la ingesta (Task 4).

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `bun test tests/integration/email-reply.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Comprobar que el webhook sigue compilando y no rompe**

`src/routes/webhooks/email-inbound.ts:123` hace `return c.json({ ok: true, ...result })`,
así que la variante nueva viaja sola sin cambios. Confírmalo:

Run: `bunx tsc --noEmit`
Expected: solo los seis errores preexistentes de `src/mcp/server.ts`

Run: `bun test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/email-response.service.ts tests/integration/email-reply.test.ts
git commit -m "Reject an email reply whose sender is not the query's target

The check was permissive: it logged the mismatch and then created the human,
auto-accepted the invitation in the target's name and recorded the answer.
Anyone the query email was forwarded to could answer as the target.

The result says only that the sender did not match, never who the target is."
```

---

### Task 3: Acceso al buzón detrás de una interfaz

**Files:**
- Create: `src/lib/mailbox.ts`
- Create: `tests/unit/mailbox-parse.test.ts`
- Modify: `package.json` (dependencias)
- Possibly create: `src/types/imapflow.d.ts` (solo si `imapflow` no trae tipos)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `interface MailboxMessage { uid: number; recipients: string[]; from: string; text: string }`
  - `interface MailboxClient { listUnread(): Promise<number[]>; fetch(uid: number): Promise<MailboxMessage | null>; markRead(uid: number): Promise<void>; close(): Promise<void> }`
  - `interface ImapConfig { host: string; port: number; user: string; password: string }`
  - `parseRawMessage(uid: number, source: Buffer | string): Promise<MailboxMessage | null>`
  - `imapConfig(): ImapConfig | null`
  - `openMailbox(config: ImapConfig): Promise<MailboxClient>`
  - Task 4 depende de `MailboxClient` y `MailboxMessage`; Task 6, de `imapConfig` y `openMailbox`.

- [ ] **Step 1: Instalar las dependencias**

Ambas son del autor de `nodemailer`, que el proyecto ya usa para enviar.

```bash
bun add imapflow mailparser
bun add -d @types/mailparser
```

Comprueba que `imapflow` trae sus propios tipos:

```bash
ls node_modules/imapflow/*.d.ts node_modules/imapflow/lib/*.d.ts 2>/dev/null
```

Si no aparece ningún `.d.ts`, crea `src/types/imapflow.d.ts` con lo mínimo que
usa este código, y nada más:

```ts
declare module "imapflow" {
  export interface ImapFlowOptions {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    logger?: false;
  }
  export interface MailboxLockObject {
    release(): void;
  }
  export class ImapFlow {
    constructor(options: ImapFlowOptions);
    connect(): Promise<void>;
    logout(): Promise<void>;
    close(): void;
    getMailboxLock(path: string): Promise<MailboxLockObject>;
    search(query: Record<string, unknown>, options?: { uid?: boolean }): Promise<number[] | false>;
    fetchOne(
      range: string,
      query: Record<string, unknown>,
      options?: { uid?: boolean },
    ): Promise<{ source?: Buffer } | false>;
    messageFlagsAdd(
      range: string,
      flags: string[],
      options?: { uid?: boolean },
    ): Promise<boolean>;
  }
}
```

- [ ] **Step 2: Escribir el test que falla**

`parseRawMessage` es la parte del cliente que no necesita red: convierte un
mensaje crudo en lo que la ingesta consume. Crea `tests/unit/mailbox-parse.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { parseRawMessage } from "../../src/lib/mailbox";

/**
 * The IMAP transport is verified by hand against the real mailbox once. What is
 * worth testing here is the translation from a raw RFC822 message to the three
 * fields the ingest actually uses.
 */

const QUERY_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function raw(headers: string, body: string): string {
  return `${headers}\r\n\r\n${body}\r\n`;
}

describe("parseRawMessage", () => {
  it("extracts the sender, the recipients and the plain text body", async () => {
    const message = raw(
      [
        `From: Ada Lovelace <ada@example.com>`,
        `To: AgentDialog <agentdialog.app+${QUERY_ID}@gmail.com>`,
        `Subject: Re: [AgentDialog] Should we deploy on a Friday?`,
        `Content-Type: text/plain; charset=utf-8`,
      ].join("\r\n"),
      "No. Wait until Monday.",
    );

    const parsed = await parseRawMessage(42, message);

    expect(parsed).not.toBeNull();
    expect(parsed!.uid).toBe(42);
    expect(parsed!.from).toBe("ada@example.com");
    expect(parsed!.recipients).toContain(`agentdialog.app+${QUERY_ID}@gmail.com`);
    expect(parsed!.text.trim()).toBe("No. Wait until Monday.");
  });

  it("includes Cc recipients, because the reply alias can land there", async () => {
    const message = raw(
      [
        `From: ada@example.com`,
        `To: boss@example.com`,
        `Cc: agentdialog.app+${QUERY_ID}@gmail.com`,
        `Content-Type: text/plain; charset=utf-8`,
      ].join("\r\n"),
      "Answering here.",
    );

    const parsed = await parseRawMessage(7, message);
    expect(parsed!.recipients).toEqual(
      expect.arrayContaining(["boss@example.com", `agentdialog.app+${QUERY_ID}@gmail.com`]),
    );
  });

  it("lowercases the sender so the caller compares like with like", async () => {
    const message = raw(
      [`From: ADA@Example.COM`, `To: agentdialog.app@gmail.com`].join("\r\n"),
      "Hi",
    );
    const parsed = await parseRawMessage(1, message);
    expect(parsed!.from).toBe("ada@example.com");
  });

  it("falls back to an empty body rather than failing", async () => {
    const message = raw([`From: ada@example.com`, `To: agentdialog.app@gmail.com`].join("\r\n"), "");
    const parsed = await parseRawMessage(1, message);
    expect(parsed!.text).toBe("");
  });

  it("returns null when there is no sender to attribute the reply to", async () => {
    const message = raw([`To: agentdialog.app@gmail.com`].join("\r\n"), "Anonymous");
    expect(await parseRawMessage(1, message)).toBeNull();
  });
});
```

- [ ] **Step 3: Ejecutar el test y comprobar que falla**

Run: `bun test tests/unit/mailbox-parse.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/mailbox'`

- [ ] **Step 4: Escribir la implementación**

Crea `src/lib/mailbox.ts`:

```ts
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { env } from "../env";

/**
 * Reading the mailbox is a scaffold. It is behind an interface so the ingest
 * service can be tested whole with a double — no network, no credentials — and
 * so removing it the day a transactional provider posts to the inbound webhook
 * is deleting a file rather than unpicking a service.
 *
 * Nothing here is specific to Gmail, which is why it is not called GmailClient.
 */

export interface MailboxMessage {
  uid: number;
  /** Every To and Cc address, as written in the headers. */
  recipients: string[];
  /** The sender, lowercased. */
  from: string;
  /** The plain text body, before quote stripping. */
  text: string;
}

export interface MailboxClient {
  listUnread(): Promise<number[]>;
  fetch(uid: number): Promise<MailboxMessage | null>;
  markRead(uid: number): Promise<void>;
  close(): Promise<void>;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

/**
 * The IMAP settings, or null when the mailbox is not configured. Null is a
 * supported state: without it the poll endpoint answers 503 and nothing else
 * in the system behaves differently.
 */
export function imapConfig(): ImapConfig | null {
  const e = env();
  if (!e.IMAP_HOST || !e.IMAP_USER || !e.IMAP_PASSWORD) return null;
  return {
    host: e.IMAP_HOST,
    port: e.IMAP_PORT,
    user: e.IMAP_USER,
    password: e.IMAP_PASSWORD,
  };
}

function addressList(field: AddressObject | AddressObject[] | undefined): string[] {
  if (!field) return [];
  const objects = Array.isArray(field) ? field : [field];
  return objects.flatMap((o) =>
    (o.value ?? []).map((v) => v.address).filter((a): a is string => Boolean(a)),
  );
}

export async function parseRawMessage(
  uid: number,
  source: Buffer | string,
): Promise<MailboxMessage | null> {
  const parsed = await simpleParser(source);

  const from = parsed.from?.value?.[0]?.address;
  if (!from) return null;

  return {
    uid,
    recipients: [...addressList(parsed.to), ...addressList(parsed.cc)],
    from: from.toLowerCase(),
    text: parsed.text ?? "",
  };
}

/**
 * Connect to the mailbox and hold the INBOX lock for the life of the client.
 * Gmail cuts off around fifteen simultaneous IMAP connections, so a pass opens
 * exactly one and the caller always closes it.
 */
export async function openMailbox(config: ImapConfig): Promise<MailboxClient> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  return {
    async listUnread() {
      const uids = await client.search({ seen: false }, { uid: true });
      return uids === false ? [] : uids;
    },

    async fetch(uid: number) {
      const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!message || !message.source) return null;
      return parseRawMessage(uid, message.source);
    },

    async markRead(uid: number) {
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    },

    async close() {
      lock.release();
      await client.logout().catch(() => client.close());
    },
  };
}
```

- [ ] **Step 5: Ejecutar el test y comprobar que pasa**

Run: `bun test tests/unit/mailbox-parse.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Añadir las variables de IMAP al esquema de entorno**

Sin ellas `imapConfig()` no compila. En `src/env.ts`, tras `INBOUND_EMAIL_PROVIDER`
(línea 48):

```ts
  INBOUND_EMAIL_PROVIDER: z.enum(["resend", "sendgrid"]).default("resend"),

  // Inbound mailbox, read over IMAP. Optional on purpose: with these unset the
  // poll endpoint answers 503 and nothing else changes behaviour. This is the
  // bridge until a transactional provider posts to the inbound webhook.
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().default(993),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),
```

Run: `bunx tsc --noEmit`
Expected: solo los seis errores preexistentes de `src/mcp/server.ts`

- [ ] **Step 7: Commit**

```bash
git add src/lib/mailbox.ts tests/unit/mailbox-parse.test.ts src/env.ts \
  package.json bun.lock src/types/imapflow.d.ts
git commit -m "Read the mailbox behind a MailboxClient interface

imapflow and mailparser, both from the author of nodemailer, which this
project already uses to send. Message parsing is tested against raw RFC822
fixtures; the transport itself is verified by hand against the mailbox once.

Nothing in it is specific to Gmail, so it is not called GmailClient."
```

(Omite `src/types/imapflow.d.ts` del `git add` si el Step 1 no lo necesitó.)

---

### Task 4: El servicio de ingesta

El corazón del trabajo, y la única pieza cuya lógica de decisión puede
equivocarse de forma cara: confundir un fallo permanente con uno transitorio da
o un bucle cada cinco minutos, o una respuesta perdida para siempre.

**Files:**
- Create: `src/services/email-ingest.service.ts`
- Create: `tests/unit/email-ingest.test.ts`
- Modify: `src/services/query-email.service.ts` (añadir `sendSenderMismatchNotice`)

**Interfaces:**
- Consumes: `MailboxClient`, `MailboxMessage` (Task 3); `classifyRecipients`
  (Task 1); `processEmailReply` y `{ sender_mismatch: true }` (Task 2).
- Produces:
  - `interface IngestSummary { scanned, processed, rejected, dropped, skipped, deferred: number }`
  - `interface IngestDeps { config?: ReplyAddressConfig; processReply?: typeof processEmailReply; notifySenderMismatch?: (toEmail: string) => Promise<unknown> }`
  - `ingestPendingReplies(client: MailboxClient, deps?: IngestDeps): Promise<IngestSummary>`
  - `sendSenderMismatchNotice(toEmail: string): Promise<boolean>` en `query-email.service.ts`
  - Task 5 envuelve `ingestPendingReplies`; Task 6 llama a lo que Task 5 produce.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/unit/email-ingest.test.ts`. Es el test más importante del plan:
cubre la tabla de permanente-frente-a-transitorio entera, y no toca ni red ni
base de datos.

```ts
import { describe, expect, it } from "bun:test";
import { ingestPendingReplies } from "../../src/services/email-ingest.service";
import type { MailboxClient, MailboxMessage } from "../../src/lib/mailbox";

/**
 * The whole ingest runs against a double. What it decides per message is the
 * expensive thing to get wrong: treat a transient failure as permanent and the
 * answer is lost for good; treat a permanent one as transient and the mailbox
 * loops on it every five minutes forever.
 */

const QUERY_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const CONFIG = { localPart: "agentdialog.app", domain: "gmail.com" };

function message(overrides: Partial<MailboxMessage> = {}): MailboxMessage {
  return {
    uid: 1,
    recipients: [`agentdialog.app+${QUERY_ID}@gmail.com`],
    from: "ada@example.com",
    text: "No. Wait until Monday.",
    ...overrides,
  };
}

class FakeMailbox implements MailboxClient {
  readonly read: number[] = [];
  closed = false;

  constructor(private readonly messages: MailboxMessage[]) {}

  async listUnread() {
    return this.messages.map((m) => m.uid);
  }
  async fetch(uid: number) {
    return this.messages.find((m) => m.uid === uid) ?? null;
  }
  async markRead(uid: number) {
    this.read.push(uid);
  }
  async close() {
    this.closed = true;
  }
}

/** Records what the ingest asked of the domain, and answers what the test wants. */
function fakeDeps(
  reply: (input: { queryId: string; senderEmail: string; replyText: string }) => Promise<any>,
) {
  const notified: string[] = [];
  const calls: Array<{ queryId: string; senderEmail: string; replyText: string }> = [];
  return {
    notified,
    calls,
    deps: {
      config: CONFIG,
      processReply: async (input: any) => {
        calls.push(input);
        return reply(input);
      },
      notifySenderMismatch: async (to: string) => {
        notified.push(to);
      },
    },
  };
}

describe("ingestPendingReplies", () => {
  it("processes a valid reply and marks it read", async () => {
    const mailbox = new FakeMailbox([message()]);
    const { deps, calls } = fakeDeps(async () => ({ success: true, query_id: QUERY_ID }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(calls).toEqual([
      { queryId: QUERY_ID, senderEmail: "ada@example.com", replyText: "No. Wait until Monday." },
    ]);
    expect(mailbox.read).toEqual([1]);
    expect(summary).toEqual({
      scanned: 1, processed: 1, rejected: 0, dropped: 0, skipped: 0, deferred: 0,
    });
  });

  // Addressed to us, but the tag is not a query id. Retrying cannot fix it.
  it("marks a malformed reply address read without processing it", async () => {
    const mailbox = new FakeMailbox([
      message({ recipients: ["agentdialog.app+not-a-query@gmail.com"] }),
    ]);
    const { deps, calls } = fakeDeps(async () => ({ success: true, query_id: QUERY_ID }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(calls).toEqual([]);
    expect(mailbox.read).toEqual([1]);
    expect(summary.dropped).toBe(1);
  });

  // The mailbox belongs to a person as well. Their mail must survive the pass.
  it("leaves foreign mail untouched and unread", async () => {
    const mailbox = new FakeMailbox([
      message({ recipients: ["agentdialog.app@gmail.com"] }),
      message({ uid: 2, recipients: ["someone-else@example.com"] }),
    ]);
    const { deps, calls } = fakeDeps(async () => ({ success: true, query_id: QUERY_ID }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(calls).toEqual([]);
    expect(mailbox.read).toEqual([]);
    expect(summary).toEqual({
      scanned: 2, processed: 0, rejected: 0, dropped: 0, skipped: 2, deferred: 0,
    });
  });

  it("marks a reply to a query that does not exist read", async () => {
    const mailbox = new FakeMailbox([message()]);
    const { deps } = fakeDeps(async () => ({ not_found: true }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(mailbox.read).toEqual([1]);
    expect(summary.dropped).toBe(1);
  });

  it("marks an already answered query read and does nothing else", async () => {
    const mailbox = new FakeMailbox([message()]);
    const { deps, notified } = fakeDeps(async () => ({ already_answered: true }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(mailbox.read).toEqual([1]);
    expect(notified).toEqual([]);
    expect(summary.dropped).toBe(1);
  });

  it("marks an expired query read", async () => {
    const mailbox = new FakeMailbox([message()]);
    const { deps } = fakeDeps(async () => ({ expired: true }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(mailbox.read).toEqual([1]);
    expect(summary.dropped).toBe(1);
  });

  it("notifies the sender of a mismatch, and marks the message read", async () => {
    const mailbox = new FakeMailbox([message({ from: "intruder@example.com" })]);
    const { deps, notified } = fakeDeps(async () => ({ sender_mismatch: true }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(notified).toEqual(["intruder@example.com"]);
    expect(mailbox.read).toEqual([1]);
    expect(summary).toEqual({
      scanned: 1, processed: 0, rejected: 1, dropped: 0, skipped: 0, deferred: 0,
    });
  });

  // The one case where the message must survive: five minutes later it works.
  it("leaves a message unread when processing fails transiently", async () => {
    const mailbox = new FakeMailbox([message()]);
    const { deps } = fakeDeps(async () => {
      throw new Error("connection terminated unexpectedly");
    });

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(mailbox.read).toEqual([]);
    expect(summary).toEqual({
      scanned: 1, processed: 0, rejected: 0, dropped: 0, skipped: 0, deferred: 1,
    });
  });

  it("keeps going after one message fails", async () => {
    const mailbox = new FakeMailbox([
      message({ uid: 1 }),
      message({ uid: 2, text: "boom" }),
      message({ uid: 3 }),
    ]);
    const { deps } = fakeDeps(async (input) => {
      if (input.replyText === "boom") throw new Error("db down");
      return { success: true, query_id: QUERY_ID };
    });

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(mailbox.read).toEqual([1, 3]);
    expect(summary).toEqual({
      scanned: 3, processed: 2, rejected: 0, dropped: 0, skipped: 0, deferred: 1,
    });
  });

  it("defers a message it cannot fetch", async () => {
    const mailbox = new FakeMailbox([]);
    // listUnread reports a uid that fetch cannot return.
    mailbox.listUnread = async () => [99];
    const { deps, calls } = fakeDeps(async () => ({ success: true, query_id: QUERY_ID }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(calls).toEqual([]);
    expect(mailbox.read).toEqual([]);
    expect(summary.deferred).toBe(1);
  });

  it("does not fail the pass when the mismatch notice cannot be sent", async () => {
    const mailbox = new FakeMailbox([message({ from: "intruder@example.com" })]);
    const summary = await ingestPendingReplies(mailbox, {
      config: CONFIG,
      processReply: async () => ({ sender_mismatch: true }),
      notifySenderMismatch: async () => {
        throw new Error("smtp down");
      },
    });

    expect(mailbox.read).toEqual([1]);
    expect(summary.rejected).toBe(1);
  });

  it("reports an empty mailbox without touching anything", async () => {
    const mailbox = new FakeMailbox([]);
    const { deps } = fakeDeps(async () => ({ success: true, query_id: QUERY_ID }));

    const summary = await ingestPendingReplies(mailbox, deps);

    expect(summary).toEqual({
      scanned: 0, processed: 0, rejected: 0, dropped: 0, skipped: 0, deferred: 0,
    });
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `bun test tests/unit/email-ingest.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/email-ingest.service'`

- [ ] **Step 3: Escribir el aviso al remitente equivocado**

En `src/services/query-email.service.ts`, al final del fichero:

```ts
/**
 * Tell whoever replied that the question was not addressed to them.
 *
 * The notice deliberately does not name the query, the question or the person
 * it was meant for: the sender has already shown they are not that person.
 * Silence would be worse — a reply that vanishes with no explanation reads as a
 * broken product — but this is all that can safely be said.
 */
export async function sendSenderMismatchNotice(toEmail: string): Promise<boolean> {
  const e = env();

  return sendEmail({
    to: toEmail,
    subject: `[${e.APP_NAME}] Your reply could not be delivered`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="padding: 20px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
          <div style="font-size: 15px; font-weight: 600; color: #92400e;">Your reply was not recorded</div>
          <div style="font-size: 14px; color: #78350f; margin-top: 8px; line-height: 1.5;">
            This question was addressed to someone else, so only they can answer it.
            If it was forwarded to you, please reply to the person who sent it to you instead.
          </div>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">${e.APP_NAME}</p>
      </div>
    `,
    text:
      "Your reply was not recorded.\n\n" +
      "This question was addressed to someone else, so only they can answer it. " +
      "If it was forwarded to you, please reply to the person who sent it to you instead.\n",
  });
}
```

- [ ] **Step 4: Escribir el servicio de ingesta**

Crea `src/services/email-ingest.service.ts`:

```ts
import type { MailboxClient } from "../lib/mailbox";
import {
  classifyRecipients,
  replyAddressConfig,
  type ReplyAddressConfig,
} from "../lib/reply-address";
import { processEmailReply } from "./email-response.service";
import { sendSenderMismatchNotice } from "./query-email.service";

/**
 * Walk the unread messages in the mailbox, hand each reply to the same domain
 * function the provider webhook calls, and decide what happens to the message
 * afterwards.
 *
 * That decision is the whole point of this file. Marking a message read is
 * irreversible from the ingest's side, so it is only done when reprocessing
 * could not possibly help. Anything that a later pass might succeed at is left
 * unread and retried in five minutes.
 *
 * Reprocessing is safe: processEmailReply answers already_answered for a query
 * that has one, so a message that was processed and then failed to be marked
 * read costs a wasted lookup and nothing else.
 */

export interface IngestSummary {
  /** Unread messages the pass looked at. */
  scanned: number;
  /** Replies recorded against their query. */
  processed: number;
  /** Replies from someone other than the target. */
  rejected: number;
  /** Ours, but unusable: malformed address, unknown query, expired, empty. */
  dropped: number;
  /** Somebody else's mail. Left unread and untouched. */
  skipped: number;
  /** Left unread on purpose, to be retried by the next pass. */
  deferred: number;
}

export interface IngestDeps {
  config?: ReplyAddressConfig;
  processReply?: typeof processEmailReply;
  notifySenderMismatch?: (toEmail: string) => Promise<unknown>;
}

export async function ingestPendingReplies(
  client: MailboxClient,
  deps: IngestDeps = {},
): Promise<IngestSummary> {
  const config = deps.config ?? replyAddressConfig();
  const processReply = deps.processReply ?? processEmailReply;
  const notifySenderMismatch = deps.notifySenderMismatch ?? sendSenderMismatchNotice;

  const summary: IngestSummary = {
    scanned: 0,
    processed: 0,
    rejected: 0,
    dropped: 0,
    skipped: 0,
    deferred: 0,
  };

  const uids = await client.listUnread();

  for (const uid of uids) {
    summary.scanned++;

    let message;
    try {
      message = await client.fetch(uid);
    } catch (err) {
      console.error(`[EMAIL-INGEST] Failed to fetch message ${uid}:`, err);
      summary.deferred++;
      continue;
    }

    if (!message) {
      console.warn(`[EMAIL-INGEST] Message ${uid} could not be read; leaving unread`);
      summary.deferred++;
      continue;
    }

    const match = classifyRecipients(message.recipients, config);

    if (match.kind === "foreign") {
      // Not addressed to the reply alias. A person uses this mailbox too.
      summary.skipped++;
      continue;
    }

    if (match.kind === "malformed") {
      console.warn(`[EMAIL-INGEST] Message ${uid} has no usable query id; dropping`);
      await markRead(client, uid);
      summary.dropped++;
      continue;
    }

    let result;
    try {
      result = await processReply({
        queryId: match.queryId,
        senderEmail: message.from,
        replyText: message.text,
      });
    } catch (err) {
      // The database, not the message. Leave it unread and try again in five
      // minutes rather than losing the human's answer.
      console.error(
        `[EMAIL-INGEST] Transient failure on message ${uid} (query ${match.queryId}):`,
        err,
      );
      summary.deferred++;
      continue;
    }

    if ("sender_mismatch" in result) {
      // Say something rather than swallowing the reply in silence.
      try {
        await notifySenderMismatch(message.from);
      } catch (err) {
        console.error(`[EMAIL-INGEST] Could not notify ${message.from}:`, err);
      }
      await markRead(client, uid);
      summary.rejected++;
      continue;
    }

    if ("success" in result) {
      summary.processed++;
    } else {
      // not_found, expired, already_answered, empty_reply — all permanent.
      console.log(`[EMAIL-INGEST] Message ${uid} dropped:`, result);
      summary.dropped++;
    }

    await markRead(client, uid);
  }

  console.log("[EMAIL-INGEST] Pass complete:", summary);
  return summary;
}

/**
 * Marking read is best effort. Failing at it after the reply was recorded is
 * harmless — the next pass sees already_answered — and failing the whole pass
 * over it would be worse.
 */
async function markRead(client: MailboxClient, uid: number): Promise<void> {
  try {
    await client.markRead(uid);
  } catch (err) {
    console.error(`[EMAIL-INGEST] Could not mark message ${uid} read:`, err);
  }
}
```

- [ ] **Step 5: Ejecutar el test y comprobar que pasa**

Run: `bun test tests/unit/email-ingest.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 6: Ejecutar la suite unitaria entera y el typecheck**

Run: `bun test tests/unit`
Expected: PASS

Run: `bunx tsc --noEmit`
Expected: solo los seis errores preexistentes de `src/mcp/server.ts`

- [ ] **Step 7: Commit**

```bash
git add src/services/email-ingest.service.ts tests/unit/email-ingest.test.ts \
  src/services/query-email.service.ts
git commit -m "Add the email ingest service

Walks the unread mail, hands each reply to processEmailReply — the same
function the provider webhook calls — and decides what happens to the
message afterwards.

That decision is the part worth reviewing. A permanent failure is marked
read because retrying it loops forever; a transient one is left unread
because retrying it is the only way the answer survives. Foreign mail is
neither read nor touched: the mailbox belongs to a person too."
```

---

### Task 5: Un cerrojo en Redis alrededor de la pasada

Si una pasada tarda más de cinco minutos, la siguiente arranca encima. Dos
pasadas leen los mismos mensajes y, sobre todo, abren conexiones IMAP de más:
Gmail corta alrededor de quince simultáneas.

**Files:**
- Create: `src/lib/redis-lock.ts`
- Create: `tests/integration/redis-lock.test.ts`
- Modify: `src/services/email-ingest.service.ts` (añadir `runEmailIngestPass`)

**Interfaces:**
- Consumes: `getRedis` (`src/lib/redis.ts`), `ingestPendingReplies` (Task 4).
- Produces:
  - `withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null>` — `null` significa que el cerrojo estaba tomado.
  - `runEmailIngestPass(client: MailboxClient, deps?: IngestDeps): Promise<IngestSummary | null>`
  - Task 6 llama a `runEmailIngestPass` e interpreta `null`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/redis-lock.test.ts`. Necesita Redis (base 1, la de test).

```ts
import { describe, expect, it } from "bun:test";
import { withLock } from "../../src/lib/redis-lock";
import { getRedis } from "../../src/lib/redis";

/**
 * The scheduled poll can overlap with itself if a pass runs long. Overlapping
 * passes duplicate work and, worse, open extra IMAP connections — Gmail cuts
 * off around fifteen at once.
 */

function key(name: string) {
  return `test:lock:${name}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

describe("withLock", () => {
  it("runs the function and returns its value", async () => {
    const result = await withLock(key("runs"), 5_000, async () => "done");
    expect(result).toBe("done");
  });

  it("refuses a second holder while the first is running", async () => {
    const k = key("contended");
    let secondResult: string | null = "not run";

    const first = withLock(k, 5_000, async () => {
      secondResult = await withLock(k, 5_000, async () => "second");
      return "first";
    });

    expect(await first).toBe("first");
    expect(secondResult).toBeNull();
  });

  it("releases the lock so the next pass can take it", async () => {
    const k = key("released");
    expect(await withLock(k, 5_000, async () => "a")).toBe("a");
    expect(await withLock(k, 5_000, async () => "b")).toBe("b");
    expect(await getRedis().get(k)).toBeNull();
  });

  it("releases the lock when the function throws, and lets the error out", async () => {
    const k = key("throws");
    await expect(
      withLock(k, 5_000, async () => {
        throw new Error("pass failed");
      }),
    ).rejects.toThrow("pass failed");

    expect(await withLock(k, 5_000, async () => "after")).toBe("after");
  });

  it("expires on its own so a crashed holder does not block forever", async () => {
    const k = key("expiry");
    await withLock(k, 60_000, async () => {
      const ttl = await getRedis().pttl(k);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60_000);
    });
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `bun test tests/integration/redis-lock.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/redis-lock'`

- [ ] **Step 3: Escribir la implementación**

Crea `src/lib/redis-lock.ts`:

```ts
import { randomUUID } from "crypto";
import { getRedis } from "./redis";

/**
 * Run `fn` only if no one else holds `key`, and return null if someone does.
 *
 * The lock carries a random token and is released with a compare-and-delete, so
 * a holder that overran its TTL cannot delete the lock a later holder took. The
 * TTL is what keeps a crashed process from blocking the key forever, and it
 * should be comfortably longer than the work it guards.
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const redis = getRedis();
  const token = randomUUID();

  const acquired = await redis.set(key, token, "PX", ttlMs, "NX");
  if (acquired !== "OK") return null;

  try {
    return await fn();
  } finally {
    const releaseIfMine = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(releaseIfMine, 1, key, token).catch((err) => {
      console.error(`[LOCK] Could not release ${key}:`, err);
    });
  }
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `bun test tests/integration/redis-lock.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Envolver la pasada de ingesta con el cerrojo**

Al final de `src/services/email-ingest.service.ts`:

```ts
import { withLock } from "../lib/redis-lock";

const INGEST_LOCK_KEY = "lock:email-ingest";

/**
 * Two minutes: four times the five-minute poll interval would be pointless, and
 * anything shorter than a slow pass would let a second one start on top of it.
 * A pass that dies without releasing the lock costs one skipped interval.
 */
const INGEST_LOCK_TTL_MS = 120_000;

/**
 * One pass, under the lock. Returns null when another pass is already running,
 * which is a normal outcome and not an error.
 */
export async function runEmailIngestPass(
  client: MailboxClient,
  deps: IngestDeps = {},
): Promise<IngestSummary | null> {
  return withLock(INGEST_LOCK_KEY, INGEST_LOCK_TTL_MS, () =>
    ingestPendingReplies(client, deps),
  );
}
```

Coloca el `import { withLock }` con el resto de imports, arriba del fichero.

- [ ] **Step 6: Añadir el test de la pasada concurrente**

Al final de `tests/integration/redis-lock.test.ts`, añade el caso que el spec
pide explícitamente. Necesita el doble de buzón, así que impórtalo aquí:

```ts
import { runEmailIngestPass } from "../../src/services/email-ingest.service";
import type { MailboxClient } from "../../src/lib/mailbox";

describe("runEmailIngestPass", () => {
  /** A mailbox that blocks in listUnread until the test lets it go. */
  function blockingMailbox(): { client: MailboxClient; release: () => void } {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      release,
      client: {
        async listUnread() {
          await gate;
          return [];
        },
        async fetch() {
          return null;
        },
        async markRead() {},
        async close() {},
      },
    };
  }

  it("discards a second pass while the first is still running", async () => {
    const { client, release } = blockingMailbox();

    const first = runEmailIngestPass(client);
    // The second pass starts while the first is blocked inside listUnread.
    const second = await runEmailIngestPass({
      async listUnread() {
        throw new Error("the second pass must not reach the mailbox");
      },
      async fetch() {
        return null;
      },
      async markRead() {},
      async close() {},
    });

    expect(second).toBeNull();

    release();
    const summary = await first;
    expect(summary).not.toBeNull();
    expect(summary!.scanned).toBe(0);
  });
});
```

Run: `bun test tests/integration/redis-lock.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 7: Comprobar la suite y el typecheck**

Run: `bun test`
Expected: PASS

Run: `bunx tsc --noEmit`
Expected: solo los seis errores preexistentes de `src/mcp/server.ts`

- [ ] **Step 8: Commit**

```bash
git add src/lib/redis-lock.ts tests/integration/redis-lock.test.ts \
  src/services/email-ingest.service.ts
git commit -m "Run the ingest pass under a Redis lock

A pass that runs longer than the poll interval would otherwise have the next
one start on top of it: duplicated work, and more IMAP connections than Gmail
allows. The lock carries a token and is released with a compare-and-delete,
so an overrunning holder cannot release a lock somebody else now holds."
```

---

### Task 6: El endpoint de sondeo

**Files:**
- Create: `src/routes/internal/email-poll.ts`
- Create: `tests/integration/email-poll.test.ts`
- Modify: `src/env.ts` (añadir `INTERNAL_POLL_SECRET`)
- Modify: `src/app.ts:39,70-71`
- Modify: `tests/setup.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `imapConfig`, `openMailbox` (Task 3); `runEmailIngestPass` (Task 5).
- Produces: `POST /api/v1/internal/email/poll`, y la variable `INTERNAL_POLL_SECRET`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/email-poll.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createTestApp } from "../helpers";

/**
 * Cloud Scheduler cannot sign like a mail provider, so a shared secret in a
 * header is what authenticates this endpoint. It runs the ingest, which records
 * humans' answers, so it must never be callable without one.
 *
 * tests/setup.ts sets INTERNAL_POLL_SECRET and deliberately leaves the IMAP
 * variables unset, which is also the "not configured" case worth asserting.
 */

const SECRET = "test-internal-poll-secret";

describe("POST /api/v1/internal/email/poll", () => {
  const app = createTestApp();

  it("rejects a request with no secret", async () => {
    const res = await app.request("/api/v1/internal/email/poll", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a request with the wrong secret", async () => {
    const res = await app.request("/api/v1/internal/email/poll", {
      method: "POST",
      headers: { "x-internal-secret": "not-the-secret" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a secret that is a prefix of the real one", async () => {
    const res = await app.request("/api/v1/internal/email/poll", {
      method: "POST",
      headers: { "x-internal-secret": SECRET.slice(0, -1) },
    });
    expect(res.status).toBe(401);
  });

  // Criterion 6: with no mailbox configured, the endpoint says so and nothing
  // else in the system behaves differently.
  it("answers 503 when the mailbox is not configured", async () => {
    const res = await app.request("/api/v1/internal/email/poll", {
      method: "POST",
      headers: { "x-internal-secret": SECRET },
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("MAILBOX_NOT_CONFIGURED");
  });

  it("is not reachable with GET", async () => {
    const res = await app.request("/api/v1/internal/email/poll", {
      headers: { "x-internal-secret": SECRET },
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `bun test tests/integration/email-poll.test.ts`
Expected: FAIL — 404 en todos, la ruta no existe

- [ ] **Step 3: Añadir el secreto al esquema de entorno y al setup de tests**

En `src/env.ts`, tras las variables de IMAP que añadió Task 3:

```ts
  IMAP_PASSWORD: z.string().optional(),

  // Shared secret for POST /api/v1/internal/email/poll. Cloud Scheduler cannot
  // sign a request like a mail provider does, so a header secret is what there
  // is. With it unset the endpoint refuses every request, in every environment.
  INTERNAL_POLL_SECRET: z.string().optional(),
```

En `tests/setup.ts`, al final:

```ts
process.env.INTERNAL_POLL_SECRET = "test-internal-poll-secret";
```

Deja las variables `IMAP_*` sin definir: la ausencia de buzón es uno de los
casos que el test comprueba.

- [ ] **Step 4: Escribir la ruta**

Crea `src/routes/internal/email-poll.ts`:

```ts
import { createHash, timingSafeEqual } from "crypto";
import { Hono } from "hono";
import { env } from "../../env";
import { imapConfig, openMailbox, type MailboxClient } from "../../lib/mailbox";
import { runEmailIngestPass } from "../../services/email-ingest.service";

const app = new Hono();

/**
 * POST /api/v1/internal/email/poll
 *
 * Called by Cloud Scheduler every five minutes. Reads the unread mail in the
 * inbound mailbox and records any replies against their queries.
 *
 * This is the scaffold half of inbound email, and it is temporary by design:
 * the day a transactional provider posts to /api/v1/webhooks/email/inbound,
 * this file, src/lib/mailbox.ts, src/services/email-ingest.service.ts and the
 * Scheduler job are deleted, and nothing else changes. See
 * docs/superpowers/specs/2026-08-20-inbound-email-ingestion-design.md.
 */
app.post("/poll", async (c) => {
  const e = env();

  // 1. Authenticate.
  //
  // Unset means refuse, in every environment. The endpoint records a human's
  // answer to an agent's question, so there is no environment in which running
  // it unauthenticated is the convenient default — a developer who wants it
  // locally sets the variable, which .env.example already does.
  const secret = e.INTERNAL_POLL_SECRET;
  const provided = c.req.header("x-internal-secret") ?? "";
  if (!secret || !secretsMatch(provided, secret)) {
    if (!secret) {
      console.error("[EMAIL-POLL] Refusing: no INTERNAL_POLL_SECRET configured");
    }
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid or missing internal secret" } },
      401,
    );
  }

  // 2. Is there a mailbox to read?
  const config = imapConfig();
  if (!config) {
    return c.json(
      {
        error: {
          code: "MAILBOX_NOT_CONFIGURED",
          message: "Inbound mailbox is not configured",
        },
      },
      503,
    );
  }

  // 3. One connection per pass, always closed.
  let client: MailboxClient;
  try {
    client = await openMailbox(config);
  } catch (err) {
    console.error("[EMAIL-POLL] Could not open the mailbox:", err);
    return c.json(
      { error: { code: "MAILBOX_UNAVAILABLE", message: "Could not open the mailbox" } },
      502,
    );
  }

  try {
    const summary = await runEmailIngestPass(client);
    if (!summary) {
      // Another pass holds the lock. Normal, not an error.
      return c.json({ data: { skipped: true, reason: "another pass is running" } });
    }
    return c.json({ data: summary });
  } catch (err) {
    console.error("[EMAIL-POLL] Pass failed:", err);
    return c.json(
      { error: { code: "INGEST_FAILED", message: "Ingest pass failed" } },
      500,
    );
  } finally {
    await client.close().catch((err) => {
      console.error("[EMAIL-POLL] Could not close the mailbox:", err);
    });
  }
});

/**
 * Compare through a digest so the comparison is constant time and the length of
 * the real secret does not leak from the length of the buffers.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export default app;
```

- [ ] **Step 5: Montar la ruta**

En `src/app.ts`, junto al import del webhook (línea 39):

```ts
import emailInboundRoutes from "./routes/webhooks/email-inbound";
import emailPollRoutes from "./routes/internal/email-poll";
```

Y junto a su registro (líneas 70-71):

```ts
  // Webhook routes (public, verified by provider signature)
  app.route("/api/v1/webhooks/email", emailInboundRoutes);

  // Internal routes (called by Cloud Scheduler, authenticated by shared secret)
  app.route("/api/v1/internal/email", emailPollRoutes);
```

- [ ] **Step 6: Ejecutar el test y comprobar que pasa**

Run: `bun test tests/integration/email-poll.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 7: Documentar las variables en `.env.example`**

Al final del fichero:

```
# Inbound email — scaffold, read the mailbox over IMAP
# Unset by default: without these the poll endpoint answers 503 and nothing
# else changes. See docs/operations.md.
IMAP_HOST=
IMAP_PORT=993
IMAP_USER=
IMAP_PASSWORD=
INTERNAL_POLL_SECRET=dev-internal-poll-secret
```

- [ ] **Step 8: Ejecutar toda la suite y el typecheck**

Run: `redis-cli -n 1 FLUSHDB && bun test`
Expected: PASS

Run: `bunx tsc --noEmit`
Expected: solo los seis errores preexistentes de `src/mcp/server.ts`

- [ ] **Step 9: Commit**

```bash
git add src/routes/internal/email-poll.ts tests/integration/email-poll.test.ts \
  src/env.ts src/app.ts tests/setup.ts .env.example
git commit -m "Add the internal email poll endpoint

Cloud Scheduler calls it every five minutes. It authenticates with a shared
secret compared through a digest, because Scheduler cannot sign a request
the way a mail provider does.

An unset secret refuses in every environment, not just production: this
endpoint records a human's answer, so there is no environment where running
it unauthenticated is a reasonable default."
```

---

### Task 7: Puesta en marcha y documentación

El código no sirve de nada hasta que el buzón, las variables y el job existen.
Esta tarea deja escrito lo que hay que hacer fuera del repositorio, y verifica
el camino entero contra el buzón real —lo único que ningún test cubre.

**Files:**
- Modify: `docs/operations.md` (sección nueva)
- Modify: `docs/superpowers/specs/2026-08-20-inbound-email-ingestion-design.md` (estado)
- Modify: `CLAUDE.md` (una línea en «Where things live»)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada de código.

- [ ] **Step 1: Escribir la sección de operaciones**

En `docs/operations.md`, añade esta sección justo antes de «Tres formas de
desplegar, y solo una vigente» (o su equivalente en inglés, `### Three ways to
deploy`). Respeta el idioma del fichero que estés editando:

```markdown
### Inbound email: a scaffold with an exit criterion

Replies to query emails are read out of the `agentdialog.app@gmail.com` mailbox
over IMAP, by a Cloud Scheduler job that calls the API every five minutes. This
is a bridge, not the architecture: `POST /api/v1/webhooks/email/inbound` already
implements the provider→webhook pattern, and the day a transactional provider
sits on a domain we own, there is nothing to build — only to configure.

**Retire the scaffold when** a provider is contracted and the MX records of an
owned domain point at it, or the volume approaches Gmail's ~500/day sending cap,
or someone reports that query emails land in spam. Retiring it is: configure the
provider's webhook and its `INBOUND_EMAIL_WEBHOOK_SECRET`, delete
`src/lib/mailbox.ts`, `src/services/email-ingest.service.ts` and
`src/routes/internal/email-poll.ts`, delete the Scheduler job, and point
`REPLY_LOCAL_PART` and `REPLY_DOMAIN` back at the owned domain. Both paths enter
the domain through `processEmailReply`, so nothing else notices.

Written down because otherwise it becomes permanent by inertia, which is how
almost every scaffold ends.

#### One-time setup

1. In `agentdialog.app@gmail.com`, confirm IMAP is on: Settings → Forwarding and
   POP/IMAP → Enable IMAP.
2. Generate an App Password for that account (requires 2FA, which is on). This
   is the same class of credential as `SMTP_PASS`, which is also an App Password.
3. Store it in Secret Manager rather than as a plain variable:

   ```bash
   printf '%s' '<app-password>' | gcloud secrets create imap-password \
     --project agentdialog --data-file=-
   ```

4. Update the Cloud Run service. **`--update-env-vars`, never `--set-env-vars`** —
   the latter would delete the nineteen variables already on the service:

   ```bash
   gcloud run services update agentdialog-api \
     --project agentdialog --region us-central1 \
     --update-env-vars \
IMAP_HOST=imap.gmail.com,IMAP_PORT=993,IMAP_USER=agentdialog.app@gmail.com,REPLY_LOCAL_PART=agentdialog.app,REPLY_DOMAIN=gmail.com,INTERNAL_POLL_SECRET=<generated> \
     --update-secrets IMAP_PASSWORD=imap-password:latest
   ```

   Generate the poll secret with `openssl rand -hex 32`.

5. Create the Scheduler job:

   ```bash
   gcloud scheduler jobs create http agentdialog-email-poll \
     --project agentdialog --location us-central1 \
     --schedule "*/5 * * * *" \
     --uri "https://api.agentdialog.io/api/v1/internal/email/poll" \
     --http-method POST \
     --headers "x-internal-secret=<the same value>" \
     --attempt-deadline 120s
   ```

`REPLY_LOCAL_PART` and `REPLY_DOMAIN` are what make the change take effect for
new queries: from then on the Reply-To is `agentdialog.app+{queryId}@gmail.com`,
which Gmail delivers to the account's inbox with no DNS involved. Queries sent
before the change carry the old `reply+{queryId}@reply.agentdialog.io`, which
has no MX and never arrived anyway.

#### Checking it

```bash
curl -s -X POST https://api.agentdialog.io/api/v1/internal/email/poll \
  -H "x-internal-secret: $INTERNAL_POLL_SECRET" | jq
```

`{"data":{"scanned":0,...}}` means it connected and the mailbox was empty.
`503 MAILBOX_NOT_CONFIGURED` means the IMAP variables did not reach the service.
`502 MAILBOX_UNAVAILABLE` means they did and Gmail refused them — almost always
the App Password.

`{"data":{"skipped":true}}` means another pass held the lock, which is normal.

Counts in the summary: `processed` recorded a reply, `rejected` was a reply from
someone other than the target, `dropped` was ours but unusable, `skipped` was
somebody else's mail — left unread on purpose — and `deferred` will be retried
by the next pass.
```

- [ ] **Step 2: Actualizar el estado del spec**

En `docs/superpowers/specs/2026-08-20-inbound-email-ingestion-design.md`,
línea 4:

```markdown
**Estado:** implementado — ver `docs/superpowers/plans/2026-08-21-inbound-email-ingestion.md`
```

- [ ] **Step 3: Apuntar el camino en `CLAUDE.md`**

En la sección «Where things live», bajo la línea de `email-response.service.ts`:

```markdown
- Inbound email replies: `src/services/email-response.service.ts`, reached from
  the provider webhook (`src/routes/webhooks/email-inbound.ts`) and from the
  IMAP poll (`src/routes/internal/email-poll.ts` →
  `src/services/email-ingest.service.ts`). The IMAP half is a scaffold with a
  written exit criterion — see `docs/operations.md`.
```

- [ ] **Step 4: Verificar a mano contra el buzón real**

Esto es lo único que ningún test cubre, y la razón por la que el spec dice que
la implementación de `imapflow` se comprueba una vez a mano.

Con `.env` apuntando al buzón real y la base de datos local:

```bash
bun run dev
```

1. Crea una query con tu propia dirección como destinatario:

   ```bash
   curl -s -X POST http://localhost:3000/api/v1/agent/queries \
     -H "Authorization: Bearer $AGENT_KEY" -H "Content-Type: application/json" \
     -d '{"query_type":"validation","question":"Does the IMAP bridge work?","target_human_email":"tu@correo","timeout_minutes":60}' | jq
   ```

2. Comprueba en el correo recibido que el `Reply-To` es
   `agentdialog.app+{queryId}@gmail.com`.
3. Responde desde esa misma dirección.
4. Dispara una pasada:

   ```bash
   curl -s -X POST http://localhost:3000/api/v1/internal/email/poll \
     -H "x-internal-secret: $INTERNAL_POLL_SECRET" | jq
   ```

   Espera `processed: 1`.
5. Lee la query y comprueba que `status` es `answered` y que `answer` es lo que
   escribiste, sin la cita del mensaje original.
6. Repite el sondeo: `scanned: 0`, porque el mensaje quedó marcado como leído.
7. Manda un correo cualquiera a `agentdialog.app@gmail.com`, sondea, y comprueba
   que sigue **sin leer** en el buzón (criterio de aceptación 3).
8. Responde a la query desde otra dirección distinta del destinatario y
   comprueba que llega el aviso y que la query no cambia (criterio 2).

- [ ] **Step 5: Ejecutar la suite completa una última vez**

```bash
redis-cli -n 1 FLUSHDB
bun test
bunx tsc --noEmit
```

Expected: tests PASS; typecheck con solo los seis errores de `src/mcp/server.ts`.

- [ ] **Step 6: Commit**

```bash
git add docs/operations.md docs/superpowers/specs/2026-08-20-inbound-email-ingestion-design.md CLAUDE.md
git commit -m "Document the inbound email scaffold and how to retire it

The setup lives outside the repository — an App Password, five variables on
Cloud Run and a Scheduler job — so it is written down where the rest of the
runbook is, together with the conditions under which it should be deleted."
```

---

## Cobertura de los criterios de aceptación

| Criterio del spec | Dónde se cumple | Dónde se comprueba |
|---|---|---|
| 1. La respuesta del humano llega al agente en menos de seis minutos | Tasks 3-6 | Task 2 (`processEmailReply` de extremo a extremo), Task 4 (ingesta), Task 7 Step 4 (a mano, con latencia real) |
| 2. Una respuesta de otra dirección no modifica la query, y el remitente recibe un aviso | Task 2, Task 4 | `email-reply.test.ts`, `email-ingest.test.ts` («notifies the sender of a mismatch») |
| 3. Correo ajeno no se procesa ni se marca como leído | Task 1 (validación de UUID), Task 4 | `reply-address.test.ts`, `email-ingest.test.ts` («leaves foreign mail untouched») |
| 4. Un fallo de base de datos no pierde la respuesta | Task 4 | `email-ingest.test.ts` («leaves a message unread when processing fails transiently») |
| 5. El endpoint rechaza peticiones sin el secreto | Task 6 | `email-poll.test.ts` (tres casos) |
| 6. Sin credenciales de IMAP, 503 y nada más cambia | Task 3 (`imapConfig` → null), Task 6 | `email-poll.test.ts` («answers 503 when the mailbox is not configured») |
| Sondeos solapados no duplican trabajo | Task 5 | `redis-lock.test.ts` («discards a second pass») |
| Idempotencia de un mensaje reprocesado | ya existía | `email-reply.test.ts` («is idempotent afterwards»), `email-ingest.test.ts` («already answered») |

## Lo que este plan deja fuera, siguiendo el spec

- Un dominio de correo propio con proveedor transaccional. Es el destino, y está
  escrito como criterio de salida en `docs/operations.md`.
- Adjuntos en las respuestas: solo se procesa el texto.
- Notificaciones push por Pub/Sub.
- Un test contra un servidor IMAP real: la implementación de `imapflow` se
  verifica a mano una vez (Task 7, Step 4).
